import {
    MAX_PLAYERS_LIMIT,
    MODE_IDS,
    QUOTE_LENGTHS,
    TIME_LIMITS,
    type ModeId,
    type QuoteLength,
} from "../config/constants";
import type { GameSettings } from "./types";

const isModeId = (v: unknown): v is ModeId => MODE_IDS.includes(v as ModeId);
const isLength = (v: unknown): v is QuoteLength =>
    typeof v === "string" && Object.prototype.hasOwnProperty.call(QUOTE_LENGTHS, v);
const isTimeLimit = (v: number): boolean => (TIME_LIMITS as readonly number[]).includes(v);

/**
 * Apply the host's requested settings. Unknown or invalid values keep the
 * current value; maxPlayers can't go below the racers already in the room
 * or above the hard limit.
 */
export function normalizeSettings(
    requested: Record<string, unknown>,
    current: GameSettings,
    racerCount: number,
): GameSettings {
    const timeLimit = Number(requested.timeLimit);
    const maxPlayers = parseInt(String(requested.maxPlayers), 10);
    return {
        mode: isModeId(requested.mode) ? requested.mode : current.mode,
        timeLimit: isTimeLimit(timeLimit) ? timeLimit : current.timeLimit,
        length: isLength(requested.length) ? requested.length : current.length,
        maxPlayers: Math.min(
            MAX_PLAYERS_LIMIT,
            Math.max(racerCount, Number.isNaN(maxPlayers) ? current.maxPlayers : maxPlayers),
        ),
    };
}
