import type { Redis } from "ioredis";
import type { Session } from "../../domain/types";
import type { SessionStore } from "../../ports/SessionStore";
import { keys, SESSION_TTL_SECONDS } from "./keys";

/**
 * socket:{socketId} -> hash { gameId, playerId, nickname }.
 * In Redis (not in process memory), so any server instance can look up any
 * socket — needed once there are several instances (Phase 5).
 */
export class RedisSessionStore implements SessionStore {
    constructor(
        private readonly redis: Redis,
        private readonly ttlSeconds = SESSION_TTL_SECONDS,
    ) {}

    async get(socketId: string): Promise<Session | null> {
        const { gameId, playerId, nickname } = await this.redis.hgetall(keys.session(socketId));
        if (gameId === undefined || playerId === undefined || nickname === undefined) return null;
        return { gameId, playerId, nickname };
    }

    async set(socketId: string, session: Session): Promise<void> {
        const key = keys.session(socketId);
        await this.redis
            .multi()
            .del(key) // replace, don't merge with an older session
            .hset(key, { ...session })
            .expire(key, this.ttlSeconds)
            .exec();
    }

    async delete(socketId: string): Promise<void> {
        await this.redis.del(keys.session(socketId));
    }
}
