import type { Redis } from "ioredis";
import type { Game, GameId, Player, PlayerId } from "../../domain/types";
import type {
    AddPlayerResult,
    GameMeta,
    GameRepository,
    PlayerUpdate,
} from "../../ports/GameRepository";
import {
    decodeGame,
    decodePlayer,
    encodeMeta,
    encodeNewPlayer,
    encodePlayer,
    isGameHash,
    type HashFields,
} from "./gameCodec";
import { keys, ROOM_TTL_SECONDS } from "./keys";
import { runScript } from "./scripts";

/** HSET-style arguments: { a: "1", b: "2" } -> ["a", "1", "b", "2"] */
const pairs = (fields: HashFields): string[] => Object.entries(fields).flat();

/**
 * Games in Redis (Architecture.md §5.1):
 *   game:{id}               hash   phase, words (JSON), settings (JSON), round, createdAt, startTime, seq
 *   game:{id}:players       zset   player ids, score = join order
 *   game:{id}:player:{pid}  hash   one per player, so a player's typing only writes their own hash
 * Every write refreshes the 2 h TTL, so idle rooms clean themselves up (FR-10).
 */
export class RedisGameRepository implements GameRepository {
    constructor(
        private readonly redis: Redis,
        private readonly ttlSeconds = ROOM_TTL_SECONDS,
    ) {}

    async create(game: Game): Promise<void> {
        const gameKey = keys.game(game.id);
        // HSETNX writes only if the field is new: a cheap "reserve this id".
        const reserved = await this.redis.hsetnx(gameKey, "createdAt", String(game.createdAt));
        if (reserved === 0) throw new Error(`Game ${game.id} already exists`);

        const { players } = game;
        const meta = encodeMeta({
            phase: game.phase,
            words: game.words,
            settings: game.settings,
            round: game.round,
            createdAt: game.createdAt,
            startTime: game.startTime,
        });
        const tx = this.redis.multi(); // the rest is written in one transaction
        tx.hset(gameKey, { ...meta.set, seq: String(players.length) });
        tx.expire(gameKey, this.ttlSeconds);
        players.forEach((player, index) => {
            tx.zadd(keys.players(game.id), index + 1, player.id);
            tx.hset(keys.player(game.id, player.id), encodeNewPlayer(player));
            tx.expire(keys.player(game.id, player.id), this.ttlSeconds);
        });
        tx.expire(keys.players(game.id), this.ttlSeconds);
        await execOrThrow(tx.exec());
    }

    async get(id: GameId): Promise<Game | null> {
        const [hash, playerIds] = await Promise.all([
            this.redis.hgetall(keys.game(id)),
            this.redis.zrange(keys.players(id), 0, -1),
        ]);
        if (!isGameHash(hash)) return null;
        return decodeGame(id, hash, await this.loadPlayers(id, playerIds));
    }

    async exists(id: GameId): Promise<boolean> {
        return (await this.redis.exists(keys.game(id))) === 1;
    }

    async updateMeta(id: GameId, patch: Partial<GameMeta>): Promise<void> {
        const { set, remove } = encodeMeta(patch);
        await runScript(
            this.redis,
            "trUpdateGame",
            [keys.game(id), keys.players(id)],
            [
                this.ttlSeconds,
                keys.player(id, ""),
                Object.keys(set).length,
                ...pairs(set),
                ...remove,
            ],
        );
    }

    async addPlayer(id: GameId, player: Player, maxRacers: number): Promise<AddPlayerResult> {
        const result = await runScript(
            this.redis,
            "trAddPlayer",
            [keys.game(id), keys.players(id), keys.player(id, player.id)],
            [
                player.id,
                maxRacers,
                keys.player(id, ""),
                this.ttlSeconds,
                player.isSpectator ? "1" : "0",
                ...pairs(encodeNewPlayer(player)),
            ],
        );
        if (result === "ok" || result === "full" || result === "not-found") return result;
        throw new Error(`Unexpected addPlayer result: ${String(result)}`);
    }

    async updatePlayer(id: GameId, playerId: PlayerId, patch: PlayerUpdate): Promise<void> {
        await runScript(
            this.redis,
            "trUpdatePlayer",
            [keys.game(id), keys.players(id), keys.player(id, playerId)],
            [this.ttlSeconds, ...pairs(encodePlayer(patch))],
        );
    }

    async removePlayer(id: GameId, playerId: PlayerId): Promise<void> {
        await execOrThrow(
            this.redis
                .multi()
                .zrem(keys.players(id), playerId)
                .del(keys.player(id, playerId))
                .exec(),
        );
    }

    async delete(id: GameId): Promise<void> {
        const playerIds = await this.redis.zrange(keys.players(id), 0, -1);
        await this.redis.del(
            keys.game(id),
            keys.players(id),
            ...playerIds.map((pid) => keys.player(id, pid)),
        );
    }

    /** All player hashes in one round trip (a pipeline), in join order. */
    private async loadPlayers(id: GameId, playerIds: string[]): Promise<Player[]> {
        if (playerIds.length === 0) return [];
        const pipeline = this.redis.pipeline();
        for (const pid of playerIds) pipeline.hgetall(keys.player(id, pid));
        const results = (await pipeline.exec()) ?? [];
        const players: Player[] = [];
        playerIds.forEach((pid, index) => {
            const [err, hash] = results[index] ?? [null, {}];
            if (err) throw err;
            const fields = hash as HashFields;
            // A missing hash (expired) means the player is gone; skip them.
            if (Object.keys(fields).length > 0) players.push(decodePlayer(pid, fields));
        });
        return players;
    }
}

/** MULTI/EXEC reports errors per command instead of throwing; turn them into a throw. */
async function execOrThrow(
    result: Promise<[error: Error | null, result: unknown][] | null>,
): Promise<void> {
    const replies = await result;
    if (replies === null) throw new Error("Redis transaction was aborted");
    const failed = replies.find(([err]) => err !== null);
    if (failed?.[0]) throw failed[0];
}
