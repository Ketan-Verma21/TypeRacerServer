import type { IdGenerator } from "../../src/ports/IdGenerator";

/** Predictable ids: game-1, player-1, player-2, ... */
export class SequentialIdGenerator implements IdGenerator {
    private n = { game: 0, player: 0, event: 0 };
    private queued: string[] = [];

    gameId(): string {
        return this.queued.shift() ?? `game-${++this.n.game}`;
    }

    /** Makes the next gameId() return `id` (to test collisions). */
    repeatNext(id: string): void {
        this.queued.push(id);
    }
    playerId(): string {
        return `player-${++this.n.player}`;
    }
    eventId(): string {
        return `event-${++this.n.event}`;
    }
}
