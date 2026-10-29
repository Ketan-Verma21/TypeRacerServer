// The Redis connection. One client per process, shared by every Redis adapter.
import { Redis } from "ioredis";
import type { Logger } from "../ports/Logger";

/**
 * ioredis reconnects on its own. `maxRetriesPerRequest: 1` makes commands
 * fail quickly while Redis is down, so a player gets an error reply instead
 * of a request that hangs until Redis comes back.
 */
export function createRedisClient(url: string, logger: Logger): Redis {
    const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
    redis.on("ready", () => logger.info("redis connected"));
    redis.on("error", (err: Error) => logger.warn("redis error", { err: err.message }));
    return redis;
}

/** The one thing the readiness probe needs (easy to fake in tests). */
export interface Pingable {
    ping(): Promise<string>;
}

/** Readiness probe: true only if Redis answers PING within `timeoutMs`. */
export async function isRedisReady(redis: Pingable, timeoutMs = 1000): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
        const pong = redis.ping().then((reply) => reply === "PONG");
        return await Promise.race([pong, timedOut]);
    } catch {
        return false; // a failed PING simply means "not ready"
    } finally {
        clearTimeout(timer);
    }
}
