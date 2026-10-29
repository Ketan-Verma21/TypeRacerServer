// Settings from environment variables (.env in development), validated with
// zod. A bad value stops the server at startup with a clear message.
import { z } from "zod";

export const STORES = ["memory", "redis"] as const;
export type Store = (typeof STORES)[number];

const EnvSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    INSTANCE_ID: z.string().min(1).default("app1"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    API_URL: z.url().default("https://api.api-ninjas.com/v2/quotes"),
    API_KEY: z.string().default(""), // empty = use the bundled quotes only
    STORE: z.enum(STORES).default("memory"), // where games live
    REDIS_URL: z
        .string()
        .regex(/^rediss?:\/\//, "must start with redis:// or rediss://")
        .default("redis://localhost:6379"),
});

export interface Config {
    port: number;
    instanceId: string;
    logLevel: z.infer<typeof EnvSchema>["LOG_LEVEL"];
    quotesApiUrl: string;
    quotesApiKey: string;
    store: Store;
    redisUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const result = EnvSchema.safeParse(env);
    if (!result.success) {
        throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    }
    const e = result.data;
    return {
        port: e.PORT,
        instanceId: e.INSTANCE_ID,
        logLevel: e.LOG_LEVEL,
        quotesApiUrl: e.API_URL,
        quotesApiKey: e.API_KEY,
        store: e.STORE,
        redisUrl: e.REDIS_URL,
    };
}
