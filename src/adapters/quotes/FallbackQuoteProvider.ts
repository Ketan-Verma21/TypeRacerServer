import type { QuoteProvider } from "../../ports/QuoteProvider";

/**
 * Tries each provider in order until one works (Composite pattern: it is
 * itself a QuoteProvider, so callers can't tell the difference).
 */
export class FallbackQuoteProvider implements QuoteProvider {
    constructor(
        private readonly providers: readonly QuoteProvider[],
        private readonly onFailure: (err: unknown, index: number) => void = () => {},
    ) {
        if (providers.length === 0) throw new Error("FallbackQuoteProvider needs a provider");
    }

    async getQuote(): Promise<string> {
        let lastError: unknown;
        for (const [index, provider] of this.providers.entries()) {
            try {
                return await provider.getQuote();
            } catch (err) {
                lastError = err;
                this.onFailure(err, index);
            }
        }
        throw lastError;
    }
}
