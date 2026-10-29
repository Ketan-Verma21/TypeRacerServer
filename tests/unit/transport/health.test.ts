import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { createHttpApp, type HttpAppOptions } from "../../../src/app";

/** Starts the app on a free port, makes one request, stops it again. */
async function request(
    path: string,
    options: HttpAppOptions = {},
): Promise<{ status: number; body: unknown }> {
    const server = createHttpApp(options).listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        return { status: res.status, body: await res.json() };
    } finally {
        server.close();
    }
}

describe("health routes", () => {
    it("is ready by default (STORE=memory)", async () => {
        expect(await request("/health/ready")).toEqual({ status: 200, body: { ok: true } });
    });

    it("answers 503 on /health/ready when the store is down", async () => {
        const res = await request("/health/ready", { isReady: async () => false });

        expect(res).toEqual({ status: 503, body: { ok: false } });
    });

    it("treats a failing readiness check as not ready", async () => {
        const res = await request("/health/ready", {
            isReady: () => Promise.reject(new Error("boom")),
        });

        expect(res.status).toBe(503);
    });

    it("reports the store in /health's db field for the app's wake-up check", async () => {
        const up = await request("/health");
        const down = await request("/health", { isReady: async () => false });

        expect(up.body).toMatchObject({ ok: true, db: true });
        expect(down.body).toMatchObject({ ok: true, db: false });
    });

    it("stays live even when the store is down", async () => {
        const res = await request("/health/live", { isReady: async () => false });

        expect(res).toEqual({ status: 200, body: { ok: true } });
    });
});
