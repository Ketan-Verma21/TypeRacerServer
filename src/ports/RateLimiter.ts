export interface RateLimiter {
    /** true if `key` hasn't been allowed in the last `intervalMs` (and records this call). */
    allow(key: string, intervalMs: number): Promise<boolean>;
}
