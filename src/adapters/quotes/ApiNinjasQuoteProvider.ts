import axios from "axios";
import type { QuoteProvider } from "../../ports/QuoteProvider";

interface ApiNinjasQuote {
    quote: string;
}

/** Quotes from https://api-ninjas.com/api/quotes */
export class ApiNinjasQuoteProvider implements QuoteProvider {
    constructor(
        private readonly url: string,
        private readonly apiKey: string,
        private readonly timeoutMs = 3000,
    ) {}

    async getQuote(): Promise<string> {
        const res = await axios.get<ApiNinjasQuote[]>(this.url, {
            headers: { "X-Api-Key": this.apiKey },
            timeout: this.timeoutMs,
        });
        const quote = res.data[0]?.quote;
        if (!quote) throw new Error("Quote API returned no quote");
        return quote;
    }
}
