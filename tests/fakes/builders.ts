// Test data builders: make a valid player/game, then override only what
// the test cares about. Keeps tests short and readable.
import { DEFAULT_SETTINGS } from "../../src/config/constants";
import type { Game, Player } from "../../src/domain/types";

let nextId = 1;

export function makePlayer(overrides: Partial<Player> = {}): Player {
    const id = overrides.id ?? `p${nextId++}`;
    return {
        id,
        nickname: id,
        socketId: `socket-${id}`,
        isHost: false,
        wordIndex: 0,
        wpm: -1,
        isSpectator: false,
        isEliminated: false,
        mistakes: 0,
        joinedAt: 0,
        ...overrides,
    };
}

export const WORDS = ["the", "quick", "brown", "fox"];

export function makeGame(overrides: Partial<Game> = {}): Game {
    return {
        id: "game-1",
        phase: "racing",
        words: [...WORDS],
        players: [],
        settings: { ...DEFAULT_SETTINGS },
        round: 1,
        createdAt: 0,
        startTime: 0,
        ...overrides,
    };
}

/** Shortcuts for common player states in a WORDS-long race. */
export const racing = (wordIndex = 1, o: Partial<Player> = {}) => makePlayer({ wordIndex, ...o });
export const finished = (o: Partial<Player> = {}) => makePlayer({ wordIndex: WORDS.length, ...o });
export const out = (o: Partial<Player> = {}) =>
    makePlayer({ wordIndex: 1, isEliminated: true, ...o });
export const spectator = (o: Partial<Player> = {}) => makePlayer({ isSpectator: true, ...o });
