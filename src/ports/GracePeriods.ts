// PORT: players who dropped and have until `expiresAt` to come back.
// Shared by every server instance, so a player can drop on one server and
// reconnect on another.
import type { GameId, PlayerId } from "../domain/types";

export interface GracePeriod {
    gameId: GameId;
    playerId: PlayerId;
    expiresAt: number; // ms
}

export interface GracePeriods {
    /** Starts (or restarts) a player's grace period. */
    start(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<void>;
    cancel(gameId: GameId, playerId: PlayerId): Promise<void>;
    isPending(gameId: GameId, playerId: PlayerId): Promise<boolean>;
    /** Grace periods that have run out by `now`. */
    expired(now: number): Promise<GracePeriod[]>;
    /**
     * Takes an expired entry; true for exactly ONE caller, and only if it still
     * has that expiry (a player who dropped again got a new one).
     */
    claim(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<boolean>;
}
