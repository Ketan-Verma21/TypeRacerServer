import path from "node:path";
import { describe, expect, it } from "vitest";
import { FallbackQuoteProvider } from "../../../src/adapters/quotes/FallbackQuoteProvider";
import { LocalQuoteProvider } from "../../../src/adapters/quotes/LocalQuoteProvider";
import { QuoteService } from "../../../src/services/QuoteService";
import { FakeQuoteProvider } from "../../fakes/FakeQuoteProvider";

describe("FallbackQuoteProvider", () => {
    it("uses the first provider that works", async () => {
        const broken = new FakeQuoteProvider();
        broken.willFail();
        const failures: number[] = [];
        const provider = new FallbackQuoteProvider(
            [broken, new FakeQuoteProvider("backup quote")],
            (_err, index) => failures.push(index),
        );

        expect(await provider.getQuote()).toBe("backup quote");
        expect(failures).toEqual([0]);
    });

    it("does not call later providers when the first works", async () => {
        const backup = new FakeQuoteProvider("backup");
        const provider = new FallbackQuoteProvider([new FakeQuoteProvider("main"), backup]);

        await provider.getQuote();

        expect(backup.calls).toBe(0);
    });

    it("fails only when every provider fails", async () => {
        const a = new FakeQuoteProvider();
        const b = new FakeQuoteProvider();
        a.willFail();
        b.willFail(new Error("also down"));

        await expect(new FallbackQuoteProvider([a, b]).getQuote()).rejects.toThrow("also down");
    });
});

describe("LocalQuoteProvider", () => {
    it("loads the bundled quotes file", async () => {
        const provider = LocalQuoteProvider.fromFile(
            path.join(__dirname, "../../../data/quotes.json"),
        );

        expect((await provider.getQuote()).length).toBeGreaterThan(10);
    });

    it("picks a quote using the random source", async () => {
        const provider = new LocalQuoteProvider(["a", "b", "c"], () => 2);

        expect(await provider.getQuote()).toBe("c");
    });
});

describe("QuoteService.getWords", () => {
    it("joins different quotes until the minimum word count is reached", async () => {
        const quotes = [
            "one two three four five",
            "six seven eight nine ten",
            "eleven twelve thirteen",
        ];
        let i = 0;
        const service = new QuoteService(new LocalQuoteProvider(quotes, () => i++ % quotes.length));

        const words = await service.getWords(12);

        expect(words).toHaveLength(13);
        expect(words.slice(0, 3)).toEqual(["one", "two", "three"]);
    });

    it("stops after one quote when it is long enough", async () => {
        const source = new FakeQuoteProvider("a b c d e f g h i j k l m n");
        const service = new QuoteService(source);

        await service.getWords(12);

        expect(source.calls).toBe(1);
    });

    it("never uses the same quote twice in one race", async () => {
        const service = new QuoteService(new FakeQuoteProvider("same short quote"));

        expect(await service.getWords(45)).toEqual(["same", "short", "quote"]);
    });

    it("gives the long setting enough words from the bundled quotes", async () => {
        const service = new QuoteService(
            LocalQuoteProvider.fromFile(path.join(__dirname, "../../../data/quotes.json")),
        );

        expect((await service.getWords(45)).length).toBeGreaterThanOrEqual(45);
    });
});
