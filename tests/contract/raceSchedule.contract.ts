// Every RaceSchedule must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { RaceSchedule } from "../../src/ports/RaceSchedule";

export function runRaceScheduleContract(name: string, create: () => Promise<RaceSchedule>): void {
    describe(`${name} (RaceSchedule contract)`, () => {
        it("schedules a game once: a second start is refused", async () => {
            const schedule = await create();

            expect(await schedule.add("g1", 1000)).toBe(true);
            expect(await schedule.add("g1", 2000)).toBe(false);
            expect(await schedule.deadlineOf("g1")).toBe(1000);
        });

        it("lists every scheduled game with its deadline", async () => {
            const schedule = await create();
            await schedule.add("g1", 1000);
            await schedule.add("g2", 2000);

            const all = await schedule.all();

            expect(all.sort((a, b) => a.deadline - b.deadline)).toEqual([
                { gameId: "g1", deadline: 1000 },
                { gameId: "g2", deadline: 2000 },
            ]);
        });

        it("lets exactly one of many callers claim a deadline", async () => {
            const schedule = await create();
            await schedule.add("g1", 1000);

            const wins = await Promise.all(
                Array.from({ length: 5 }, () => schedule.claim("g1", 1000)),
            );

            expect(wins.filter(Boolean)).toHaveLength(1);
            expect(await schedule.deadlineOf("g1")).toBeNull();
        });

        it("won't claim an entry whose deadline has moved on", async () => {
            const schedule = await create();
            await schedule.add("g1", 1000);
            await schedule.claim("g1", 1000); // countdown handled...
            await schedule.add("g1", 9000); // ...race scheduled

            expect(await schedule.claim("g1", 1000)).toBe(false); // a slow instance
            expect(await schedule.deadlineOf("g1")).toBe(9000);
        });

        it("claims any entry when no deadline is given, once", async () => {
            const schedule = await create();
            await schedule.add("g1", 1000);

            expect(await schedule.claim("g1")).toBe(true);
            expect(await schedule.claim("g1")).toBe(false);
        });

        it("hands out each tick once", async () => {
            const schedule = await create();

            expect(await schedule.claimTick("g1", "1000:5")).toBe(true);
            expect(await schedule.claimTick("g1", "1000:5")).toBe(false);
            expect(await schedule.claimTick("g1", "1000:4")).toBe(true);
            expect(await schedule.claimTick("g2", "1000:5")).toBe(true);
        });

        it("removes a game", async () => {
            const schedule = await create();
            await schedule.add("g1", 1000);

            await schedule.remove("g1");

            expect(await schedule.all()).toEqual([]);
        });
    });
}
