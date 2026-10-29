// Turns games and players into Redis hash fields (all strings) and back.
// Readable in redis-cli: numbers as digits, booleans as "1"/"0",
// arrays/objects (words, settings) as JSON.
import type { Game, GameSettings, Phase, Player, PlayerId } from "../../domain/types";
import type { GameMeta, PlayerUpdate } from "../../ports/GameRepository";

export type HashFields = Record<string, string>;

function toField(value: unknown): string {
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/** Fields to set, and fields to delete (patched with `undefined`). */
export function encodeMeta(patch: Partial<GameMeta>): { set: HashFields; remove: string[] } {
    const set: HashFields = {};
    const remove: string[] = [];
    for (const [field, value] of Object.entries(patch)) {
        if (value === undefined) remove.push(field);
        else set[field] = toField(value);
    }
    return { set, remove };
}

export function encodePlayer(update: PlayerUpdate): HashFields {
    const fields: HashFields = {};
    for (const [field, value] of Object.entries(update)) {
        if (value !== undefined) fields[field] = toField(value);
    }
    return fields;
}

/** Every Player field except `id` (the id is part of the key name). */
export function encodeNewPlayer(player: Player): HashFields {
    const fields = encodePlayer(player);
    delete fields.id;
    return fields;
}

/** True if the hash looks like a stored game (HGETALL returns {} for a missing key). */
export function isGameHash(hash: HashFields): boolean {
    return hash.phase !== undefined && hash.settings !== undefined;
}

export function decodeGame(id: string, hash: HashFields, players: Player[]): Game {
    const game: Game = {
        id,
        phase: hash.phase as Phase,
        words: JSON.parse(hash.words ?? "[]") as string[],
        players,
        settings: JSON.parse(hash.settings ?? "{}") as GameSettings,
        round: Number(hash.round),
        createdAt: Number(hash.createdAt),
    };
    if (hash.startTime !== undefined) game.startTime = Number(hash.startTime);
    return game;
}

export function decodePlayer(id: PlayerId, hash: HashFields): Player {
    return {
        id,
        nickname: hash.nickname ?? "",
        socketId: hash.socketId ?? "",
        isHost: hash.isHost === "1",
        wordIndex: Number(hash.wordIndex ?? 0),
        wpm: Number(hash.wpm ?? -1),
        isSpectator: hash.isSpectator === "1",
        isEliminated: hash.isEliminated === "1",
        mistakes: Number(hash.mistakes ?? 0),
        joinedAt: Number(hash.joinedAt ?? 0),
    };
}
