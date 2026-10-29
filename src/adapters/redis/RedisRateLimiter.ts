import type { Redis } from "ioredis";
import type { RateLimiter } from "../../ports/RateLimiter";
import { keys } from "./keys";

/**
 * One call per `intervalMs` per key, in a single command:
 * SET rl:{key} 1 PX {intervalMs} NX — "set it only if it isn't there, and
 * let it disappear after intervalMs". OK = allowed; null = still blocked.
 */
export class RedisRateLimiter implements RateLimiter {
    constructor(private readonly redis: Redis) {}

    async allow(key: string, intervalMs: number): Promise<boolean> {
        const result = await this.redis.set(keys.rateLimit(key), "1", "PX", intervalMs, "NX");
        return result === "OK";
    }
}
