// Every Leaderboard must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { Leaderboard } from "../../src/ports/Leaderboard";

export function runLeaderboardContract(name: string, create: () => Promise<Leaderboard>): void {
    describe(`${name} (Leaderboard contract)`, () => {
        it("is empty before anyone has raced", async () => {
            const board = await create();

            expect(await board.top("classic", 10)).toEqual([]);
        });

        it("keeps only a player's best score", async () => {
            const board = await create();

            await board.record("classic", "Ana", 50);
            await board.record("classic", "Ana", 40); // worse: ignored
            expect(await board.top("classic", 10)).toEqual([{ nickname: "Ana", wpm: 50 }]);

            await board.record("classic", "Ana", 61); // better: replaces it
            expect(await board.top("classic", 10)).toEqual([{ nickname: "Ana", wpm: 61 }]);
        });

        it("lists the fastest first, up to the limit", async () => {
            const board = await create();
            await board.record("classic", "Ana", 50);
            await board.record("classic", "Ben", 90);
            await board.record("classic", "Cy", 70);

            expect(await board.top("classic", 2)).toEqual([
                { nickname: "Ben", wpm: 90 },
                { nickname: "Cy", wpm: 70 },
            ]);
        });

        it("keeps each mode's board separate", async () => {
            const board = await create();
            await board.record("classic", "Ana", 50);

            expect(await board.top("sudden-death", 10)).toEqual([]);
        });
    });
}
