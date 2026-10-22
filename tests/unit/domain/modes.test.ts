import { describe, it, expect } from "vitest";
import { ClassicMode } from "../../../src/domain/modes/ClassicMode";
import { FlawlessMode } from "../../../src/domain/modes/FlawlessMode";
import { SuddenDeathMode } from "../../../src/domain/modes/SuddenDeathMode";
import { createDefaultModeRegistry } from "../../../src/domain/modes/modeRegistry";
import type { ModeStrategy } from "../../../src/domain/modes/ModeStrategy";
import {
    WORDS,
    finished,
    makeGame,
    makePlayer,
    out,
    racing,
    spectator,
} from "../../fakes/builders";

const MINUTE = 60_000;
const modes: ModeStrategy[] = [new ClassicMode(), new FlawlessMode(), new SuddenDeathMode()];

describe("every mode", () => {
    describe.each(modes.map((m) => [m.id, m] as const))("%s", (_id, mode) => {
        it("moves the player to the next word on a correct word", () => {
            const player = makePlayer({ wordIndex: 1 });

            const patch = mode.onCorrectWord(player, makeGame(), 1000);

            expect(patch).toEqual({ wordIndex: 2 });
        });

        it("sets the final WPM when the last word is typed", () => {
            const player = makePlayer({ wordIndex: WORDS.length - 1 });
            const game = makeGame({ startTime: 0 });

            const patch = mode.onCorrectWord(player, game, MINUTE); // 4 words in 1 minute

            expect(patch).toEqual({ wordIndex: WORDS.length, wpm: 4 });
        });

        it("never ends a race with only spectators", () => {
            expect(mode.shouldEnd(makeGame({ players: [spectator()] }))).toBe(false);
        });

        it("ends when every racer has finished", () => {
            expect(mode.shouldEnd(makeGame({ players: [finished(), finished()] }))).toBe(true);
        });
    });
});

describe("ClassicMode", () => {
    const mode = new ClassicMode();

    it("ignores a wrong word", () => {
        expect(mode.onWrongWord()).toBeNull();
    });

    it("keeps going while someone is still typing", () => {
        expect(mode.shouldEnd(makeGame({ players: [finished(), racing()] }))).toBe(false);
    });
});

describe("FlawlessMode", () => {
    const mode = new FlawlessMode();

    it("sends the player back to word 0 on a wrong word", () => {
        const player = makePlayer({ wordIndex: 3, mistakes: 1 });

        expect(mode.onWrongWord(player)).toEqual({ wordIndex: 0, mistakes: 2 });
    });

    it("keeps going while someone is still typing", () => {
        expect(mode.shouldEnd(makeGame({ players: [finished(), racing()] }))).toBe(false);
    });
});

describe("SuddenDeathMode", () => {
    const mode = new SuddenDeathMode();

    it("eliminates the player on a wrong word and freezes their WPM", () => {
        const player = makePlayer({ wordIndex: 2 });
        const game = makeGame({ startTime: 0 });

        const patch = mode.onWrongWord(player, game, MINUTE);

        expect(patch).toEqual({ isEliminated: true, mistakes: 1, wpm: 2 });
    });

    it("ends as soon as the first racer finishes", () => {
        expect(mode.shouldEnd(makeGame({ players: [finished(), racing(0), racing(1)] }))).toBe(
            true,
        );
    });

    it("ends when only one racer is left standing", () => {
        expect(mode.shouldEnd(makeGame({ players: [out(), out(), racing()] }))).toBe(true);
    });

    it("keeps going while two or more racers are still in", () => {
        expect(mode.shouldEnd(makeGame({ players: [out(), racing(), racing(2)] }))).toBe(false);
    });

    it("does not end a solo race while the player is still typing", () => {
        expect(mode.shouldEnd(makeGame({ players: [racing()] }))).toBe(false);
    });

    it("ends a solo race when that player is eliminated", () => {
        expect(mode.shouldEnd(makeGame({ players: [out()] }))).toBe(true);
    });
});

describe("ModeRegistry", () => {
    it("returns the strategy for each mode id", () => {
        const registry = createDefaultModeRegistry();

        expect(registry.get("classic")).toBeInstanceOf(ClassicMode);
        expect(registry.get("no-mistakes")).toBeInstanceOf(FlawlessMode);
        expect(registry.get("sudden-death")).toBeInstanceOf(SuddenDeathMode);
    });
});
