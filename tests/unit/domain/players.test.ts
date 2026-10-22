import { describe, it, expect } from "vitest";
import { cleanNickname, createPlayer, resetForNewRound } from "../../../src/domain/players";
import { makePlayer } from "../../fakes/builders";

describe("cleanNickname", () => {
    it("trims and cuts names to 16 characters", () => {
        expect(cleanNickname("  Ketan  ")).toBe("Ketan");
        expect(cleanNickname("abcdefghijklmnopqrstuvwxyz")).toBe("abcdefghijklmnop");
    });

    it("turns missing or non-string values into text", () => {
        expect(cleanNickname(undefined)).toBe("");
        expect(cleanNickname(null)).toBe("");
        expect(cleanNickname(123)).toBe("123");
    });
});

describe("createPlayer", () => {
    it("starts at the first word with unknown WPM", () => {
        const p = createPlayer({ id: "p1", nickname: "Ketan", socketId: "s1", now: 42 });

        expect(p).toMatchObject({
            wordIndex: 0,
            wpm: -1,
            isHost: false,
            isSpectator: false,
            joinedAt: 42,
        });
    });
});

describe("resetForNewRound", () => {
    it("clears race progress but keeps who the player is", () => {
        const p = makePlayer({
            id: "p1",
            isHost: true,
            wordIndex: 4,
            wpm: 70,
            isEliminated: true,
            mistakes: 3,
        });

        const reset = resetForNewRound(p);

        expect(reset).toMatchObject({
            id: "p1",
            isHost: true,
            wordIndex: 0,
            wpm: -1,
            isEliminated: false,
            mistakes: 0,
        });
    });
});
