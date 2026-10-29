import { describe, expect, it } from "vitest";
import { InMemoryGameRepository } from "../../src/adapters/memory/InMemoryGameRepository";
import { RedisGameRepository } from "../../src/adapters/redis/RedisGameRepository";
import { RedisSessionStore } from "../../src/adapters/redis/RedisSessionStore";
import { createStores } from "../../src/container";
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
