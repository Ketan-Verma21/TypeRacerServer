// The game's data shapes. Plain data only: no methods, no I/O.
import type { ModeId, QuoteLength } from "../config/constants";

export type GameId = string;
export type PlayerId = string;

/** lobby -> countdown -> racing -> over (-> lobby again on rematch) */
export type Phase = "lobby" | "countdown" | "racing" | "over";

export interface GameSettings {
    mode: ModeId;
    timeLimit: number; // seconds
    length: QuoteLength;
    maxPlayers: number;
}

export interface Player {
    id: PlayerId;
    nickname: string;
    socketId: string;
    isHost: boolean;
    wordIndex: number; // how many words are done
    wpm: number; // -1 = not known yet (still racing)
    isSpectator: boolean; // joined after the race started
    isEliminated: boolean; // sudden-death
    mistakes: number;
    joinedAt: number;
}

export interface Game {
    id: GameId;
    phase: Phase;
    words: string[];
    players: Player[];
    settings: GameSettings;
    round: number;
    createdAt: number;
    startTime?: number; // ms, set when the race clock starts
}

/** The fields a game mode may change on a player after a word. */
export type PlayerPatch = Partial<Pick<Player, "wordIndex" | "wpm" | "isEliminated" | "mistakes">>;

export interface ChatMessage {
    playerId: PlayerId;
    nickname: string;
    text: string;
    ts: number;
}

export interface ReactionEvent {
    id: string;
    nickname: string;
    emoji: string;
}

/** What the server remembers about one socket connection. */
export interface Session {
    gameId: GameId;
    playerId: PlayerId;
    nickname: string;
}
