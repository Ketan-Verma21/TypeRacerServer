import { describe, it, expect } from "vitest";
import {
    activeRacers,
    isFinished,
    nextHost,
    racersOf,
    rankPlayers,
} from "../../../src/domain/rules";
import { finished, makeGame, makePlayer, out, racing, spectator } from "../../fakes/builders";

describe("isFinished", () => {
    it("is true once every word is typed", () => {
        const game = makeGame();
        expect(isFinished(game, finished())).toBe(true);
        expect(isFinished(game, racing(1))).toBe(false);
    });

    it("is false while the game has no words yet", () => {
        expect(isFinished(makeGame({ words: [] }), makePlayer())).toBe(false);
    });
});

describe("racersOf / activeRacers", () => {
    it("leaves out spectators, then finished and eliminated players", () => {
        const a = racing(1, { id: "a" });
        const game = makeGame({ players: [a, finished(), out(), spectator()] });

        expect(racersOf(game)).toHaveLength(3);
        expect(activeRacers(game)).toEqual([a]);
    });
});

describe("nextHost", () => {
    it("prefers a racer over a spectator", () => {
        const watcher = spectator({ id: "watcher" });
        const racer = racing(0, { id: "racer" });

        expect(nextHost(makeGame({ players: [watcher, racer] }))?.id).toBe("racer");
    });

    it("falls back to a spectator when nobody is racing", () => {
        const watcher = spectator({ id: "watcher" });

        expect(nextHost(makeGame({ players: [watcher] }))?.id).toBe("watcher");
    });

    it("is undefined for an empty room", () => {
        expect(nextHost(makeGame({ players: [] }))).toBeUndefined();
    });
});

describe("rankPlayers", () => {
    it("ranks finished players by WPM, then unfinished, then eliminated", () => {
        const game = makeGame({
            players: [
                out({ id: "out", wpm: 200 }),
                racing(2, { id: "slow", wpm: 90 }),
                finished({ id: "b", wpm: 60 }),
                finished({ id: "a", wpm: 80 }),
                spectator({ id: "watcher" }),
            ],
        });

        expect(rankPlayers(game).map((p) => p.id)).toEqual(["a", "b", "slow", "out"]);
    });
});
