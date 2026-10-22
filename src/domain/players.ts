import { NICKNAME_MAX_LENGTH } from "../config/constants";
import type { Player } from "./types";

/** Trim and cut to 16 characters. Anything that isn't text becomes text. */
export function cleanNickname(raw: unknown): string {
    return String(raw ?? "")
        .trim()
        .slice(0, NICKNAME_MAX_LENGTH);
}

export interface NewPlayer {
    id: string;
    nickname: string;
    socketId: string;
    now: number;
    isHost?: boolean;
    isSpectator?: boolean;
}

export function createPlayer(p: NewPlayer): Player {
    return {
        id: p.id,
        nickname: p.nickname,
        socketId: p.socketId,
        isHost: p.isHost ?? false,
        wordIndex: 0,
        wpm: -1,
        isSpectator: p.isSpectator ?? false,
        isEliminated: false,
        mistakes: 0,
        joinedAt: p.now,
    };
}

/** Back to the start line for a rematch (spectator status is handled by the caller). */
export function resetForNewRound(p: Player): Player {
    return { ...p, wordIndex: 0, wpm: -1, isEliminated: false, mistakes: 0 };
}
