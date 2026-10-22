// Socket handler tests with fake sockets: no network, no database.
// vi.spyOn replaces one function for a single test (restored automatically).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const registerGameHandlers = require("../../sockets/gameHandlers");
const gameService = require("../../services/gameService");
const timerService = require("../../services/timerService");
const Game = require("../../Models/Game");

const GAME_ID = "65f000000000000000000001";
const HOST_ID = "host-player";
const GUEST_ID = "guest-player";

// A fake socket that remembers the handlers registered on it.
function setup(session = {}) {
    const handlers = {};
    const socket = {
        id: "socket-1",
        on: (event, fn) => {
            handlers[event] = fn;
        },
        emit: vi.fn(),
        join: vi.fn(),
    };
    const roomEmit = vi.fn();
    const io = { to: vi.fn(() => ({ emit: roomEmit })) };
    const fullSession = { gameId: null, playerId: null, nickname: "", ...session };
    registerGameHandlers(io, socket, fullSession);
    return { handlers, socket, roomEmit };
}

// Just enough of a Mongoose game document for the "timer" handler.
function fakeLobby() {
    const players = [
        { _id: HOST_ID, isPartyLeader: true },
        { _id: GUEST_ID, isPartyLeader: false },
    ];
    return { isJoin: true, players: { id: (id) => players.find((p) => p._id === id) } };
}

beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {}); // keep test output clean
});

describe("timer (start race)", () => {
    beforeEach(() => {
        vi.spyOn(Game, "findById").mockResolvedValue(fakeLobby());
        vi.spyOn(timerService, "hasTimers").mockReturnValue(false);
        vi.spyOn(timerService, "startCountdown").mockImplementation(() => {});
    });

    it("starts the countdown when the host presses Start", async () => {
        const { handlers } = setup({ gameId: GAME_ID, playerId: HOST_ID });

        await handlers.timer({ playerId: HOST_ID, gameId: GAME_ID });

        expect(timerService.startCountdown).toHaveBeenCalledTimes(1);
    });

    it("ignores a guest who sends the host's playerId (regression)", async () => {
        const { handlers } = setup({ gameId: GAME_ID, playerId: GUEST_ID });

        await handlers.timer({ playerId: HOST_ID, gameId: GAME_ID });

        expect(timerService.startCountdown).not.toHaveBeenCalled();
    });

    it("ignores a start request for a game this socket is not in", async () => {
        const { handlers } = setup({ gameId: "some-other-game", playerId: HOST_ID });

        await handlers.timer({ playerId: HOST_ID, gameId: GAME_ID });

        expect(timerService.startCountdown).not.toHaveBeenCalled();
    });

    it("does not crash on an empty payload", async () => {
        const { handlers } = setup({ gameId: GAME_ID, playerId: HOST_ID });

        await handlers.timer();

        expect(timerService.startCountdown).not.toHaveBeenCalled();
    });
});

describe("create-game", () => {
    it("tells the player when the room could not be created (e.g. quote API down)", async () => {
        vi.spyOn(gameService, "createGame").mockRejectedValue(new Error("quote API down"));
        const { handlers, socket } = setup();

        await handlers["create-game"]({ nickname: "Ketan" });

        expect(socket.emit).toHaveBeenCalledWith("notCorrectGame", expect.any(String));
    });

    it("ignores an empty nickname", async () => {
        const create = vi.spyOn(gameService, "createGame");
        const { handlers } = setup();

        await handlers["create-game"]({ nickname: "   " });

        expect(create).not.toHaveBeenCalled();
    });
});

describe("join-game", () => {
    it("rejects a game id that is not 24 hex characters", async () => {
        const { handlers, socket } = setup();

        await handlers["join-game"]({ nickname: "Ketan", gameId: "abc" });

        expect(socket.emit).toHaveBeenCalledWith("notCorrectGame", "Please enter a valid game id");
    });

    it("passes the service error on (e.g. room full)", async () => {
        vi.spyOn(gameService, "joinGame").mockResolvedValue({ error: "This room is full" });
        const { handlers, socket } = setup();

        await handlers["join-game"]({ nickname: "Ketan", gameId: GAME_ID });

        expect(socket.emit).toHaveBeenCalledWith("notCorrectGame", "This room is full");
    });

    it("tells the player when joining fails unexpectedly", async () => {
        vi.spyOn(gameService, "joinGame").mockRejectedValue(new Error("db down"));
        const { handlers, socket } = setup();

        await handlers["join-game"]({ nickname: "Ketan", gameId: GAME_ID });

        expect(socket.emit).toHaveBeenCalledWith("notCorrectGame", expect.any(String));
    });
});
