import { RECONNECT_GRACE_MS } from "../config/constants";
import type { PlayerId } from "../domain/types";
import type { Scheduler } from "../ports/Scheduler";

/**
 * A dropped player gets a grace period to come back before being removed.
 * In-process for now; Phase 5 moves this to Redis so it works across instances.
 */
export class PresenceService {
    private readonly pending = new Map<PlayerId, () => void>(); // playerId -> cancel()

    constructor(
        private readonly scheduler: Scheduler,
        private readonly graceMs = RECONNECT_GRACE_MS,
    ) {}

    /** Runs `onExpire` unless the player reconnects within the grace period. */
    disconnected(playerId: PlayerId, onExpire: () => void | Promise<void>): void {
        this.reconnected(playerId);
        const cancel = this.scheduler.after(this.graceMs, async () => {
            this.pending.delete(playerId);
            await onExpire();
        });
        this.pending.set(playerId, cancel);
    }

    reconnected(playerId: PlayerId): void {
        this.pending.get(playerId)?.();
        this.pending.delete(playerId);
    }

    isPending(playerId: PlayerId): boolean {
        return this.pending.has(playerId);
    }
}
