import { describe, expect, it } from "vitest";
import { InMemoryChatRepository } from "../../../src/adapters/memory/InMemoryChatRepository";
import { InMemoryRateLimiter } from "../../../src/adapters/memory/InMemoryRateLimiter";
import { InMemorySessionStore } from "../../../src/adapters/memory/InMemorySessionStore";
import { FakeClock } from "../../fakes/FakeClock";

const msg = (text: string) => ({ playerId: "p1", nickname: "Ketan", text, ts: 0 });

describe("InMemoryChatRepository", () => {
    it("keeps only the most recent messages", async () => {
        const chat = new InMemoryChatRepository(2);

        await chat.add("g1", msg("one"));
        await chat.add("g1", msg("two"));
        await chat.add("g1", msg("three"));

        expect((await chat.recent("g1")).map((m) => m.text)).toEqual(["two", "three"]);
    });

    it("keeps rooms separate and can clear one", async () => {
        const chat = new InMemoryChatRepository();
        await chat.add("g1", msg("hi"));
        await chat.add("g2", msg("yo"));

        await chat.clear("g1");

        expect(await chat.recent("g1")).toEqual([]);
        expect(await chat.recent("g2")).toHaveLength(1);
    });
});

describe("InMemorySessionStore", () => {
    it("stores, returns and deletes a session", async () => {
        const store = new InMemorySessionStore();
        const session = { gameId: "g1", playerId: "p1", nickname: "Ketan" };

        await store.set("s1", session);
        expect(await store.get("s1")).toEqual(session);

        await store.delete("s1");
        expect(await store.get("s1")).toBeNull();
    });
});

describe("InMemoryRateLimiter", () => {
    it("allows one call per interval per key", async () => {
        const clock = new FakeClock();
        const limiter = new InMemoryRateLimiter(clock);

        expect(await limiter.allow("chat:s1", 500)).toBe(true);
        expect(await limiter.allow("chat:s1", 500)).toBe(false); // too fast
        expect(await limiter.allow("chat:s2", 500)).toBe(true); // other socket

        clock.advance(500);
        expect(await limiter.allow("chat:s1", 500)).toBe(true);
    });
});
