// shouldEnd decides when a race is over. Each mode has its own rules,
// so each rule gets its own test.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shouldEnd } = require("../../services/gameService");

const WORDS = ["one", "two", "three"];

// small builders keep the tests readable
const racer = (currentWordIndex, extra = {}) => ({
    currentWordIndex,
    isSpectator: false,
    isEliminated: false,
    ...extra,
});
const finished = (extra) => racer(WORDS.length, extra);
const out = (idx = 1) => racer(idx, { isEliminated: true });
const spectator = () => racer(0, { isSpectator: true });
const game = (mode, players) => ({ words: WORDS, settings: { mode }, players });

describe("shouldEnd", () => {
    it("never ends a race with no racers (only spectators)", () => {
        expect(shouldEnd(game("classic", [spectator()]))).toBe(false);
    });

    describe.each(["classic", "no-mistakes"])("%s mode", (mode) => {
        it("keeps going while someone is still typing", () => {
            expect(shouldEnd(game(mode, [finished(), racer(1)]))).toBe(false);
        });

        it("ends when every racer has finished", () => {
            expect(shouldEnd(game(mode, [finished(), finished()]))).toBe(true);
        });

        it("ignores spectators", () => {
            expect(shouldEnd(game(mode, [finished(), spectator()]))).toBe(true);
        });
    });

    describe("sudden-death mode", () => {
        it("ends as soon as the first racer finishes", () => {
            expect(shouldEnd(game("sudden-death", [finished(), racer(0), racer(1)]))).toBe(true);
        });

        it("ends when only one racer is left standing", () => {
            expect(shouldEnd(game("sudden-death", [out(), out(), racer(1)]))).toBe(true);
        });

        it("keeps going while two or more racers are still in", () => {
            expect(shouldEnd(game("sudden-death", [out(), racer(1), racer(2)]))).toBe(false);
        });

        it("does not end a solo race just because one player is racing", () => {
            expect(shouldEnd(game("sudden-death", [racer(1)]))).toBe(false);
        });

        it("ends a solo race when that player is eliminated", () => {
            expect(shouldEnd(game("sudden-death", [out()]))).toBe(true);
        });
    });
});
