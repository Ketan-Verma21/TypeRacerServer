export interface QuoteProvider {
    /** One quote as plain text. Throws if the source is unavailable. */
    getQuote(): Promise<string>;
}
