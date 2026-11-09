// Anti-cheat (FR-17): results no human can produce. Pure: easy to test, and
// the same rules run wherever the stats are computed (game server or worker).
import type { MatchResult } from "./events";

/**
 * The fastest typists sustain about 200 WPM; 250 WPM is ~4 words a second,
 * one every 240 ms, for a whole quote. Above that we assume a bot or a tampered client.
 */
export const MAX_HUMAN_WPM = 250;

export type CheatFlag = "impossible-wpm" | "invalid-wpm";

export function cheatFlags(result: MatchResult): CheatFlag[] {
    if (!Number.isFinite(result.wpm)) return ["invalid-wpm"];
    return result.wpm > MAX_HUMAN_WPM ? ["impossible-wpm"] : [];
}

/** The results with `flags` filled in for the suspicious ones. */
export function withCheatFlags(results: readonly MatchResult[]): MatchResult[] {
    return results.map((r) => {
        const flags = cheatFlags(r);
        return flags.length > 0 ? { ...r, flags } : { ...r };
    });
}
