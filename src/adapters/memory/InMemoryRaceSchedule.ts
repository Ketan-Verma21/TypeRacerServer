import type { GameId } from "../../domain/types";
import type { Clock } from "../../ports/Clock";
import type { RaceSchedule, ScheduledGame } from "../../ports/RaceSchedule";

const TICK_CLAIM_MS = 5_000;

/** One server only (STORE=memory). */
export class InMemoryRaceSchedule implements RaceSchedule {
    private readonly deadlines = new Map<GameId, number>();
    private readonly ticks = new Map<string, number>(); // claim -> expires at

    constructor(private readonly clock: Clock) {}

    async add(gameId: GameId, deadline: number): Promise<boolean> {
        if (this.deadlines.has(gameId)) return false;
        this.deadlines.set(gameId, deadline);
        return true;
    }

    async remove(gameId: GameId): Promise<void> {
        this.deadlines.delete(gameId);
    }

    async deadlineOf(gameId: GameId): Promise<number | null> {
        return this.deadlines.get(gameId) ?? null;
    }

    async all(): Promise<ScheduledGame[]> {
        return [...this.deadlines].map(([gameId, deadline]) => ({ gameId, deadline }));
    }

    async claim(gameId: GameId, deadline?: number): Promise<boolean> {
        const current = this.deadlines.get(gameId);
        if (current === undefined || (deadline !== undefined && current !== deadline)) return false;
        this.deadlines.delete(gameId);
        return true;
    }

    async claimTick(gameId: GameId, label: string): Promise<boolean> {
        const now = this.clock.now();
        for (const [key, expires] of this.ticks) if (expires <= now) this.ticks.delete(key);
        const key = `${gameId}:${label}`;
        if (this.ticks.has(key)) return false;
        this.ticks.set(key, now + TICK_CLAIM_MS);
        return true;
    }
}
