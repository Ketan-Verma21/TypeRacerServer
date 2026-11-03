// Every GracePeriods must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { GracePeriods } from "../../src/ports/GracePeriods";

export function runGracePeriodsContract(name: string, create: () => Promise<GracePeriods>): void {
    describe(`${name} (GracePeriods contract)`, () => {
        it("lists only the grace periods that have run out", async () => {
            const grace = await create();
            await grace.start("g1", "p1", 1000);
            await grace.start("g1", "p2", 5000);

            expect(await grace.expired(2000)).toEqual([
                { gameId: "g1", playerId: "p1", expiresAt: 1000 },
            ]);
        });

        it("cancels a grace period when the player comes back", async () => {
            const grace = await create();
            await grace.start("g1", "p1", 1000);

            await grace.cancel("g1", "p1");

            expect(await grace.isPending("g1", "p1")).toBe(false);
            expect(await grace.expired(9000)).toEqual([]);
        });

        it("restarts the clock when a player drops again", async () => {
            const grace = await create();
            await grace.start("g1", "p1", 1000);

            await grace.start("g1", "p1", 8000);

            expect(await grace.expired(2000)).toEqual([]);
            expect(await grace.isPending("g1", "p1")).toBe(true);
        });

        it("lets exactly one of many callers claim an expired player", async () => {
            const grace = await create();
            await grace.start("g1", "p1", 1000);

            const wins = await Promise.all(
                Array.from({ length: 5 }, () => grace.claim("g1", "p1", 1000)),
            );

            expect(wins.filter(Boolean)).toHaveLength(1);
            expect(await grace.isPending("g1", "p1")).toBe(false);
        });

        it("won't claim a player who dropped again since (new expiry)", async () => {
            const grace = await create();
            await grace.start("g1", "p1", 1000);
            await grace.start("g1", "p1", 8000);

            expect(await grace.claim("g1", "p1", 1000)).toBe(false);
            expect(await grace.isPending("g1", "p1")).toBe(true);
        });
    });
}
