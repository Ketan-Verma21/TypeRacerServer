import type { Clock } from "../../ports/Clock";
import type { RateLimiter } from "../../ports/RateLimiter";

export class InMemoryRateLimiter implements RateLimiter {
    private readonly last = new Map<string, number>();

    constructor(private readonly clock: Clock) {}

    async allow(key: string, intervalMs: number): Promise<boolean> {
        const now = this.clock.now();
        const prev = this.last.get(key);
        if (prev !== undefined && now - prev < intervalMs) return false;
        this.last.set(key, now);
        return true;
    }
}
