import type { Scheduler } from "../ports/Scheduler";

/** Real timers. Errors in `fn` are reported to `onError`, never thrown into the timer. */
export class IntervalScheduler implements Scheduler {
    constructor(private readonly onError: (err: unknown) => void = () => {}) {}

    every(ms: number, fn: () => void | Promise<void>): () => void {
        const handle = setInterval(() => this.run(fn), ms);
        return () => clearInterval(handle);
    }

    after(ms: number, fn: () => void | Promise<void>): () => void {
        const handle = setTimeout(() => this.run(fn), ms);
        return () => clearTimeout(handle);
    }

    private run(fn: () => void | Promise<void>): void {
        Promise.resolve()
            .then(fn)
            .catch((err: unknown) => this.onError(err));
    }
}
