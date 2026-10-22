import type { QuoteProvider } from "../ports/QuoteProvider";

/** Upper limit on quotes fetched for one race, so a short source can't loop forever. */
const MAX_QUOTES_PER_RACE = 20;

const toWords = (quote: string): string[] => quote.trim().split(/\s+/).filter(Boolean);

/** Turns quotes into the list of words players type. */
export class QuoteService {
    constructor(private readonly provider: QuoteProvider) {}

    /**
     * Joins different quotes until there are at least `minWords` words
     * (the quote length setting: short 12, medium 25, long 45).
     */
    async getWords(minWords: number): Promise<string[]> {
        const words: string[] = [];
        const used = new Set<string>();
        for (let i = 0; i < MAX_QUOTES_PER_RACE && words.length < minWords; i++) {
            const quote = (await this.provider.getQuote()).trim();
            if (!quote || used.has(quote)) continue; // skip empty and repeated quotes
            used.add(quote);
            words.push(...toWords(quote));
        }
        if (words.length === 0) throw new Error("Could not get a quote");
        return words;
    }
}
