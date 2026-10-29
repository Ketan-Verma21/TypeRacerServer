import type { ModeId } from "../config/constants";

export interface LeaderboardEntry {
    nickname: string;
    wpm: number;
}

/** Best WPM per nickname, per game mode. */
export interface Leaderboard {
    /** Keeps the higher of the stored and the new score. */
    record(mode: ModeId, nickname: string, wpm: number): Promise<void>;
    /** Highest first. */
    top(mode: ModeId, limit: number): Promise<LeaderboardEntry[]>;
}
