import type { Redis } from "ioredis";
import type { ModeId } from "../../config/constants";
import type { MatchSummary } from "../../domain/events";
import type { GameId } from "../../domain/types";
import type { MatchHistory } from "../../ports/MatchHistory";
import { keys, ROOM_TTL_SECONDS } from "./keys";

const parse = (items: string[]): MatchSummary[] =>
    items.map((item) => JSON.parse(item) as MatchSummary);

/**
 * Two capped lists (LPUSH = newest first, LTRIM = keep the last N):
 *   matches:recent     every room, last 500
 *   game:{id}:history  one room, last 20 — expires with the room
 * plus a hash stats:matches (mode -> races started), via HINCRBY.
 */
export class RedisMatchHistory implements MatchHistory {
    constructor(
        private readonly redis: Redis,
        private readonly maxRecent = 500,
        private readonly maxPerGame = 20,
        private readonly roomTtlSeconds = ROOM_TTL_SECONDS,
    ) {}

    async add(match: MatchSummary): Promise<void> {
        const json = JSON.stringify(match);
        const recent = keys.recentMatches();
        const game = keys.history(match.gameId);
        await this.redis
            .multi()
            .lpush(recent, json)
            .ltrim(recent, 0, this.maxRecent - 1)
            .lpush(game, json)
            .ltrim(game, 0, this.maxPerGame - 1)
            .expire(game, this.roomTtlSeconds)
            .exec();
    }

    async recent(limit: number): Promise<MatchSummary[]> {
        return parse(await this.redis.lrange(keys.recentMatches(), 0, limit - 1));
    }

    async forGame(gameId: GameId): Promise<MatchSummary[]> {
        return parse(await this.redis.lrange(keys.history(gameId), 0, -1));
    }

    async countStarted(mode: ModeId): Promise<void> {
        await this.redis.hincrby(keys.matchCounts(), mode, 1);
    }

    async startedCount(mode: ModeId): Promise<number> {
        return Number((await this.redis.hget(keys.matchCounts(), mode)) ?? 0);
    }
}
