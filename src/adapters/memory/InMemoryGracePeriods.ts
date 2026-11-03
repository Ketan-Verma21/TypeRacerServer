import type { GameId, PlayerId } from "../../domain/types";
import type { GracePeriod, GracePeriods } from "../../ports/GracePeriods";

const keyOf = (gameId: GameId, playerId: PlayerId): string => `${gameId}:${playerId}`;

/** One server only (STORE=memory). */
export class InMemoryGracePeriods implements GracePeriods {
    private readonly entries = new Map<string, GracePeriod>();

    async start(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<void> {
        this.entries.set(keyOf(gameId, playerId), { gameId, playerId, expiresAt });
    }

    async cancel(gameId: GameId, playerId: PlayerId): Promise<void> {
        this.entries.delete(keyOf(gameId, playerId));
    }

    async isPending(gameId: GameId, playerId: PlayerId): Promise<boolean> {
        return this.entries.has(keyOf(gameId, playerId));
    }

    async expired(now: number): Promise<GracePeriod[]> {
        return [...this.entries.values()].filter((e) => e.expiresAt <= now).map((e) => ({ ...e }));
    }

    async claim(gameId: GameId, playerId: PlayerId, expiresAt: number): Promise<boolean> {
        const key = keyOf(gameId, playerId);
        if (this.entries.get(key)?.expiresAt !== expiresAt) return false;
        this.entries.delete(key);
        return true;
    }
}
