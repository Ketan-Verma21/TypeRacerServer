// Every ProcessedEvents must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { ProcessedEvents } from "../../src/ports/ProcessedEvents";

export function runProcessedEventsContract(
    name: string,
    create: () => Promise<ProcessedEvents>,
): void {
    describe(`${name} (ProcessedEvents contract)`, () => {
        it("lets an event be claimed once", async () => {
            const processed = await create();

            expect(await processed.claim("e1")).toBe(true);
            expect(await processed.claim("e1")).toBe(false);
            expect(await processed.claim("e2")).toBe(true);
        });

        it("lets exactly one of many concurrent workers claim an event", async () => {
            const processed = await create();

            const wins = await Promise.all(Array.from({ length: 5 }, () => processed.claim("e1")));

            expect(wins.filter(Boolean)).toHaveLength(1);
        });

        it("can be claimed again after a release (a failed attempt)", async () => {
            const processed = await create();
            await processed.claim("e1");

            await processed.release("e1");

            expect(await processed.claim("e1")).toBe(true);
        });
    });
}
