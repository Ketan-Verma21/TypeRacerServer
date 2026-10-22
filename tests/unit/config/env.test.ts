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
        });
    });

    it("reads values from the environment (numbers arrive as text)", () => {
        const config = loadConfig({
            PORT: "8080",
            INSTANCE_ID: "app2",
            LOG_LEVEL: "debug",
            API_KEY: "k",
        });

        expect(config).toMatchObject({
            port: 8080,
            instanceId: "app2",
            logLevel: "debug",
            quotesApiKey: "k",
        });
    });

    it.each([
        [{ PORT: "abc" }, "PORT"],
        [{ PORT: "-1" }, "PORT"],
        [{ LOG_LEVEL: "loud" }, "LOG_LEVEL"],
        [{ API_URL: "not a url" }, "API_URL"],
    ])("fails fast with a clear message for %j", (env, name) => {
        expect(() => loadConfig(env)).toThrow(name);
    });
});
