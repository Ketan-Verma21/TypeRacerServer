import type { Scheduler } from "../../src/ports/Scheduler";
import type { FakeClock } from "./FakeClock";

interface Job {
    every: number | null; // null = one-shot
    dueAt: number;
    fn: () => void | Promise<void>;
    active: boolean;
}

/** Timers that only run when the test calls tick(). Moves the FakeClock too. */
export class FakeScheduler implements Scheduler {
    private jobs: Job[] = [];

    constructor(private readonly clock: FakeClock) {}

    every(ms: number, fn: () => void | Promise<void>): () => void {
        return this.add({ every: ms, dueAt: this.clock.now() + ms, fn, active: true });
    }

    after(ms: number, fn: () => void | Promise<void>): () => void {
        return this.add({ every: null, dueAt: this.clock.now() + ms, fn, active: true });
    }

    /** Moves time forward 1 s, `seconds` times, running every job that is due. */
    async tick(seconds = 1): Promise<void> {
        for (let i = 0; i < seconds; i++) {
            this.clock.advance(1000);
            for (const job of [...this.jobs]) {
                if (!job.active || job.dueAt > this.clock.now()) continue;
                if (job.every === null) job.active = false;
                else job.dueAt += job.every;
                await job.fn();
            }
            this.jobs = this.jobs.filter((j) => j.active);
        }
    }

    get activeCount(): number {
        return this.jobs.filter((j) => j.active).length;
    }

    private add(job: Job): () => void {
        this.jobs.push(job);
        return () => {
            job.active = false;
        };
    }
}
