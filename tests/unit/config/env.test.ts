import { describe, expect, it } from "vitest";
import { loadConfig } from "../../../src/config/env";

describe("loadConfig", () => {
    it("uses defaults when nothing is set", () => {
        expect(loadConfig({})).toEqual({
            port: 3000,
            instanceId: "app1",
            logLevel: "info",
            quotesApiUrl: "https://api.api-ninjas.com/v2/quotes",
            quotesApiKey: "",
            store: "memory",
            redisUrl: "redis://localhost:6379",
        });
    });

    it("reads values from the environment (numbers arrive as text)", () => {
        const config = loadConfig({
            PORT: "8080",
            INSTANCE_ID: "app2",
            LOG_LEVEL: "debug",
            API_KEY: "k",
            STORE: "redis",
            REDIS_URL: "redis://redis:6379",
        });

        expect(config).toMatchObject({
            port: 8080,
            instanceId: "app2",
            logLevel: "debug",
            quotesApiKey: "k",
            store: "redis",
            redisUrl: "redis://redis:6379",
        });
    });

    it.each([
        [{ PORT: "abc" }, "PORT"],
        [{ PORT: "-1" }, "PORT"],
        [{ LOG_LEVEL: "loud" }, "LOG_LEVEL"],
        [{ API_URL: "not a url" }, "API_URL"],
        [{ STORE: "mongo" }, "STORE"],
        [{ REDIS_URL: "http://localhost:6379" }, "REDIS_URL"],
    ])("fails fast with a clear message for %j", (env, name) => {
        expect(() => loadConfig(env)).toThrow(name);
    });
});
