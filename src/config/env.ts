// Reads settings from environment variables (.env in development).
// Phase 2 validates these with zod and fails fast on bad values.

export interface Config {
    port: number;
    quotesApiUrl: string;
    quotesApiKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
    return {
        port,
        quotesApiUrl: env.API_URL ?? "https://api.api-ninjas.com/v2/quotes",
        quotesApiKey: env.API_KEY ?? "",
    };
}
