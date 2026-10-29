// Every Redis key name in one place (Rules §4) — Architecture.md §5.1.
// All keys of one room start with `game:{id}`, so they're easy to find with
// `redis-cli --scan --pattern 'game:ABC123*'`.
import type { ModeId } from "../../config/constants";
import type { GameId, PlayerId } from "../../domain/types";

/** Rooms disappear 2 h after their last change (FR-10). */
export const ROOM_TTL_SECONDS = 2 * 60 * 60;
/** A socket's session outlives any normal connection. */
export const SESSION_TTL_SECONDS = 60 * 60;

// The words of a round live in the game hash (field `words`, JSON), not in a
// key of their own: they're always read together with the game.
export const keys = {
    game: (id: GameId): string => `game:${id}`,
    players: (id: GameId): string => `game:${id}:players`,
    player: (id: GameId, playerId: PlayerId): string => `game:${id}:player:${playerId}`,
    chat: (id: GameId): string => `game:${id}:chat`,
    history: (id: GameId): string => `game:${id}:history`,
    session: (socketId: string): string => `socket:${socketId}`,
    rateLimit: (key: string): string => `rl:${key}`,
    quotePool: (): string => "quotes:pool",
    leaderboard: (mode: ModeId): string => `leaderboard:${mode}`,
    recentMatches: (): string => "matches:recent",
} as const;
