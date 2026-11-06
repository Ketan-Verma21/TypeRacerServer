import type { ModeId } from "../config/constants";
import { withCheatFlags } from "../domain/antiCheat";
import type { DomainEvent, MatchFinished, MatchStarted } from "../domain/events";
import type { Leaderboard, LeaderboardEntry } from "../ports/Leaderboard";
import type { MatchHistory } from "../ports/MatchHistory";
import type { ProcessedEvents } from "../ports/ProcessedEvents";

export interface StatsServiceDeps {
    leaderboard: Leaderboard;
    history: MatchHistory;
    processed: ProcessedEvents;
}

export const LEADERBOARD_SIZE = 10;

/**
 * Turns game events into the leaderboard, match history and match counts
 * (FR-12, FR-15, FR-17). Runs in the game server (EVENTS=inprocess) or in the
 * stats-worker behind Kafka (EVENTS=kafka) — same code either way.
 */
export class StatsService {
    constructor(private readonly deps: StatsServiceDeps) {}

    /**
     * Handles an event at most once, even if it is delivered twice. If handling
     * fails, the claim is given back and the error thrown, so the caller (the
     * Kafka consumer) doesn't commit and the event is tried again.
     */
    async onEvent(event: DomainEvent): Promise<void> {
        const { processed } = this.deps;
        if (!(await processed.claim(event.eventId))) return; // seen it already
        try {
            if (event.type === "match.started") await this.countStart(event);
            else await this.recordMatch(event);
        } catch (err) {
            await processed.release(event.eventId);
            throw err;
        }
    }

    async topPlayers(mode: ModeId, limit = LEADERBOARD_SIZE): Promise<LeaderboardEntry[]> {
        return this.deps.leaderboard.top(mode, limit);
    }

    private async countStart(event: MatchStarted): Promise<void> {
        await this.deps.history.countStarted(event.mode);
    }

    private async recordMatch(event: MatchFinished): Promise<void> {
        const results = withCheatFlags(event.results);
        // Only real scores: flagged, eliminated and 0 WPM (typed nothing) don't count.
        for (const r of results) {
            if (!r.flags && !r.eliminated && r.wpm > 0) {
                await this.deps.leaderboard.record(event.mode, r.nickname, r.wpm);
            }
        }
        await this.deps.history.add({
            gameId: event.gameId,
            round: event.round,
            mode: event.mode,
            at: event.at,
            results,
        });
    }
}
