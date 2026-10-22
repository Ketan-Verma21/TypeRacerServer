import { describe, expect, it } from "vitest";
import { isRedisReady } from "../../../src/infra/redis";

describe("isRedisReady", () => {
    it("is ready when Redis answers PONG", async () => {
        expect(await isRedisReady({ ping: async () => "PONG" })).toBe(true);
    });

    it("is not ready when PING fails", async () => {
        const redis = { ping: () => Promise.reject(new Error("ECONNREFUSED")) };

        expect(await isRedisReady(redis)).toBe(false);
    });

    it("is not ready when PING takes longer than the timeout", async () => {
        const redis = { ping: () => new Promise<"PONG">(() => {}) }; // never answers

        expect(await isRedisReady(redis, 10)).toBe(false);
    });
});
