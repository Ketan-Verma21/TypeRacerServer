// Every ChatRepository must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { ChatRepository } from "../../src/ports/ChatRepository";

const msg = (text: string) => ({ playerId: "p1", nickname: "Ketan", text, ts: 0 });

export function runChatRepositoryContract(
    name: string,
    createChat: (maxMessages?: number) => Promise<ChatRepository>,
): void {
    describe(`${name} (ChatRepository contract)`, () => {
        it("returns no messages for a quiet room", async () => {
            const chat = await createChat();

            expect(await chat.recent("g1")).toEqual([]);
        });

        it("returns messages oldest first, unchanged", async () => {
            const chat = await createChat();
            const first = { playerId: "p1", nickname: "Ketan", text: "hi 👋", ts: 5 };

            await chat.add("g1", first);
            await chat.add("g1", msg("second"));

            expect(await chat.recent("g1")).toEqual([first, msg("second")]);
        });

        it("keeps only the most recent messages", async () => {
            const chat = await createChat(2);

            await chat.add("g1", msg("one"));
            await chat.add("g1", msg("two"));
            await chat.add("g1", msg("three"));

            expect((await chat.recent("g1")).map((m) => m.text)).toEqual(["two", "three"]);
        });

        it("keeps rooms separate and can clear one", async () => {
            const chat = await createChat();
            await chat.add("g1", msg("hi"));
            await chat.add("g2", msg("yo"));

            await chat.clear("g1");

            expect(await chat.recent("g1")).toEqual([]);
            expect(await chat.recent("g2")).toHaveLength(1);
        });
    });
}
