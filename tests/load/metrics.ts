// Counters and latency numbers for the load test.

export interface Summary {
    count: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

/** Nearest-rank percentile of an already sorted list (0 for an empty one). */
export function percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export function summarize(values: readonly number[]): Summary {
    const sorted = [...values].sort((a, b) => a - b);
    const total = sorted.reduce((sum, v) => sum + v, 0);
    return {
        count: sorted.length,
        mean: sorted.length ? total / sorted.length : 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted.at(-1) ?? 0,
    };
}

export class Metrics {
    /** ms from sending a word to seeing it in an `updateGame` broadcast. */
    readonly wordLatencies: number[] = [];
    /** ms from losing the connection to being back in the race (`joined` after rejoin). */
    readonly rejoinTimes: number[] = [];
    readonly errors = new Map<string, number>();
    connected = 0;
    peakConnected = 0;
    disconnects = 0;
    rejoined = 0;
    wordsSent = 0;
    wordsResent = 0;
    roomsStarted = 0;
    roomsFinished = 0;
    roomsFailed = 0;

    onConnect(): void {
        this.connected++;
        this.peakConnected = Math.max(this.peakConnected, this.connected);
    }

    /** `expected` = we closed it ourselves at the end; only unexpected drops count. */
    onDisconnect(expected = false): void {
        this.connected--;
        if (!expected) this.disconnects++;
    }

    error(kind: string): void {
        this.errors.set(kind, (this.errors.get(kind) ?? 0) + 1);
    }
}
