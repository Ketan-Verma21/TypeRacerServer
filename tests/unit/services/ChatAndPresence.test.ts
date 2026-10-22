import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../../src/domain/types";
import { QuoteService } from "../../../src/services/QuoteService";
import { FakeQuoteProvider } from "../../fakes/FakeQuoteProvider";
import { createTestApp } from "../../fakes/testApp";

let app: ReturnType<typeof createTestApp>;
const session: Session = { gameId: "g1", playerId: "p1", nickname: "Ketan" };

beforeEach(() => {
    app = createTestApp();
});

describe("ChatService", () => {
    it("stores and broadcasts a trimmed message", async () => {
        await app.chatService.send(session, "s1", "  hello  ");

        expect(app.notifier.ofType("chatMessage")[0]?.message).toMatchObject({
            nickname: "Ketan",
            text: "hello",
        });
        expect(await app.chat.recent("g1")).toHaveLength(1);
    });

    it("cuts long messages to 140 characters", async () => {
        await app.chatService.send(session, "s1", "x".repeat(500));

        expect((await app.chat.recent("g1"))[0]!.text).toHaveLength(140);
    });

    it("drops empty messages and non-text", async () => {
        await app.chatService.send(session, "s1", "   ");
        await app.chatService.send(session, "s1", { evil: true });

        expect(app.notifier.ofType("chatMessage")).toHaveLength(0);
    });

    it("drops messages sent faster than every 500 ms", async () => {
        await app.chatService.send(session, "s1", "one");
        await app.chatService.send(session, "s1", "two");
        app.clock.advance(500);
        await app.chatService.send(session, "s1", "three");

        expect(app.notifier.ofType("chatMessage").map((m) => m.message.text)).toEqual([
            "one",
            "three",
        ]);
    });

    it("sends the history to one socket", async () => {
        await app.chatService.send(session, "s1", "hi");

        await app.chatService.sendHistory(session, "s2");

        expect(app.notifier.ofType("chatHistory")[0]).toMatchObject({
            socketId: "s2",
            messages: [{ text: "hi" }],
        });
    });

    it("broadcasts allowed reactions only", async () => {
        await app.chatService.react(session, "s1", "🔥");
        app.clock.advance(200);
        await app.chatService.react(session, "s1", "🍕");

        expect(app.notifier.ofType("reaction").map((r) => r.reaction.emoji)).toEqual(["🔥"]);
    });
});

describe("PresenceService", () => {
    it("removes a player who doesn't come back within the grace period", async () => {
        let removed = false;
        app.presence.disconnected("p1", () => {
            removed = true;
        });

        await app.scheduler.tick(14);
        expect(removed).toBe(false);
        await app.scheduler.tick(1);
        expect(removed).toBe(true);
    });

    it("keeps a player who reconnects in time", async () => {
        let removed = false;
        app.presence.disconnected("p1", () => {
            removed = true;
        });

        await app.scheduler.tick(5);
        app.presence.reconnected("p1");
        await app.scheduler.tick(20);

        expect(removed).toBe(false);
        expect(app.presence.isPending("p1")).toBe(false);
    });
});

describe("QuoteService", () => {
    it("splits a quote into words, ignoring extra spaces", async () => {
        const quotes = new QuoteService(new FakeQuoteProvider("  to   be or  not "));

        expect(await quotes.getWords(12)).toEqual(["to", "be", "or", "not"]);
    });

    it("fails on an empty quote", async () => {
        const quotes = new QuoteService(new FakeQuoteProvider("   "));

        await expect(quotes.getWords(12)).rejects.toThrow();
    });
});
