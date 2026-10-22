import type { QuoteProvider } from "../../src/ports/QuoteProvider";

export class FakeQuoteProvider implements QuoteProvider {
    calls = 0;

    constructor(
        private quote = "the quick brown fox",
        private failWith?: Error,
    ) {}

    async getQuote(): Promise<string> {
        this.calls++;
        if (this.failWith) throw this.failWith;
        return this.quote;
    }

    willReturn(quote: string): void {
        this.quote = quote;
        this.failWith = undefined;
    }

    willFail(err = new Error("quote API down")): void {
        this.failWith = err;
    }
}
