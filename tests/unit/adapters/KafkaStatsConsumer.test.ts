import { describe, expect, it } from "vitest";
import {
    type ConsumedMessage,
    type ConsumerClient,
    KafkaStatsConsumer,
} from "../../../src/adapters/kafka/KafkaStatsConsumer";
import { decodeEvent } from "../../../src/adapters/kafka/decodeEvent";
import { InMemoryLeaderboard } from "../../../src/adapters/memory/InMemoryLeaderboard";
import { InMemoryMatchHistory } from "../../../src/adapters/memory/InMemoryMatchHistory";
import { InMemoryProcessedEvents } from "../../../src/adapters/memory/InMemoryProcessedEvents";
import type { MatchFinished, MatchStarted, MatchSummary } from "../../../src/domain/events";
import type { LogMeta, Logger } from "../../../src/ports/Logger";
import { StatsService } from "../../../src/services/StatsService";

/** Records subscriptions and commits; the test feeds messages through handle(). */
class FakeConsumer implements ConsumerClient {
    topics: string[] = [];
    commits: { topic: string; partition: number; offset: string }[] = [];
    handler?: (payload: ConsumedMessage) => Promise<void>;

    async subscribe({ topics }: { topics: string[] }): Promise<void> {
        this.topics = topics;
    }
    async run(config: { eachMessage: (p: ConsumedMessage) => Promise<void> }): Promise<void> {
        this.handler = config.eachMessage;
    }
    async commitOffsets(offsets: { topic: string; partition: number; offset: string }[]) {
        this.commits.push(...offsets);
    }
}

/** Match history whose writes fail the first `failures` times (Redis down). */
class FlakyHistory extends InMemoryMatchHistory {
    constructor(public failures: number) {
        super();
    }
    override async add(match: MatchSummary): Promise<void> {
        if (this.failures > 0) {
            this.failures--;
            throw new Error("redis down");
        }
        return super.add(match);
    }
}

class RecordingLogger implements Logger {
    readonly lines: { level: string; message: string; meta?: LogMeta }[] = [];
    info(message: string, meta?: LogMeta): void {
        this.lines.push({ level: "info", message, meta });
    }
    warn(message: string, meta?: LogMeta): void {
        this.lines.push({ level: "warn", message, meta });
    }
    error(message: string, meta?: LogMeta): void {
        this.lines.push({ level: "error", message, meta });
    }
}

const finished: MatchFinished = {
    type: "match.finished",
    eventId: "ev-1",
    gameId: "ROOM01",
    round: 1,
    mode: "classic",
    at: 5000,
    results: [
        {
            playerId: "p1",
            nickname: "Ketan",
            wpm: 92,
            rank: 1,
            finished: true,
            eliminated: false,
        },
    ],
};

const started: MatchStarted = {
    type: "match.started",
    eventId: "ev-0",
    gameId: "ROOM01",
    round: 1,
    mode: "classic",
    at: 1000,
    racers: 1,
};

function msg(value: unknown, offset: string, partition = 0): ConsumedMessage {
    const topic = typeof value === "object" && value && "type" in value ? String(value.type) : "x";
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    return { topic, partition, message: { value: Buffer.from(raw), offset } };
}

function setup(failures = 0) {
    const consumer = new FakeConsumer();
    const leaderboard = new InMemoryLeaderboard();
    const history = new FlakyHistory(failures);
    const stats = new StatsService({
        leaderboard,
        history,
        processed: new InMemoryProcessedEvents(),
    });
    const logger = new RecordingLogger();
    const worker = new KafkaStatsConsumer(consumer, stats, logger, {
        firstDelayMs: 1,
        maxDelayMs: 4,
    });
    return { consumer, leaderboard, history, logger, worker };
}

describe("KafkaStatsConsumer", () => {
    it("subscribes to both topics and handles messages from run()", async () => {
        const { consumer, worker, history } = setup();

        await worker.start();
        await consumer.handler!(msg(started, "0"));

        expect(consumer.topics).toEqual(["match.started", "match.finished"]);
        expect(await history.startedCount("classic")).toBe(1);
    });

    it("saves the stats, then commits the next offset", async () => {
        const { consumer, leaderboard, history, worker } = setup();

        await worker.handle(msg(finished, "41"));

        expect(await leaderboard.top("classic", 10)).toEqual([{ nickname: "Ketan", wpm: 92 }]);
        expect(await history.recent(10)).toHaveLength(1);
        expect(consumer.commits).toEqual([{ topic: "match.finished", partition: 0, offset: "42" }]);
    });

    it("counts a redelivered event once, and commits both deliveries", async () => {
        const { consumer, history, worker } = setup();

        await worker.handle(msg(finished, "7"));
        await worker.handle(msg(finished, "7")); // the worker died before its commit

        expect(await history.recent(10)).toHaveLength(1);
        expect(consumer.commits.map((c) => c.offset)).toEqual(["8", "8"]);
    });

    it("keeps retrying while Redis is down, and commits only after it worked", async () => {
        const { consumer, history, logger, worker } = setup(3);

        await worker.handle(msg(finished, "3"));

        expect(logger.lines.filter((l) => l.level === "warn")).toHaveLength(3);
        expect(await history.recent(10)).toHaveLength(1);
        expect(consumer.commits).toEqual([{ topic: "match.finished", partition: 0, offset: "4" }]);
    });

    it("does not commit when it is stopped mid-retry", async () => {
        const { consumer, history, worker } = setup(Infinity);

        const handling = worker.handle(msg(finished, "3"));
        await new Promise((resolve) => setTimeout(resolve, 10));
        worker.stop();
        await handling;

        expect(await history.recent(10)).toHaveLength(0);
        expect(consumer.commits).toEqual([]);
    });

    it("skips a broken message (logs it, commits past it) instead of blocking", async () => {
        const { consumer, logger, worker } = setup();

        await worker.handle(msg("{not json", "9"));

        expect(logger.lines).toContainEqual(
            expect.objectContaining({ level: "error", message: "skipping bad message" }),
        );
        expect(consumer.commits.map((c) => c.offset)).toEqual(["10"]);
    });
});

describe("decodeEvent", () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v));

    it("reads back what the publisher wrote", () => {
        expect(decodeEvent(encode(finished))).toEqual({ ok: true, event: finished });
        expect(decodeEvent(encode(started))).toEqual({ ok: true, event: started });
    });

    it.each([
        ["an empty message", null],
        ["not JSON", Buffer.from("hello")],
        ["an unknown type", encode({ ...started, type: "match.paused" })],
        ["an unknown mode", encode({ ...started, mode: "turbo" })],
        ["a missing eventId", encode({ ...finished, eventId: undefined })],
        ["a negative wpm", encode({ ...finished, results: [{ ...finished.results[0], wpm: -1 }] })],
    ])("rejects %s", (_name, value) => {
        expect(decodeEvent(value).ok).toBe(false);
    });
});
