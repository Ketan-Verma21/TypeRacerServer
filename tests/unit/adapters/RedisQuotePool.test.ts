import { describe, expect, it } from "vitest";
import { FallbackQuoteProvider } from "../../../src/adapters/quotes/FallbackQuoteProvider";
import { keys } from "../../../src/adapters/redis/keys";
import { RedisQuotePool } from "../../../src/adapters/redis/RedisQuotePool";
import type { QuoteProvider } from "../../../src/ports/QuoteProvider";
import { FakeQuoteProvider } from "../../fakes/FakeQuoteProvider";
import { createMockRedis } from "../../fakes/mockRedis";

/** "quote 1", "quote 2", ... so tests can see the order. */
class NumberedQuotes implements QuoteProvider {
    calls = 0;
    async getQuote(): Promise<string> {
        this.calls++;
        return `quote ${this.calls}`;
    }
}

describe("RedisQuotePool", () => {
    it("serves the oldest pooled quote first", async () => {
        const pool = new RedisQuotePool(await createMockRedis(), new NumberedQuotes());
        await pool.refill();

        expect(await pool.getQuote()).toBe("quote 1");
        expect(await pool.getQuote()).toBe("quote 2");
    });

    it("throws when empty, so a fallback chain moves on", async () => {
        const pool = new RedisQuotePool(await createMockRedis(), new NumberedQuotes());

        await expect(pool.getQuote()).rejects.toThrow("empty");
    });

    it("refills in batches up to the target, then stops calling the API", async () => {
        const redis = await createMockRedis();
        const source = new NumberedQuotes();
        const pool = new RedisQuotePool(redis, source, { target: 5, batchSize: 3 });

        expect(await pool.refill()).toBe(3);
        expect(await pool.refill()).toBe(2);
        expect(await pool.refill()).toBe(0);
        expect(await redis.llen(keys.quotePool())).toBe(5);
        expect(source.calls).toBe(5);
    });

    it("stops a refill at the first API failure, keeps the rest, and reports it", async () => {
        const source = new FakeQuoteProvider();
        source.willFail(new Error("429 too many requests"));
        const errors: unknown[] = [];
        const pool = new RedisQuotePool(await createMockRedis(), source, {
            onError: (err) => errors.push(err),
        });

        expect(await pool.refill()).toBe(0);
        expect(source.calls).toBe(1); // didn't keep hammering a failing API
        expect(errors).toHaveLength(1);
    });

    it("never grows past the target when two servers refill at once", async () => {
        const redis = await createMockRedis();
        const a = new RedisQuotePool(redis, new NumberedQuotes(), { target: 4, batchSize: 4 });
        const b = new RedisQuotePool(redis, new NumberedQuotes(), { target: 4, batchSize: 4 });

        await Promise.all([a.refill(), b.refill()]);

        expect(await redis.llen(keys.quotePool())).toBe(4);
    });

    it("lets a fallback chain use the live source when the pool is empty", async () => {
        const pool = new RedisQuotePool(await createMockRedis(), new NumberedQuotes());
        const chain = new FallbackQuoteProvider([pool, new FakeQuoteProvider("live quote")]);

        expect(await chain.getQuote()).toBe("live quote");
    });
});
