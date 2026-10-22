import { readFileSync } from "node:fs";
import type { QuoteProvider } from "../../ports/QuoteProvider";

/** Quotes bundled with the server (data/quotes.json): works with no network. */
export class LocalQuoteProvider implements QuoteProvider {
    constructor(
        private readonly quotes: readonly string[],
        private readonly randomIndex: (length: number) => number = (n) =>
            Math.floor(Math.random() * n),
    ) {
        if (quotes.length === 0) throw new Error("LocalQuoteProvider needs at least one quote");
    }

    /** Reads a JSON array of strings. */
    static fromFile(path: string): LocalQuoteProvider {
        const data: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (!Array.isArray(data) || !data.every((q) => typeof q === "string")) {
            throw new Error(`${path} must be a JSON array of strings`);
        }
        return new LocalQuoteProvider(data);
    }

    async getQuote(): Promise<string> {
        return this.quotes[this.randomIndex(this.quotes.length)] ?? this.quotes[0]!;
    }
}
