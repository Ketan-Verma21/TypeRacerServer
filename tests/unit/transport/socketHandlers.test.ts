// Socket handlers with a fake socket and the real services (in-memory).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemorySessionStore } from "../../../src/adapters/memory/InMemorySessionStore";
import { RandomIdGenerator } from "../../../src/adapters/RandomIdGenerator";
import type { Logger } from "../../../src/ports/Logger";
import { handleConnection } from "../../../src/transport/socket/registerSocketHandlers";
import type { ServerSocket } from "../../../src/transport/socket/types";
import { createTestApp } from "../../fakes/testApp";

type Listener = (data?: unknown) => void;

class FakeSocket implements ServerSocket {
    readonly handlers = new Map<string, Listener>();
    readonly emitted: { event: string; args: unknown[] }[] = [];
    constructor(readonly id: string) {}
    on(event: string, listener: Listener): void {
        this.handlers.set(event, listener);
    }
    emit(event: string, ...args: unknown[]): void {
        this.emitted.push({ event, args });
    }
    join(): void {}
    leave(): void {}
    /** Simulates the client sending an event, then waits for the handler to finish. */
    async send(event: string, data?: unknown): Promise<void> {
        this.handlers.get(event)?.(data);
        await settle();
    }
    errors(): unknown[] {
        return this.emitted.filter((e) => e.event === "notCorrectGame").map((e) => e.args[0]);
    }
}

const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

let app: ReturnType<typeof createTestApp>;
let sessions: InMemorySessionStore;
let logger: Logger;

function connect(id: string): FakeSocket {
    const socket = new FakeSocket(id);
    handleConnection(socket, {
        gameService: app.gameService,
        chatService: app.chatService,
        presence: app.presence,
        sessions,
        connections: { track: () => {}, untrack: () => {} },
        logger,
    });
    return socket;
}

/** Host creates a room, guest joins it. */
async function hostAndGuest() {
    const host = connect("s-host");
    await host.send("create-game", { nickname: "Host" });
    const gameId = (await sessions.get("s-host"))!.gameId;
    const guest = connect("s-guest");
    await guest.send("join-game", { nickname: "Guest", gameId });
    return { host, guest, gameId };
}

beforeEach(() => {
    app = createTestApp({ ids: new RandomIdGenerator() });
    sessions = new InMemorySessionStore();
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
});

describe("create-game", () => {
    it("creates a room and remembers the socket's session", async () => {
        const socket = connect("s1");

        await socket.send("create-game", { nickname: "Ketan" });

        expect(await sessions.get("s1")).toMatchObject({ nickname: "Ketan" });
        expect(socket.errors()).toEqual([]);
    });

    it("tells the player to enter a name", async () => {
        const socket = connect("s1");

        await socket.send("create-game", { nickname: "  " });

        expect(socket.errors()).toEqual(["Please enter your name"]);
    });

    it("tells the player when the room can't be created, and logs it", async () => {
        app.quoteProvider.willFail();
        const socket = connect("s1");

        await socket.send("create-game", { nickname: "Ketan" });

        expect(socket.errors()).toEqual(["Couldn't create a room right now. Please try again."]);
        expect(logger.error).toHaveBeenCalled();
    });

    it("survives a missing payload", async () => {
        const socket = connect("s1");

        await socket.send("create-game");

        expect(socket.errors()).toEqual(["Please enter your name"]);
    });
});

describe("join-game", () => {
    it("rejects a malformed game id", async () => {
        const socket = connect("s1");

        await socket.send("join-game", { nickname: "Ketan", gameId: "abc" });

        expect(socket.errors()).toEqual(["Please enter a valid game id"]);
    });

    it("rejects an unknown game", async () => {
        const socket = connect("s1");

        await socket.send("join-game", { nickname: "Ketan", gameId: "a".repeat(24) });

        expect(socket.errors()).toEqual(["Please enter a valid game id"]);
    });

    it("joins an existing room", async () => {
        const { gameId } = await hostAndGuest();

        expect((await app.games.get(gameId))!.players).toHaveLength(2);
    });
});

describe("timer (start race)", () => {
    it("starts the countdown for the host", async () => {
        const { host, gameId } = await hostAndGuest();

        await host.send("timer", { gameId, playerId: "ignored" });

        expect(app.raceClock.isRunning(gameId)).toBe(true);
    });

    it("ignores a guest who sends the host's playerId (regression)", async () => {
        const { guest, gameId } = await hostAndGuest();
        const hostId = (await sessions.get("s-host"))!.playerId;

        await guest.send("timer", { gameId, playerId: hostId });

        expect(app.raceClock.isRunning(gameId)).toBe(false);
    });

    it("ignores a start request for another game", async () => {
        const { host, gameId } = await hostAndGuest();

        await host.send("timer", { gameId: "b".repeat(24) });

        expect(app.raceClock.isRunning(gameId)).toBe(false);
    });
});

describe("userInput", () => {
    it("passes the typed word to the race", async () => {
        const { host, gameId } = await hostAndGuest();
        await host.send("timer", { gameId });
        await app.scheduler.tick(7);

        await host.send("userInput", { userInput: "the ", gameId });

        expect((await app.games.get(gameId))!.players[0]!.wordIndex).toBe(1);
    });
});

describe("leaving and reconnecting", () => {
    it("leave-game removes the player right away", async () => {
        const { guest, gameId } = await hostAndGuest();

        await guest.send("leave-game", { gameId });

        expect((await app.games.get(gameId))!.players).toHaveLength(1);
        expect(await sessions.get("s-guest")).toBeNull();
    });

    it("a dropped player is removed after 15 s", async () => {
        const { guest, gameId } = await hostAndGuest();

        await guest.send("disconnect");
        await app.scheduler.tick(15);

        expect((await app.games.get(gameId))!.players).toHaveLength(1);
    });

    it("a player who rejoins in time keeps their place on the new socket", async () => {
        const { guest, gameId } = await hostAndGuest();
        const playerId = (await sessions.get("s-guest"))!.playerId;

        await guest.send("disconnect");
        await app.scheduler.tick(5);
        const again = connect("s-guest-2");
        await again.send("rejoin-game", { gameId, playerId });
        await app.scheduler.tick(20);

        const players = (await app.games.get(gameId))!.players;
        expect(players).toHaveLength(2);
        expect(players[1]!.socketId).toBe("s-guest-2");
    });

    it("a removed player who tries to rejoin is told so", async () => {
        const { gameId } = await hostAndGuest();
        const socket = connect("s9");

        await socket.send("rejoin-game", { gameId, playerId: "ghost" });

        expect(socket.errors()).toEqual(["You were removed from this game"]);
    });
});
