import type { IdGenerator } from "../../src/ports/IdGenerator";

/** Predictable ids: game-1, player-1, player-2, ... */
export class SequentialIdGenerator implements IdGenerator {
    private n = { game: 0, player: 0, event: 0 };

    gameId(): string {
        return `game-${++this.n.game}`;
    }
    playerId(): string {
        return `player-${++this.n.player}`;
    }
    eventId(): string {
        return `event-${++this.n.event}`;
    }
}
