// First unit tests: pure functions, no database, no sockets.
// Pattern: Arrange (inputs) -> Act (call) -> Assert (expect).
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// The server is CommonJS, so load it with require (same instance the app uses).
const require = createRequire(import.meta.url);
const { calculateTime, calculateWPM, cleanName } = require("../../utils/helpers");

describe("calculateTime", () => {
    it("formats seconds as m:ss", () => {
        expect(calculateTime(0)).toBe("0:00");
        expect(calculateTime(9)).toBe("0:09");
        expect(calculateTime(65)).toBe("1:05");
        expect(calculateTime(120)).toBe("2:00");
    });
});

describe("calculateWPM", () => {
    const start = 1_000_000;

    it("counts completed words per minute", () => {
        const player = { currentWordIndex: 30 };
        expect(calculateWPM(start + 60_000, start, player)).toBe(30);
    });

    it("scales to a full minute for shorter races", () => {
        const player = { currentWordIndex: 10 };
        expect(calculateWPM(start + 30_000, start, player)).toBe(20);
    });

    it("rounds down", () => {
        const player = { currentWordIndex: 7 }; // 7 words in 40 s = 10.5 WPM
        expect(calculateWPM(start + 40_000, start, player)).toBe(10);
    });

    it("returns 0 instead of Infinity or NaN when no time has passed", () => {
        expect(calculateWPM(start, start, { currentWordIndex: 5 })).toBe(0);
        expect(calculateWPM(start, start, { currentWordIndex: 0 })).toBe(0);
    });
});

describe("cleanName", () => {
    it("trims spaces", () => {
        expect(cleanName("  Ketan  ")).toBe("Ketan");
    });

    it("cuts names to 16 characters", () => {
        expect(cleanName("abcdefghijklmnopqrstuvwxyz")).toBe("abcdefghijklmnop");
    });

    it("turns missing or non-string values into a string", () => {
        expect(cleanName(undefined)).toBe("");
        expect(cleanName(null)).toBe("");
        expect(cleanName(123)).toBe("123");
    });
});
