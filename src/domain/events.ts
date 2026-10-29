// Things that happened in a game, as plain data. Published after the fact
// (EventPublisher) for stats now and Kafka consumers in Phase 7.
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
}

/** One finished round of one room. */
export interface MatchSummary {
    gameId: GameId;
    round: number;
    mode: ModeId;
    at: number; // ms
    results: MatchResult[];
}

export type MatchFinished = MatchSummary & { type: "match.finished" };

/** Every event type (more arrive in Phase 7). */
export type DomainEvent = MatchFinished;

/** The match.finished event for a game that just ended. */
export function matchFinished(game: Game, at: number): MatchFinished {
    return {
        type: "match.finished",
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
