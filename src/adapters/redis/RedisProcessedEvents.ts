import type { Redis } from "ioredis";
import type { ProcessedEvents } from "../../ports/ProcessedEvents";
import { keys } from "./keys";

/** Redelivered events arrive within minutes; a day of memory is plenty. */
export const PROCESSED_TTL_SECONDS = 24 * 60 * 60;

/**
 * stats:done:{eventId} — SET NX is "claim it if nobody has": one command, so
 * two workers handling the same event can't both win.
 */
export class RedisProcessedEvents implements ProcessedEvents {
    constructor(
        private readonly redis: Redis,
        private readonly ttlSeconds = PROCESSED_TTL_SECONDS,
    ) {}

    async claim(eventId: string): Promise<boolean> {
        const key = keys.processedEvent(eventId);
        return (await this.redis.set(key, "1", "EX", this.ttlSeconds, "NX")) === "OK";
    }

    async release(eventId: string): Promise<void> {
        await this.redis.del(keys.processedEvent(eventId));
    }
}
