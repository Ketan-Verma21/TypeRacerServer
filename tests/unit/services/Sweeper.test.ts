import { describe, expect, it } from "vitest";
import { Sweeper } from "../../../src/services/Sweeper";
import { FakeClock } from "../../fakes/FakeClock";
import { FakeScheduler } from "../../fakes/FakeScheduler";

describe("Sweeper", () => {
    it("waits for the next full second before the first sweep", () => {
        const delays: number[] = [];
        const scheduler = {
            after: (ms: number) => {
                delays.push(ms);
                return () => {};
            },
            every: () => () => {},
        };

        new Sweeper({ clock: new FakeClock(1_000_250), scheduler, onError: () => {} }, []).start();

        expect(delays).toEqual([750]); // 0.25 s past the second -> wait 0.75 s
    });

    it("then sweeps once a second", async () => {
        const clock = new FakeClock(); // on a full second
        const scheduler = new FakeScheduler(clock);
        const runs: number[] = [];
        new Sweeper({ clock, scheduler, onError: () => {} }, [
            async (now) => {
                runs.push(now);
            },
        ]).start();

        await scheduler.tick(3);

        expect(runs).toEqual([1_001_000, 1_002_000, 1_003_000]);
    });

    it("reports a failing task and still runs the others", async () => {
        const clock = new FakeClock();
        const errors: unknown[] = [];
        const ran: string[] = [];
        const sweeper = new Sweeper(
            { clock, scheduler: new FakeScheduler(clock), onError: (e) => errors.push(e) },
            [
                async () => {
                    throw new Error("Redis down");
                },
                async () => {
                    ran.push("second task");
                },
            ],
        );

        await sweeper.sweepOnce();

        expect(errors).toHaveLength(1);
        expect(ran).toEqual(["second task"]);
    });

    it("stops when asked", async () => {
        const clock = new FakeClock();
        const scheduler = new FakeScheduler(clock);
        let runs = 0;
        const stop = new Sweeper({ clock, scheduler, onError: () => {} }, [
            async () => {
                runs++;
            },
        ]).start();
        await scheduler.tick(2);

        stop();
        await scheduler.tick(3);

        expect(runs).toBe(2);
    });
});
