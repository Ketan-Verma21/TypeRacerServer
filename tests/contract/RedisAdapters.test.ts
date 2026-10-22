import { setTimeout as sleep } from "node:timers/promises";
import { RedisChatRepository } from "../../src/adapters/redis/RedisChatRepository";
import { RedisRateLimiter } from "../../src/adapters/redis/RedisRateLimiter";
import { RedisSessionStore } from "../../src/adapters/redis/RedisSessionStore";
import { createMockRedis } from "../fakes/mockRedis";
import { runChatRepositoryContract } from "./chatRepository.contract";
import { runRateLimiterContract } from "./rateLimiter.contract";
import { runSessionStoreContract } from "./sessionStore.contract";

runChatRepositoryContract(
    "RedisChatRepository (ioredis-mock)",
    async (max) => new RedisChatRepository(await createMockRedis(), max),
);
runSessionStoreContract(
    "RedisSessionStore (ioredis-mock)",
    async () => new RedisSessionStore(await createMockRedis()),
);
runRateLimiterContract("RedisRateLimiter (ioredis-mock)", async () => ({
    limiter: new RedisRateLimiter(await createMockRedis()),
    wait: async (ms) => {
        await sleep(ms);
    },
}));
