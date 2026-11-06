// The same contract suites as the unit tests, against a REAL Redis.
// Runs only with REDIS_TEST_URL set:
//   REDIS_TEST_URL=redis://localhost:6379/15 npm run test:redis
// Plain `npm test` skips this file, so it never needs Docker.
import { setTimeout as sleep } from "node:timers/promises";
import type { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { RedisChatRepository } from "../../src/adapters/redis/RedisChatRepository";
import { RedisGameRepository } from "../../src/adapters/redis/RedisGameRepository";
import { RedisGracePeriods } from "../../src/adapters/redis/RedisGracePeriods";
import { RedisLeaderboard } from "../../src/adapters/redis/RedisLeaderboard";
import { RedisMatchHistory } from "../../src/adapters/redis/RedisMatchHistory";
import { RedisProcessedEvents } from "../../src/adapters/redis/RedisProcessedEvents";
import { RedisRaceSchedule } from "../../src/adapters/redis/RedisRaceSchedule";
import { RedisRateLimiter } from "../../src/adapters/redis/RedisRateLimiter";
import { RedisSessionStore } from "../../src/adapters/redis/RedisSessionStore";
import { runChatRepositoryContract } from "../contract/chatRepository.contract";
import { runGameRepositoryContract } from "../contract/gameRepository.contract";
import { runGracePeriodsContract } from "../contract/gracePeriods.contract";
import { runLeaderboardContract } from "../contract/leaderboard.contract";
import { runMatchHistoryContract } from "../contract/matchHistory.contract";
import { runProcessedEventsContract } from "../contract/processedEvents.contract";
import { runRaceScheduleContract } from "../contract/raceSchedule.contract";
import { runRateLimiterContract } from "../contract/rateLimiter.contract";
import { runSessionStoreContract } from "../contract/sessionStore.contract";
import { makeGame, makePlayer } from "../fakes/builders";
import { connectRealRedis, realRedisUrl } from "../fakes/realRedis";

const url = realRedisUrl();

if (!url) {
    describe.skip("real Redis (set REDIS_TEST_URL to run)", () => {
        it("is skipped", () => {});
    });
} else {
    const redis = connectRealRedis(url);
    const extra: Redis[] = [];
    /** Every test starts from an empty database. */
    const fresh = async (): Promise<Redis> => {
        await redis.flushdb();
        return redis;
    };

    afterAll(async () => {
        await redis.flushdb();
        await Promise.all([redis, ...extra].map((r) => r.quit()));
    });

    runGameRepositoryContract("RedisGameRepository (real Redis)", async () => {
        return new RedisGameRepository(await fresh());
    });
    runChatRepositoryContract(
        "RedisChatRepository (real Redis)",
        async (max) => new RedisChatRepository(await fresh(), max),
    );
    runSessionStoreContract(
        "RedisSessionStore (real Redis)",
        async () => new RedisSessionStore(await fresh()),
    );
    runRateLimiterContract("RedisRateLimiter (real Redis)", async () => ({
        limiter: new RedisRateLimiter(await fresh()),
        wait: async (ms) => {
            await sleep(ms);
        },
    }));
    runLeaderboardContract(
        "RedisLeaderboard (real Redis)",
        async () => new RedisLeaderboard(await fresh()),
    );
    runMatchHistoryContract(
        "RedisMatchHistory (real Redis)",
        async (maxRecent, maxPerGame) =>
            new RedisMatchHistory(await fresh(), maxRecent, maxPerGame),
    );

    runRaceScheduleContract(
        "RedisRaceSchedule (real Redis)",
        async () => new RedisRaceSchedule(await fresh()),
    );

    runGracePeriodsContract(
        "RedisGracePeriods (real Redis)",
        async () => new RedisGracePeriods(await fresh()),
    );

    runProcessedEventsContract(
        "RedisProcessedEvents (real Redis)",
        async () => new RedisProcessedEvents(await fresh()),
    );

    describe("real Redis atomicity", () => {
        it("lets exactly 5 of 10 players in when they join over 10 separate connections", async () => {
            await new RedisGameRepository(await fresh()).create(
                makeGame({ id: "g1", phase: "lobby", players: [] }),
            );
            // One connection per player, like 10 players on different servers.
            const clients = Array.from({ length: 10 }, () => connectRealRedis(url));
            extra.push(...clients);

            const results = await Promise.all(
                clients.map((client, i) =>
                    new RedisGameRepository(client).addPlayer("g1", makePlayer({ id: `p${i}` }), 5),
                ),
            );

            expect(results.filter((r) => r === "ok")).toHaveLength(5);
            expect((await new RedisGameRepository(redis).get("g1"))!.players).toHaveLength(5);
        });
    });
}
