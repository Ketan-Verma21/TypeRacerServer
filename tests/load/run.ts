// Load test: many rooms of bots racing at once, through Nginx.
//   npm run load -- --rooms 5                      # smoke test
//   npm run load -- --rooms 125 --players 8        # target: 1,000 players
// Options: --url (http://localhost:8080) --rooms --players (8) --wpm (60)
//          --time (race seconds, 60) --ramp (ms between room starts, 40)
// Results: printed, and saved as JSON in load-results/.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Metrics, summarize } from "./metrics";
import { playRoom } from "./room";

function option(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const url = option("url", "http://localhost:8080");
const rooms = Number(option("rooms", "5"));
const players = Number(option("players", "8"));
const wpm = Number(option("wpm", "60"));
const timeLimit = Number(option("time", "60"));
const rampMs = Number(option("ramp", "40"));

const metrics = new Metrics();
const startedAt = Date.now();
const out = (line: string): boolean => process.stdout.write(`${line}\n`);
const ms = (v: number): string => `${v.toFixed(1)} ms`;

let lastWords = 0;
const progress = setInterval(() => {
    const secs = Math.round((Date.now() - startedAt) / 1000);
    const rate = (metrics.wordsSent - lastWords) / 5;
    lastWords = metrics.wordsSent;
    const p95 = summarize(metrics.wordLatencies.slice(-5000)).p95;
    out(
        `[${secs}s] sockets ${metrics.connected} · rooms racing ${metrics.roomsStarted - metrics.roomsFinished - metrics.roomsFailed} · ` +
            `${rate.toFixed(0)} words/s · recent p95 ${ms(p95)} · reconnects ${metrics.rejoined}`,
    );
}, 5000);

function report(): void {
    clearInterval(progress);
    const latency = summarize(metrics.wordLatencies);
    const rejoin = summarize(metrics.rejoinTimes);
    const result = {
        when: new Date(startedAt).toISOString(),
        settings: { url, rooms, players, wpm, timeLimit, rampMs },
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        peakSockets: metrics.peakConnected,
        rooms: {
            started: metrics.roomsStarted,
            finished: metrics.roomsFinished,
            failed: metrics.roomsFailed,
        },
        words: { sent: metrics.wordsSent, resent: metrics.wordsResent, confirmed: latency.count },
        wordToBroadcastMs: latency,
        disconnects: metrics.disconnects,
        rejoined: metrics.rejoined,
        rejoinMs: rejoin,
        errors: Object.fromEntries(metrics.errors),
    };
    out("");
    out(`=== ${rooms} rooms × ${players} players via ${url} ===`);
    out(`peak sockets       ${result.peakSockets}`);
    out(
        `rooms              ${result.rooms.finished} finished / ${result.rooms.started} started / ${result.rooms.failed} failed`,
    );
    out(
        `words              ${result.words.confirmed} confirmed / ${result.words.sent} sent (${result.words.resent} resent)`,
    );
    out(
        `word -> broadcast  p50 ${ms(latency.p50)} · p95 ${ms(latency.p95)} · p99 ${ms(latency.p99)} · max ${ms(latency.max)}`,
    );
    out(
        `disconnects        ${result.disconnects} · rejoined ${result.rejoined} (p95 ${ms(rejoin.p95)})`,
    );
    if (metrics.errors.size > 0) out(`errors             ${JSON.stringify(result.errors)}`);
    const dir = path.join(process.cwd(), "load-results");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `run-${result.when.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2));
    out(`saved              ${path.relative(process.cwd(), file)}`);
}

process.on("SIGINT", () => {
    report();
    process.exit(130);
});

async function main(): Promise<void> {
    out(
        `starting ${rooms} rooms × ${players} players (${wpm} WPM, ${timeLimit} s races) -> ${url}`,
    );
    const options = { url, players, wordIntervalMs: 60_000 / wpm, timeLimit };
    await Promise.all(
        Array.from({ length: rooms }, (_, i) =>
            new Promise((r) => setTimeout(r, i * rampMs)).then(() =>
                playRoom(i + 1, options, metrics),
            ),
        ),
    );
    report();
    process.exit(0);
}

void main();
