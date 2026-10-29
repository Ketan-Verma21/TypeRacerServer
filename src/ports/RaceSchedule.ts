// PORT: when each running game next needs attention (end of countdown, end of
// race). Shared by every server instance, so any of them can run the clock.
import type { GameId } from "../domain/types";

export interface ScheduledGame {
    gameId: GameId;
    deadline: number; // ms
}

export interface RaceSchedule {
    /** Schedules the game unless it already is. false = already scheduled (by anyone). */
    add(gameId: GameId, deadline: number): Promise<boolean>;
    remove(gameId: GameId): Promise<void>;
    deadlineOf(gameId: GameId): Promise<number | null>;
    all(): Promise<ScheduledGame[]>;
    /**
     * Takes the entry off the schedule; true for exactly ONE caller — the
     * instance that then handles it. With `deadline`, only if the entry still
     * has that deadline (so a slow instance can't claim the next phase's entry).
     */
    claim(gameId: GameId, deadline?: number): Promise<boolean>;
    /** true for exactly one caller per (game, label): decides who sends a tick. */
    claimTick(gameId: GameId, label: string): Promise<boolean>;
}
