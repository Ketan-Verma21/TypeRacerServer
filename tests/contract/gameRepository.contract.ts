// CONTRACT TESTS (Liskov substitution in practice): every GameRepository
// implementation must pass exactly these tests. Run them with
// runGameRepositoryContract("Name", () => new SomeRepository()).
import { beforeEach, describe, expect, it } from "vitest";
import type { GameRepository } from "../../src/ports/GameRepository";
import { makeGame, makePlayer } from "../fakes/builders";

export function runGameRepositoryContract(
    name: string,
    createRepo: () => GameRepository | Promise<GameRepository>,
): void {
    describe(`${name} (GameRepository contract)`, () => {
        let repo: GameRepository;

        beforeEach(async () => {
            repo = await createRepo();
        });

        it("returns null for an unknown game", async () => {
            expect(await repo.get("nope")).toBeNull();
            expect(await repo.exists("nope")).toBe(false);
        });

        it("stores and returns a game", async () => {
            const host = makePlayer({ id: "host", isHost: true });
            const game = makeGame({ id: "g1", players: [host] });

            await repo.create(game);

            expect(await repo.exists("g1")).toBe(true);
            expect(await repo.get("g1")).toEqual(game);
        });

        it("returns copies: changing a returned game changes nothing stored", async () => {
            await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));

            const copy = await repo.get("g1");
            copy!.phase = "over";
            copy!.players[0]!.wordIndex = 99;

            const again = await repo.get("g1");
            expect(again!.phase).toBe("racing");
            expect(again!.players[0]!.wordIndex).toBe(0);
        });

        it("updates game fields without touching players", async () => {
            await repo.create(
                makeGame({ id: "g1", phase: "lobby", players: [makePlayer({ id: "a" })] }),
            );

            await repo.updateMeta("g1", {
                phase: "racing",
                startTime: 123,
                words: ["new", "words"],
            });

            const game = await repo.get("g1");
            expect(game).toMatchObject({
                phase: "racing",
                startTime: 123,
                words: ["new", "words"],
            });
            expect(game!.players).toHaveLength(1);
        });

        it("removes a field when it is patched with undefined", async () => {
            await repo.create(makeGame({ id: "g1", startTime: 500 }));

            await repo.updateMeta("g1", { startTime: undefined });

            expect((await repo.get("g1"))!.startTime).toBeUndefined();
        });

        it("adds players in join order", async () => {
            await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));

            expect(await repo.addPlayer("g1", makePlayer({ id: "b" }), 5)).toBe("ok");
            expect(await repo.addPlayer("g1", makePlayer({ id: "c" }), 5)).toBe("ok");

            const ids = (await repo.get("g1"))!.players.map((p) => p.id);
            expect(ids).toEqual(["a", "b", "c"]);
        });

        it("refuses a racer when the room is full", async () => {
            await repo.create(
                makeGame({ id: "g1", players: [makePlayer({ id: "a" }), makePlayer({ id: "b" })] }),
            );

            expect(await repo.addPlayer("g1", makePlayer({ id: "c" }), 2)).toBe("full");
            expect((await repo.get("g1"))!.players).toHaveLength(2);
        });

        it("always lets spectators in, and doesn't count them as racers", async () => {
            await repo.create(makeGame({ id: "g1", players: [makePlayer({ id: "a" })] }));

            expect(await repo.addPlayer("g1", makePlayer({ id: "w", isSpectator: true }), 1)).toBe(
                "ok",
            );
            expect(await repo.addPlayer("g1", makePlayer({ id: "w2", isSpectator: true }), 1)).toBe(
                "ok",
            );
            expect((await repo.get("g1"))!.players).toHaveLength(3);
        });

        it("says not-found when adding to a missing game", async () => {
            expect(await repo.addPlayer("nope", makePlayer(), 5)).toBe("not-found");
        });

        it("updates one player's fields", async () => {
            await repo.create(
                makeGame({ id: "g1", players: [makePlayer({ id: "a" }), makePlayer({ id: "b" })] }),
            );

            await repo.updatePlayer("g1", "a", { wordIndex: 3, wpm: 55, socketId: "new-socket" });

            const [a, b] = (await repo.get("g1"))!.players;
            expect(a).toMatchObject({ wordIndex: 3, wpm: 55, socketId: "new-socket" });
            expect(b!.wordIndex).toBe(0);
        });

        it("removes a player", async () => {
            await repo.create(
                makeGame({ id: "g1", players: [makePlayer({ id: "a" }), makePlayer({ id: "b" })] }),
            );

            await repo.removePlayer("g1", "a");

            expect((await repo.get("g1"))!.players.map((p) => p.id)).toEqual(["b"]);
        });

        it("deletes a game", async () => {
            await repo.create(makeGame({ id: "g1" }));

            await repo.delete("g1");

            expect(await repo.get("g1")).toBeNull();
        });

        it("ignores updates to a missing game", async () => {
            await repo.updateMeta("nope", { phase: "over" });
            await repo.updatePlayer("nope", "a", { wordIndex: 1 });
            await repo.removePlayer("nope", "a");

            expect(await repo.exists("nope")).toBe(false);
        });
    });
}
