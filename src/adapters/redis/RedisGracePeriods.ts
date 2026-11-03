import type { Redis } from "ioredis";
import type { GameId, PlayerId } from "../../domain/types";
import type { GracePeriod, GracePeriods } from "../../ports/GracePeriods";
import { keys } from "./keys";
import { runScript } from "./scripts";

const member = (gameId: GameId, playerId: PlayerId): string => `${gameId}:${playerId}`;

/**
 * presence:grace is a sorted set: member = "{gameId}:{playerId}", score = when
 * the grace period runs out. ZRANGEBYSCORE -inf now lists the expired ones;
 * the same compare-and-remove Lua script as the race clock claims each one.
 */
export class RedisGracePeriods implements GracePeriods {
    constructor(private readonly redis: Redis) {}

    async start(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<void> {
        await this.redis.zadd(keys.presenceGrace(), expiresAt, member(gameId, playerId));
    }

    async cancel(gameId: GameId, playerId: PlayerId): Promise<void> {
        await this.redis.zrem(keys.presenceGrace(), member(gameId, playerId));
    }

    async isPending(gameId: GameId, playerId: PlayerId): Promise<boolean> {
        return (await this.redis.zscore(keys.presenceGrace(), member(gameId, playerId))) !== null;
    }

    async expired(now: number): Promise<GracePeriod[]> {
        const flat = await this.redis.zrangebyscore(
            keys.presenceGrace(),
            "-inf",
            now,
            "WITHSCORES",
        );
        const periods: GracePeriod[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) {
            const [gameId, playerId] = flat[i]!.split(":");
            if (gameId && playerId)
                periods.push({ gameId, playerId, expiresAt: Number(flat[i + 1]) });
        }
        return periods;
    }

    async claim(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<boolean> {
        const won = await runScript(
            this.redis,
            "trClaimDue",
            [keys.presenceGrace()],
            [member(gameId, playerId), expiresAt],
        );
        return won === 1;
    }
}
