// Every RateLimiter must pass these. `wait` moves time forward: a fake clock
// for the memory limiter, a real (short) sleep for Redis, whose keys expire on Redis time.
import { describe, expect, it } from "vitest";
import type { RateLimiter } from "../../src/ports/RateLimiter";

export interface RateLimiterUnderTest {
    limiter: RateLimiter;
    wait(ms: number): Promise<void>;
}

const INTERVAL_MS = 50;

export function runRateLimiterContract(
    name: string,
    create: () => Promise<RateLimiterUnderTest>,
): void {
    describe(`${name} (RateLimiter contract)`, () => {
        it("allows the first call and blocks a second one that comes too fast", async () => {
            const { limiter } = await create();

            expect(await limiter.allow("chat:s1", INTERVAL_MS)).toBe(true);
            expect(await limiter.allow("chat:s1", INTERVAL_MS)).toBe(false);
        });

        it("limits each key on its own", async () => {
            const { limiter } = await create();

            await limiter.allow("chat:s1", INTERVAL_MS);

            expect(await limiter.allow("chat:s2", INTERVAL_MS)).toBe(true);
        });

        it("allows the key again once the interval has passed", async () => {
            const { limiter, wait } = await create();
            await limiter.allow("chat:s1", INTERVAL_MS);

            await wait(INTERVAL_MS + 20);

            expect(await limiter.allow("chat:s1", INTERVAL_MS)).toBe(true);
        });
    });
}
