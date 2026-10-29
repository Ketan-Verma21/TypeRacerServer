import { Redis } from "ioredis";

/**
 * The real Redis for integration tests and the benchmark, from REDIS_TEST_URL
 * (e.g. redis://localhost:6379/15). Tests wipe that database, so database 0
 * — where the game keeps its data — is refused.
 */
export function realRedisUrl(): string {
    const url = process.env.REDIS_TEST_URL ?? "";
    if (!url) return "";
    const db = new URL(url).pathname.replace("/", "");
    if (db === "" || db === "0") {
        throw new Error("REDIS_TEST_URL must use a spare database, e.g. redis://localhost:6379/15");
    }
    return url;
}

export function connectRealRedis(url: string): Redis {
    return new Redis(url, { maxRetriesPerRequest: 1 });
}
