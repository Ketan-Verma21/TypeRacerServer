import type { Redis } from "ioredis";
import type { QuoteProvider } from "../../ports/QuoteProvider";
import { keys } from "./keys";

export interface QuotePoolOptions {
    /** How many quotes to keep ready. */
    target?: number;
    /** At most this many API calls per refill, to stay gentle on the free tier. */
    batchSize?: number;
    onError?: (err: unknown) => void;
}

/**
 * Quotes fetched ahead of time and kept in a Redis list (FR-3), so creating
 * a room doesn't wait up to 3 s for the quote API.
 *   refill():   RPUSH new quotes at the end (run in the background)
 *   getQuote(): LPOP the oldest one; throws when empty, so a
 *               FallbackQuoteProvider moves on to the live API / bundled quotes.
 * The list is shared, so every server instance (Phase 5) uses the same pool.
 */
export class RedisQuotePool implements QuoteProvider {
    private readonly target: number;
    private readonly batchSize: number;
    private readonly onError: (err: unknown) => void;

    constructor(
        private readonly redis: Redis,
        private readonly source: QuoteProvider,
        options: QuotePoolOptions = {},
    ) {
        this.target = options.target ?? 50;
        this.batchSize = options.batchSize ?? 10;
        this.onError = options.onError ?? (() => {});
    }

    async getQuote(): Promise<string> {
        const quote = await this.redis.lpop(keys.quotePool());
        if (quote === null) throw new Error("Quote pool is empty");
        return quote;
    }

    /**
     * Adds up to `batchSize` quotes if the pool is below `target`. Stops at the
     * first source failure (the API is down; try again next time). Returns how
     * many were added. LTRIM keeps the list at `target` even if several servers
     * refill at the same moment.
     */
    async refill(): Promise<number> {
        const key = keys.quotePool();
        const missing = this.target - (await this.redis.llen(key));
        let added = 0;
        for (let i = 0; i < Math.min(missing, this.batchSize); i++) {
            let quote: string;
            try {
                quote = (await this.source.getQuote()).trim();
            } catch (err) {
                this.onError(err);
                break;
            }
            if (!quote) continue;
            await this.redis
                .multi()
                .rpush(key, quote)
                .ltrim(key, 0, this.target - 1)
                .exec();
            added++;
        }
        return added;
    }
}
