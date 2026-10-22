import { describe, expect, it } from "vitest";
import { keys } from "../../../src/adapters/redis/keys";

describe("Redis keys", () => {
    it("builds the key names from Architecture.md §5.1", () => {
        expect(keys.game("ABC234")).toBe("game:ABC234");
        expect(keys.player("ABC234", "p1")).toBe("game:ABC234:player:p1");
        expect(keys.session("sock1")).toBe("socket:sock1");
        expect(keys.leaderboard("classic")).toBe("leaderboard:classic");
    });

    it("starts every per-room key with game:{id}", () => {
        const roomKeys = [
            keys.game("ABC234"),
            keys.players("ABC234"),
            keys.player("ABC234", "p1"),
            keys.chat("ABC234"),
            keys.history("ABC234"),
        ];

        expect(roomKeys.every((k) => k.startsWith("game:ABC234"))).toBe(true);
    });
});
