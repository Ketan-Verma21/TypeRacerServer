import type { QuoteProvider } from "../ports/QuoteProvider";

/** Turns quotes into the list of words players type. */
export class QuoteService {
    constructor(private readonly provider: QuoteProvider) {}

    /**
     * Phase 1 keeps v1 behaviour: one quote, whatever its length.
     * Phase 2 uses `minWords` (quote length setting) and adds a local fallback.
     */
    async getWords(_minWords: number): Promise<string[]> {
        const quote = await this.provider.getQuote();
        const words = quote.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) throw new Error("Quote was empty");
        return words;
    }
}
