// Things that happened in a game, as plain data. Published after the fact
// (EventPublisher): to StatsService in-process, or through Kafka (Phase 7).
import type { ModeId } from "../config/constants";
import { isFinished, rankPlayers } from "./rules";
import type { Game, GameId, PlayerId } from "./types";

export interface MatchResult {
    playerId: PlayerId;
    nickname: string;
    wpm: number;
    rank: number; // 1 = winner
    finished: boolean;
    eliminated: boolean;
    /** Set by anti-cheat when the result looks impossible (kept out of the leaderboard). */
    flags?: string[];
}

/** One finished round of one room. */
export interface MatchSummary {
    gameId: GameId;
    round: number;
    mode: ModeId;
    at: number; // ms
    results: MatchResult[];
}

/**
 * Every event has a unique id. A consumer may see the same event twice
 * (at-least-once delivery), so it remembers ids it has already handled.
 */
interface EventBase {
    eventId: string;
    gameId: GameId;
    round: number;
    mode: ModeId;
    at: number; // ms
}

export type MatchStarted = EventBase & { type: "match.started"; racers: number };
export type MatchFinished = EventBase & { type: "match.finished"; results: MatchResult[] };

export type DomainEvent = MatchStarted | MatchFinished;
export type EventType = DomainEvent["type"];

/** The match.started event for a race that just began. */
export function matchStarted(game: Game, eventId: string, at: number): MatchStarted {
    return {
        type: "match.started",
        eventId,
        gameId: game.id,
        round: game.round,
        mode: game.settings.mode,
        at,
        racers: rankPlayers(game).length,
    };
}

/** The match.finished event for a game that just ended. */
export function matchFinished(game: Game, eventId: string, at: number): MatchFinished {
    return {
        type: "match.finished",
        eventId,
        gameId: game.id,
        round: game.round,
        mode: game.settings.mode,
        at,
        results: rankPlayers(game).map((p, index) => ({
            playerId: p.id,
            nickname: p.nickname,
            wpm: p.wpm,
            rank: index + 1,
            finished: isFinished(game, p),
            eliminated: p.isEliminated,
        })),
    };
}
