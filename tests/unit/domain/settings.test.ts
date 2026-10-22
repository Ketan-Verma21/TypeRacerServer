import { describe, it, expect } from "vitest";
import { normalizeSettings } from "../../../src/domain/settings";
import type { GameSettings } from "../../../src/domain/types";

const current: GameSettings = { mode: "classic", timeLimit: 120, length: "medium", maxPlayers: 5 };

describe("normalizeSettings", () => {
    it("applies valid values", () => {
        const next = normalizeSettings(
            { mode: "sudden-death", timeLimit: 60, length: "long", maxPlayers: 8 },
            current,
            2,
        );

        expect(next).toEqual({
            mode: "sudden-death",
            timeLimit: 60,
            length: "long",
            maxPlayers: 8,
        });
    });

    it("accepts numbers sent as strings", () => {
        const next = normalizeSettings({ timeLimit: "90", maxPlayers: "4" }, current, 1);

        expect(next.timeLimit).toBe(90);
        expect(next.maxPlayers).toBe(4);
    });

    it("keeps the current value for anything invalid or missing", () => {
        const next = normalizeSettings(
            { mode: "hacker-mode", timeLimit: 45, length: "huge", maxPlayers: "lots" },
            current,
            1,
        );

        expect(next).toEqual(current);
    });

    it("never lets max players drop below the racers already in the room", () => {
        expect(normalizeSettings({ maxPlayers: 2 }, current, 4).maxPlayers).toBe(4);
    });

    it("never lets max players go above 8", () => {
        expect(normalizeSettings({ maxPlayers: 50 }, current, 1).maxPlayers).toBe(8);
    });

    it("ignores tricky keys like toString", () => {
        expect(normalizeSettings({ length: "toString" }, current, 1).length).toBe("medium");
    });
});
