import type { ModeId } from "../config/constants";
import type { DomainEvent, MatchFinished, MatchSummary } from "../domain/events";
import type { Leaderboard, LeaderboardEntry } from "../ports/Leaderboard";
import type { MatchHistory } from "../ports/MatchHistory";

export interface StatsServiceDeps {
    leaderboard: Leaderboard;
    history: MatchHistory;
}

export const LEADERBOARD_SIZE = 10;

/** Turns finished races into the leaderboard and match history (FR-12, FR-15). */
export class StatsService {
    constructor(private readonly deps: StatsServiceDeps) {}

    /** Subscribed to the EventPublisher. */
    async onEvent(event: DomainEvent): Promise<void> {
        if (event.type === "match.finished") await this.recordMatch(event);
    }

    async topPlayers(mode: ModeId, limit = LEADERBOARD_SIZE): Promise<LeaderboardEntry[]> {
        return this.deps.leaderboard.top(mode, limit);
    }

    private async recordMatch(event: MatchFinished): Promise<void> {
        const match: MatchSummary = {
            gameId: event.gameId,
            round: event.round,
            mode: event.mode,
            at: event.at,
            results: event.results,
        };
        // Only real scores: eliminated players and 0 WPM (typed nothing) don't count.
        for (const r of match.results) {
            if (!r.eliminated && r.wpm > 0) {
                await this.deps.leaderboard.record(match.mode, r.nickname, r.wpm);
            }
        }
        await this.deps.history.add(match);
    }
}
