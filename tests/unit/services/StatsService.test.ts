import { describe, expect, it, vi } from "vitest";
import { InProcessEventPublisher } from "../../../src/adapters/events/InProcessEventPublisher";
import { InMemoryLeaderboard } from "../../../src/adapters/memory/InMemoryLeaderboard";
import { InMemoryMatchHistory } from "../../../src/adapters/memory/InMemoryMatchHistory";
import { InMemoryProcessedEvents } from "../../../src/adapters/memory/InMemoryProcessedEvents";
import type { MatchFinished, MatchResult, MatchStarted } from "../../../src/domain/events";
import { StatsService } from "../../../src/services/StatsService";
import { createTestApp } from "../../fakes/testApp";

/** Lets fire-and-forget work (the stats write) finish. */
const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

const result = (nickname: string, wpm: number, o: Partial<MatchResult> = {}): MatchResult => ({
    playerId: nickname,
    nickname,
    wpm,
    rank: 1,
    finished: true,
    eliminated: false,
    ...o,
});

const finished = (results: MatchResult[], eventId = "e1"): MatchFinished => ({
    type: "match.finished",
    eventId,
    gameId: "g1",
    round: 1,
    mode: "classic",
    at: 0,
    results,
});

function newStats() {
    const leaderboard = new InMemoryLeaderboard();
    const history = new InMemoryMatchHistory();
    const processed = new InMemoryProcessedEvents();
    return Object.assign(new StatsService({ leaderboard, history, processed }), {
        leaderboard,
        history,
        processed,
    });
}

describe("StatsService", () => {
    it("puts real scores on the leaderboard and the match in the history", async () => {
        const leaderboard = new InMemoryLeaderboard();
        const history = new InMemoryMatchHistory();
        const stats = new StatsService({
            leaderboard,
            history,
            processed: new InMemoryProcessedEvents(),
        });

        await stats.onEvent(finished([result("Ana", 72), result("Ben", 55)]));

        expect(await stats.topPlayers("classic")).toEqual([
            { nickname: "Ana", wpm: 72 },
            { nickname: "Ben", wpm: 55 },
        ]);
        expect(await history.recent(10)).toHaveLength(1);
    });

    it("leaves eliminated players and 0 WPM off the leaderboard", async () => {
        const stats = newStats();

        await stats.onEvent(finished([result("Out", 90, { eliminated: true }), result("Idle", 0)]));

        expect(await stats.topPlayers("classic")).toEqual([]);
    });
});

describe("StatsService with redelivered events and cheaters", () => {
    it("counts an event delivered twice only once", async () => {
        const stats = newStats();
        const event = finished([result("Ana", 72)], "same-id");

        await stats.onEvent(event);
        await stats.onEvent(event); // e.g. Kafka redelivers after a worker crash

        expect(await stats.history.recent(10)).toHaveLength(1);
    });

    it("keeps an impossible score off the leaderboard but in the history, flagged", async () => {
        const stats = newStats();

        await stats.onEvent(finished([result("Bot", 400), result("Ana", 80)]));

        expect(await stats.topPlayers("classic")).toEqual([{ nickname: "Ana", wpm: 80 }]);
        const [match] = await stats.history.recent(1);
        expect(match!.results[0]).toMatchObject({ nickname: "Bot", flags: ["impossible-wpm"] });
    });

    it("counts started races per mode", async () => {
        const stats = newStats();
        const started: MatchStarted = {
            type: "match.started",
            eventId: "s1",
            gameId: "g1",
            round: 1,
            mode: "classic",
            at: 0,
            racers: 4,
        };

        await stats.onEvent(started);

        expect(await stats.history.startedCount("classic")).toBe(1);
    });

    it("gives the claim back when a write fails, so a retry can succeed", async () => {
        const stats = newStats();
        const event = finished([result("Ana", 72)], "retry-me");
        const add = stats.history.add.bind(stats.history);
        let failOnce = true;
        stats.history.add = async (m) => {
            if (failOnce) {
                failOnce = false;
                throw new Error("Redis down");
            }
            return add(m);
        };

        await expect(stats.onEvent(event)).rejects.toThrow("Redis down");
        await stats.onEvent(event); // the retry

        expect(await stats.history.recent(10)).toHaveLength(1);
    });
});

describe("InProcessEventPublisher", () => {
    it("logs a failing subscriber, still runs the others, and never rejects", async () => {
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const events = new InProcessEventPublisher(logger);
        const seen: string[] = [];
        events.subscribe(() => {
            throw new Error("Redis down");
        });
        events.subscribe((e) => {
            seen.push(e.type);
        });

        await expect(events.publish(finished([]))).resolves.toBeUndefined();
        expect(seen).toEqual(["match.finished"]);
        expect(logger.error).toHaveBeenCalledOnce();
    });
});

describe("a finished race", () => {
    it("publishes match.finished with the ranking, and updates the leaderboard", async () => {
        const app = createTestApp();
        const { host, guests } = await app.lobbyWith("Ana");
        await app.startRace(host);

        app.clock.advance(6_000); // 4 words in 6 s = 40 WPM
        await app.typeAll(guests[0]!);
        app.clock.advance(6_000); // 4 words in 12 s = 20 WPM
        await app.typeAll(host);
        await settle();

        expect(app.published.map((e) => e.type)).toEqual(["match.started", "match.finished"]);
        expect(app.published[1]).toMatchObject({
            type: "match.finished",
            round: 1,
            mode: "classic",
            results: [
                { nickname: "Ana", wpm: 40, rank: 1, finished: true },
                { nickname: "Host", wpm: 20, rank: 2, finished: true },
            ],
        });
        expect(await app.statsService.topPlayers("classic")).toEqual([
            { nickname: "Ana", wpm: 40 },
            { nickname: "Host", wpm: 20 },
        ]);
    });
});
