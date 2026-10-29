import type { Redis } from "ioredis";
import type { GameId } from "../../domain/types";
import type { RaceSchedule, ScheduledGame } from "../../ports/RaceSchedule";
import { keys } from "./keys";
import { runScript } from "./scripts";

const TICK_CLAIM_SECONDS = 5;

/**
 * games:clock is a sorted set: member = game id, score = its next deadline.
 * Claims are single Redis commands, so with N servers exactly one wins:
 *   ZADD NX        start a countdown only once
 *   Lua claim      "remove it if it still has the deadline I saw" -> 1 for one caller
 *   SET NX EX 5    tick:{id}:{label} -> one server sends each second's tick
 */
export class RedisRaceSchedule implements RaceSchedule {
    constructor(private readonly redis: Redis) {}

    async add(gameId: GameId, deadline: number): Promise<boolean> {
        return (await this.redis.zadd(keys.raceClock(), "NX", deadline, gameId)) === 1;
    }

    async remove(gameId: GameId): Promise<void> {
        await this.redis.zrem(keys.raceClock(), gameId);
    }

    async deadlineOf(gameId: GameId): Promise<number | null> {
        const score = await this.redis.zscore(keys.raceClock(), gameId);
        return score === null ? null : Number(score);
    }

    async all(): Promise<ScheduledGame[]> {
        const flat = await this.redis.zrange(keys.raceClock(), 0, -1, "WITHSCORES");
        const games: ScheduledGame[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) {
            games.push({ gameId: flat[i]!, deadline: Number(flat[i + 1]) });
        }
        return games;
    }

    async claim(gameId: GameId, deadline?: number): Promise<boolean> {
        if (deadline === undefined) return (await this.redis.zrem(keys.raceClock(), gameId)) === 1;
        const won = await runScript(
            this.redis,
            "trClaimDue",
            [keys.raceClock()],
            [gameId, deadline],
        );
        return won === 1;
    }

    async claimTick(gameId: GameId, label: string): Promise<boolean> {
        const key = keys.tick(gameId, label);
        return (await this.redis.set(key, "1", "EX", TICK_CLAIM_SECONDS, "NX")) === "OK";
    }
}
