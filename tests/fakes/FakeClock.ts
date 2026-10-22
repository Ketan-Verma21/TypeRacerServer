import type { Clock } from "../../src/ports/Clock";

/** Time that only moves when the test says so. */
export class FakeClock implements Clock {
    constructor(private time = 1_000_000) {}

    now(): number {
        return this.time;
    }

    advance(ms: number): void {
        this.time += ms;
    }
}
