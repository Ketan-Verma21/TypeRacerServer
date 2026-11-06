import type { ModeId } from "../config/constants";
import type { MatchSummary } from "../domain/events";
import type { GameId } from "../domain/types";

/** Finished rounds, newest first, capped so it never grows forever. */
export interface MatchHistory {
    add(match: MatchSummary): Promise<void>;
    recent(limit: number): Promise<MatchSummary[]>;
    forGame(gameId: GameId): Promise<MatchSummary[]>;
    /** How many races of each mode have started (from match.started). */
    countStarted(mode: ModeId): Promise<void>;
    startedCount(mode: ModeId): Promise<number>;
}
