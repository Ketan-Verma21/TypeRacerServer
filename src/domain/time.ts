// Pure time helpers: no Date.now() here, callers pass the numbers in.

/** Words per minute = completed words / minutes elapsed, rounded down. */
export function calculateWpm(completedWords: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return 0;
    const wpm = Math.floor(completedWords / (elapsedMs / 60_000));
    return Number.isFinite(wpm) ? wpm : 0;
}

/** 65 -> "1:05". Negative values show as "0:00". */
export function formatClock(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
