import { describe, expect, it } from "vitest";
import { InProcessEventPublisher } from "../../src/adapters/events/InProcessEventPublisher";
import { KafkaEventPublisher } from "../../src/adapters/kafka/KafkaEventPublisher";
import { InMemoryGameRepository } from "../../src/adapters/memory/InMemoryGameRepository";
import { RedisGameRepository } from "../../src/adapters/redis/RedisGameRepository";
import { RedisSessionStore } from "../../src/adapters/redis/RedisSessionStore";
import { createEventPublisher, createStores } from "../../src/container";
import type { Logger } from "../../src/ports/Logger";
import { StatsService } from "../../src/services/StatsService";
import { FakeClock } from "../fakes/FakeClock";
import { createMockRedis } from "../fakes/mockRedis";

describe("createStores", () => {
    it("uses the in-memory adapters for STORE=memory", () => {
        const stores = createStores("memory", new FakeClock());

        expect(stores.games).toBeInstanceOf(InMemoryGameRepository);
    });

    it("uses the Redis adapters for STORE=redis", async () => {
        const stores = createStores("redis", new FakeClock(), await createMockRedis());

        expect(stores.games).toBeInstanceOf(RedisGameRepository);
        expect(stores.sessions).toBeInstanceOf(RedisSessionStore);
    });

    it("refuses STORE=redis without a Redis client", () => {
        expect(() => createStores("redis", new FakeClock())).toThrow("needs a Redis client");
    });
});

describe("createEventPublisher", () => {
    const logger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
    const stores = createStores("memory", new FakeClock());
    const stats = new StatsService({
        leaderboard: stores.leaderboard,
        history: stores.history,
        processed: stores.processed,
    });
    const producer = { send: async () => [] };

    it("updates stats in this process for EVENTS=inprocess", () => {
        expect(createEventPublisher("inprocess", logger, stats)).toBeInstanceOf(
            InProcessEventPublisher,
        );
    });

    it("sends to Kafka for EVENTS=kafka", () => {
        expect(createEventPublisher("kafka", logger, stats, producer)).toBeInstanceOf(
            KafkaEventPublisher,
        );
    });

    it("refuses EVENTS=kafka without a producer", () => {
        expect(() => createEventPublisher("kafka", logger, stats)).toThrow(
            "needs a Kafka producer",
        );
    });
});
