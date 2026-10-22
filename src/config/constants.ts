// Game rules and limits shared by the whole server.
// `as const` keeps the exact values as types (e.g. ModeId = "classic" | ...).

export const MODE_IDS = ["classic", "no-mistakes", "sudden-death"] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const TIME_LIMITS = [30, 60, 90, 120] as const; // seconds
export type TimeLimit = (typeof TIME_LIMITS)[number];

export const QUOTE_LENGTHS = { short: 12, medium: 25, long: 45 } as const; // minimum words
export type QuoteLength = keyof typeof QUOTE_LENGTHS;

export const REACTIONS = ["😂", "🔥", "👏", "😮", "💀", "❤️"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const MAX_PLAYERS_LIMIT = 8;
export const DEFAULT_SETTINGS = {
    mode: "classic",
    timeLimit: 120,
    length: "medium",
    maxPlayers: 5,
} as const;

export const COUNTDOWN_SECONDS = 5;
export const RECONNECT_GRACE_MS = 15_000;
export const CHAT_HISTORY_SIZE = 30;
export const CHAT_MAX_LENGTH = 140;
export const NICKNAME_MAX_LENGTH = 16;
export const CHAT_MIN_INTERVAL_MS = 500;
export const REACTION_MIN_INTERVAL_MS = 200;
