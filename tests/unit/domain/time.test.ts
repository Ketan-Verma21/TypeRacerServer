// First TypeScript test: same style as the JS ones, but the compiler now
// checks argument types too (try calling calculateWpm("10", 1000)).
import { describe, it, expect } from "vitest";
import { calculateWpm, formatClock } from "../../../src/domain/time";

describe("calculateWpm", () => {
    it("counts completed words per minute", () => {
        expect(calculateWpm(30, 60_000)).toBe(30);
    });

    it("scales shorter races up to a minute", () => {
        expect(calculateWpm(10, 30_000)).toBe(20);
    });

    it("rounds down", () => {
        expect(calculateWpm(7, 40_000)).toBe(10); // 10.5
    });

    it("returns 0 when no time has passed", () => {
        expect(calculateWpm(5, 0)).toBe(0);
        expect(calculateWpm(0, 0)).toBe(0);
    });
});

describe("formatClock", () => {
    it.each([
        [0, "0:00"],
        [9, "0:09"],
        [65, "1:05"],
        [120, "2:00"],
    ])("formats %i seconds as %s", (seconds, expected) => {
        expect(formatClock(seconds)).toBe(expected);
    });

    it("never shows negative time", () => {
        expect(formatClock(-3)).toBe("0:00");
    });
});
