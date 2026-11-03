import { RECONNECT_GRACE_MS } from "../config/constants";
import type { GameId, PlayerId } from "../domain/types";
import type { Clock } from "../ports/Clock";
import type { GracePeriods } from "../ports/GracePeriods";

export interface PresenceServiceDeps {
    grace: GracePeriods;
    clock: Clock;
    /** What happens when time is up (GameService.leaveGame). */
    onExpire: (gameId: GameId, playerId: PlayerId) => Promise<void>;
    /** One player failing must not stop the others. */
    onError: (err: unknown) => void;
}

/**
 * A dropped player gets a grace period to come back before being removed.
 * The periods are stored (in Redis with STORE=redis) and expired by the
 * Sweeper on any instance, so reconnecting to a different server works.
 */
export class PresenceService {
    constructor(
        private readonly deps: PresenceServiceDeps,
        private readonly graceMs = RECONNECT_GRACE_MS,
    ) {}

    async disconnected(gameId: GameId, playerId: PlayerId): Promise<void> {
        const { grace, clock } = this.deps;
        await grace.start(gameId, playerId, clock.now() + this.graceMs);
    }

    async reconnected(gameId: GameId, playerId: PlayerId): Promise<void> {
        await this.deps.grace.cancel(gameId, playerId);
    }

    async isPending(gameId: GameId, playerId: PlayerId): Promise<boolean> {
        return this.deps.grace.isPending(gameId, playerId);
    }

    /** Once a second (Sweeper): remove the players whose time is up — each by one instance only. */
    async sweep(now: number): Promise<void> {
        const { grace, onExpire, onError } = this.deps;
        for (const { gameId, playerId, expiresAt } of await grace.expired(now)) {
            try {
                if (await grace.claim(gameId, playerId, expiresAt))
                    await onExpire(gameId, playerId);
            } catch (err) {
                onError(err);
            }
        }
    }
}
