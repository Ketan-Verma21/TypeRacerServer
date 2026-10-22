import { describe, expect, it } from "vitest";
import { toGameDto } from "../../../src/transport/socket/gameDto";
import { makeGame, makePlayer } from "../../fakes/builders";

describe("toGameDto (v1-compatible updateGame payload)", () => {
    it("uses the field names the Flutter app reads", () => {
        const host = makePlayer({
            id: "p1",
            nickname: "Ketan",
            socketId: "s1",
            isHost: true,
            wordIndex: 2,
            wpm: 40,
        });
        const dto = toGameDto(
            makeGame({ id: "g1", phase: "racing", players: [host], startTime: 5 }),
        );

        expect(dto).toEqual({
            _id: "g1",
            words: ["the", "quick", "brown", "fox"],
            players: [
                {
                    _id: "p1",
                    nickname: "Ketan",
                    socketID: "s1",
                    isPartyLeader: true,
                    currentWordIndex: 2,
                    WPM: 40,
                    isSpectator: false,
                    isEliminated: false,
                    mistakes: 0,
                },
            ],
            isJoin: false,
            isOver: false,
            startTime: 5,
            settings: { mode: "classic", timeLimit: 120, length: "medium", maxPlayers: 5 },
        });
    });

    it.each([
        ["lobby", true, false],
        ["countdown", true, false],
        ["racing", false, false],
        ["over", false, true],
    ] as const)("maps phase %s to isJoin=%s, isOver=%s", (phase, isJoin, isOver) => {
        expect(toGameDto(makeGame({ phase }))).toMatchObject({ isJoin, isOver });
    });

    it("leaves out startTime before the race", () => {
        expect("startTime" in toGameDto(makeGame({ phase: "lobby", startTime: undefined }))).toBe(
            false,
        );
    });
});
