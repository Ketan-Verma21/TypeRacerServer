/** Timers as a dependency, so tests can run them by hand (FakeScheduler). */
export interface Scheduler {
    /** Calls `fn` every `ms`. Returns a function that stops it. */
    every(ms: number, fn: () => void | Promise<void>): () => void;
    /** Calls `fn` once after `ms`. Returns a function that cancels it. */
    after(ms: number, fn: () => void | Promise<void>): () => void;
}
