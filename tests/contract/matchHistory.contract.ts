// Every MatchHistory must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { MatchSummary } from "../../src/domain/events";
import type { MatchHistory } from "../../src/ports/MatchHistory";

const match = (gameId: string, round: number): MatchSummary => ({
    gameId,
    round,
    mode: "classic",
    at: round * 1000,
    results: [
        { playerId: "p1", nickname: "Ana", wpm: 60, rank: 1, finished: true, eliminated: false },
    ],
});

export function runMatchHistoryContract(
    name: string,
    create: (maxRecent: number, maxPerGame: number) => Promise<MatchHistory>,
): void {
    describe(`${name} (MatchHistory contract)`, () => {
        it("returns matches newest first, unchanged", async () => {
            const history = await create(10, 10);
            await history.add(match("g1", 1));
            await history.add(match("g2", 1));

            expect(await history.recent(10)).toEqual([match("g2", 1), match("g1", 1)]);
        });

        it("keeps only the most recent matches overall", async () => {
            const history = await create(2, 10);
            for (let round = 1; round <= 3; round++) await history.add(match("g1", round));

            expect((await history.recent(10)).map((m) => m.round)).toEqual([3, 2]);
        });

        it("counts started races per mode", async () => {
            const history = await create(10, 10);

            await history.countStarted("classic");
            await history.countStarted("classic");
            await history.countStarted("sudden-death");

            expect(await history.startedCount("classic")).toBe(2);
            expect(await history.startedCount("sudden-death")).toBe(1);
            expect(await history.startedCount("no-mistakes")).toBe(0);
        });

        it("keeps a separate, capped history per room", async () => {
            const history = await create(10, 2);
            for (let round = 1; round <= 3; round++) await history.add(match("g1", round));
            await history.add(match("g2", 1));

            expect((await history.forGame("g1")).map((m) => m.round)).toEqual([3, 2]);
            expect(await history.forGame("g2")).toHaveLength(1);
            expect(await history.forGame("nope")).toEqual([]);
        });
    });
}
