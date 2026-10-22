import type { Redis } from "ioredis";
import RedisMock from "ioredis-mock";

/**
 * A fake Redis in memory (runs our Lua scripts too). ioredis-mock instances
 * share their data, so every call starts from an empty database.
 */
export async function createMockRedis(): Promise<Redis> {
    const redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
    return redis;
}
