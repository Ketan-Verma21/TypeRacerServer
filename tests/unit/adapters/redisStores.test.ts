// Redis-only details of the chat and session adapters (the contracts cover the rest).
import { describe, expect, it } from "vitest";
import { keys } from "../../../src/adapters/redis/keys";
import { RedisChatRepository } from "../../../src/adapters/redis/RedisChatRepository";
import { RedisSessionStore } from "../../../src/adapters/redis/RedisSessionStore";
import { createMockRedis } from "../../fakes/mockRedis";

describe("Redis chat and session keys", () => {
    it("expires a room's chat together with the room", async () => {
        const redis = await createMockRedis();
        const chat = new RedisChatRepository(redis, 30, 7200);

        await chat.add("g1", { playerId: "p1", nickname: "Ketan", text: "hi", ts: 0 });

        expect(await redis.ttl(keys.chat("g1"))).toBeGreaterThan(7000);
    });

    it("expires a forgotten session after an hour", async () => {
        const redis = await createMockRedis();
        const sessions = new RedisSessionStore(redis, 3600);

        await sessions.set("s1", { gameId: "g1", playerId: "p1", nickname: "Ketan" });

        const ttl = await redis.ttl(keys.session("s1"));
        expect(ttl).toBeGreaterThan(3500);
        expect(ttl).toBeLessThanOrEqual(3600);
    });
});
