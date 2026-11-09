import { describe, expect, it } from "vitest";
import { cheatFlags, MAX_HUMAN_WPM, withCheatFlags } from "../../../src/domain/antiCheat";
import type { MatchResult } from "../../../src/domain/events";

const result = (wpm: number): MatchResult => ({
    playerId: "p1",
    nickname: "Ana",
    wpm,
    rank: 1,
    finished: true,
    eliminated: false,
});

describe("anti-cheat", () => {
    it("accepts fast but human results", () => {
        expect(cheatFlags(result(180))).toEqual([]);
        expect(cheatFlags(result(MAX_HUMAN_WPM))).toEqual([]);
    });

    it("flags results faster than any human", () => {
        expect(cheatFlags(result(MAX_HUMAN_WPM + 1))).toEqual(["impossible-wpm"]);
    });

    it("flags nonsense numbers", () => {
        expect(cheatFlags(result(Number.POSITIVE_INFINITY))).toEqual(["invalid-wpm"]);
        expect(cheatFlags(result(Number.NaN))).toEqual(["invalid-wpm"]);
    });

    it("adds flags only where needed and leaves the input untouched", () => {
        const input = [result(90), result(999)];

        const out = withCheatFlags(input);

        expect(out[0]).not.toHaveProperty("flags");
        expect(out[1]!.flags).toEqual(["impossible-wpm"]);
        expect(input[1]).not.toHaveProperty("flags");
    });
});
