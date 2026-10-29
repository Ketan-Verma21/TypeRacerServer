import type { Redis } from "ioredis";
import type { ModeId } from "../../config/constants";
import type { Leaderboard, LeaderboardEntry } from "../../ports/Leaderboard";
import { keys } from "./keys";
import { runScript } from "./scripts";

/**
 * leaderboard:{mode} is a sorted set: member = nickname, score = best WPM.
 * Sorted sets keep members ordered by score, so the top 10 is one ZREVRANGE.
 */
export class RedisLeaderboard implements Leaderboard {
    constructor(private readonly redis: Redis) {}

    async record(mode: ModeId, nickname: string, wpm: number): Promise<void> {
        await runScript(this.redis, "trKeepBest", [keys.leaderboard(mode)], [wpm, nickname]);
    }

    async top(mode: ModeId, limit: number): Promise<LeaderboardEntry[]> {
        const flat = await this.redis.zrevrange(keys.leaderboard(mode), 0, limit - 1, "WITHSCORES");
        const entries: LeaderboardEntry[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) {
            entries.push({ nickname: flat[i]!, wpm: Number(flat[i + 1]) });
        }
        return entries;
    }
}
