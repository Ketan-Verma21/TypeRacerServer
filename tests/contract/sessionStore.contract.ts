// Every SessionStore must pass these (memory and Redis alike).
import { describe, expect, it } from "vitest";
import type { SessionStore } from "../../src/ports/SessionStore";

const session = { gameId: "g1", playerId: "p1", nickname: "Ketan" };

export function runSessionStoreContract(
    name: string,
    createStore: () => Promise<SessionStore>,
): void {
    describe(`${name} (SessionStore contract)`, () => {
        it("returns null for an unknown socket", async () => {
            const store = await createStore();

            expect(await store.get("nope")).toBeNull();
        });

        it("stores, returns and deletes a session", async () => {
            const store = await createStore();

            await store.set("s1", session);
            expect(await store.get("s1")).toEqual(session);

            await store.delete("s1");
            expect(await store.get("s1")).toBeNull();
        });

        it("replaces a socket's session when it joins another game", async () => {
            const store = await createStore();
            await store.set("s1", session);

            await store.set("s1", { gameId: "g2", playerId: "p9", nickname: "Ana" });

            expect(await store.get("s1")).toEqual({
                gameId: "g2",
                playerId: "p9",
                nickname: "Ana",
            });
        });
    });
}
