import { describe, expect, it } from "vitest";
import {
    ROOM_CODE_ALPHABET,
    generateRoomCode,
    isValidRoomCode,
    normalizeRoomCode,
} from "../../../src/domain/roomCode";

describe("room codes", () => {
    it("leaves out characters that are easy to confuse", () => {
        for (const c of ["0", "O", "1", "I"]) expect(ROOM_CODE_ALPHABET).not.toContain(c);
        expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    });

    it("accepts 6 characters from the alphabet", () => {
        expect(isValidRoomCode("K7P2QX")).toBe(true);
    });

    it.each(["K7P2Q", "K7P2QXX", "K7P2Q0", "k7p2qx", "K7P 2Q", ""])("rejects %j", (code) => {
        expect(isValidRoomCode(code)).toBe(false);
    });

    it("normalizes what players type", () => {
        expect(normalizeRoomCode("  k7p2qx ")).toBe("K7P2QX");
        expect(normalizeRoomCode(undefined)).toBe("");
    });

    it("generates valid codes from any random source", () => {
        expect(generateRoomCode(() => 0)).toBe("AAAAAA");
        expect(generateRoomCode((max) => max - 1)).toBe("999999");
        expect(isValidRoomCode(generateRoomCode((max) => Math.floor(Math.random() * max)))).toBe(
            true,
        );
    });
});
