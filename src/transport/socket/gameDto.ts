// The `updateGame` payload. Field names match the v1 Mongo document because
// the Flutter app reads them (`_id`, `WPM`, `socketID`, `isPartyLeader`...).
import type { Game, Player } from "../../domain/types";

export interface PlayerDto {
    _id: string;
    nickname: string;
    socketID: string;
    isPartyLeader: boolean;
    currentWordIndex: number;
    WPM: number;
    isSpectator: boolean;
    isEliminated: boolean;
    mistakes: number;
}

export interface GameDto {
    _id: string;
    words: string[];
    players: PlayerDto[];
    isJoin: boolean; // lobby or countdown
    isOver: boolean;
    startTime?: number;
    settings: Game["settings"];
}

export const toPlayerDto = (p: Player): PlayerDto => ({
    _id: p.id,
    nickname: p.nickname,
    socketID: p.socketId,
    isPartyLeader: p.isHost,
    currentWordIndex: p.wordIndex,
    WPM: p.wpm,
    isSpectator: p.isSpectator,
    isEliminated: p.isEliminated,
    mistakes: p.mistakes,
});

export const toGameDto = (g: Game): GameDto => ({
    _id: g.id,
    words: g.words,
    players: g.players.map(toPlayerDto),
    isJoin: g.phase === "lobby" || g.phase === "countdown",
    isOver: g.phase === "over",
    ...(g.startTime !== undefined ? { startTime: g.startTime } : {}),
    settings: g.settings,
});
