// Redis-specific behaviour on top of the shared contract suite.
import type { Redis } from "ioredis";
import { beforeEach, describe, expect, it } from "vitest";
import { keys } from "../../../src/adapters/redis/keys";
import { RedisGameRepository } from "../../../src/adapters/redis/RedisGameRepository";
import { makeGame, makePlayer } from "../../fakes/builders";
import { createMockRedis } from "../../fakes/mockRedis";

describe("RedisGameRepository", () => {
    let redis: Redis;
    let repo: RedisGameRepository;

    beforeEach(async () => {
        redis = await createMockRedis();
        repo = new RedisGameRepository(redis, 7200);
    });

    it("lets exactly maxRacers in when many players join at the same moment", async () => {
        await repo.create(makeGame({ id: "g1", phase: "lobby", players: [] }));

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                repo.addPlayer("g1", makePlayer({ id: `p${i}` }), 5),
            ),
        );

        expect(results.filter((r) => r === "ok")).toHaveLength(5);
        expect(results.filter((r) => r === "full")).toHaveLength(5);
        expect((await repo.get("g1"))!.players).toHaveLength(5);
    });

    it("refuses to create a game id that is already taken", async () => {
        await repo.create(makeGame({ id: "g1" }));

        await expect(repo.create(makeGame({ id: "g1" }))).rejects.toThrow("already exists");
    });

    it("gives every key of a new room a TTL", async () => {
        await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));

        for (const key of [keys.game("g1"), keys.players("g1"), keys.player("g1", "a")]) {
            const ttl = await redis.ttl(key);
            expect(ttl).toBeGreaterThan(0);
            expect(ttl).toBeLessThanOrEqual(7200);
        }
    });

    it("refreshes the TTL of the whole room when the game changes", async () => {
        await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));
        await redis.expire(keys.game("g1"), 10);
        await redis.expire(keys.player("g1", "a"), 10);

        await repo.updateMeta("g1", { phase: "over" });

        expect(await redis.ttl(keys.game("g1"))).toBeGreaterThan(10);
        expect(await redis.ttl(keys.player("g1", "a"))).toBeGreaterThan(10);
    });

    it("doesn't create a player hash when updating an unknown player", async () => {
        await repo.create(makeGame({ id: "g1" }));

        await repo.updatePlayer("g1", "ghost", { wordIndex: 3 });

        expect(await redis.exists(keys.player("g1", "ghost"))).toBe(0);
    });

    it("stores readable values (booleans as 1/0, settings as JSON)", async () => {
        await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a", isHost: true })] }));

        const player = await redis.hgetall(keys.player("g1", "a"));
        const game = await redis.hgetall(keys.game("g1"));

        expect(player).toMatchObject({ isHost: "1", isSpectator: "0", wordIndex: "0" });
        expect(JSON.parse(game.settings!)).toMatchObject({ mode: "classic" });
    });

    it("cleans up every key when a game is deleted", async () => {
        await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));

        await repo.delete("g1");

        expect(await redis.keys("game:g1*")).toEqual([]);
    });
});
