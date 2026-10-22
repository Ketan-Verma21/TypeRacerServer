import type { Clock } from "../ports/Clock";

export class SystemClock implements Clock {
    now(): number {
        return Date.now();
    }
}
