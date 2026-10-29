import type { Clock } from "../ports/Clock";
import type { Scheduler } from "../ports/Scheduler";

export type SweepTask = (now: number) => Promise<void>;

export interface SweeperDeps {
    clock: Clock;
    scheduler: Scheduler;
    onError: (err: unknown) => void;
}

/**
 * Runs the tasks once a second, on the wall-clock second, on every server
 * instance (Architecture.md §4.4). Instances agree on "which second is it"
 * because they all wake up at :00.000, :01.000, ... A sweep that is still
 * running when the next second starts is not started twice.
 */
export class Sweeper {
    private running = false;

    constructor(
        private readonly deps: SweeperDeps,
        private readonly tasks: readonly SweepTask[],
    ) {}

    /** Starts sweeping at the next full second. Returns a function that stops it. */
    start(): () => void {
        const { clock, scheduler } = this.deps;
        let stopEvery = (): void => {};
        const delay = 1000 - (clock.now() % 1000);
        const stopFirst = scheduler.after(delay, async () => {
            stopEvery = scheduler.every(1000, () => this.sweepOnce());
            await this.sweepOnce();
        });
        return () => {
            stopFirst();
            stopEvery();
        };
    }

    async sweepOnce(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const now = this.deps.clock.now();
            for (const task of this.tasks) {
                try {
                    await task(now);
                } catch (err) {
                    this.deps.onError(err);
                }
            }
        } finally {
            this.running = false;
        }
    }
}
