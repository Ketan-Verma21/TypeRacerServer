// End to end: a real HTTP + Socket.IO 4 server in this process (in-memory
// store), and real socket.io-client sockets talking to it over WebSockets.
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../../src/app";
import { loadConfig } from "../../src/config/env";
import { buildContainer } from "../../src/container";
import { createSocketServer } from "../../src/transport/socket/createSocketServer";
import { registerSocketHandlers } from "../../src/transport/socket/registerSocketHandlers";
import type { IoServer } from "../../src/transport/socket/types";

const silent = { info: () => {}, warn: () => {}, error: () => {} };

interface Joined {
    gameId: string;
    playerId: string;
}
interface GameDto {
    _id: string;
    players: { nickname: string; isPartyLeader: boolean }[];
}

let httpServer: http.Server;
let ioServer: Server;
let url: string;
let clients: Socket[] = [];

/** Resolves with the next `event` payload that matches, or fails after `ms`. */
function next<T>(
    socket: Socket,
    event: string,
    match: (data: T) => boolean = () => true,
    ms = 3000,
) {
    return new Promise<T>((resolve, reject) => {
        const handler = (data: T) => {
            if (!match(data)) return;
            clearTimeout(timer);
            socket.off(event, handler);
            resolve(data);
        };
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`timed out waiting for "${event}"`));
        }, ms);
        socket.on(event, handler);
    });
}

async function player(): Promise<Socket> {
    const socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(socket);
    await next(socket, "connect");
    return socket;
}

/** Host creates a room, a guest joins it. */
async function hostAndGuest() {
    const host = await player();
    const hostJoined = next<Joined>(host, "joined");
    host.emit("create-game", { nickname: "Host" });
    const { gameId } = await hostJoined;

    const guest = await player();
    const hostSeesTwo = next<GameDto>(host, "updateGame", (g) => g.players.length === 2);
    guest.emit("join-game", { nickname: "Guest", gameId });
    await hostSeesTwo;
    return { host, guest, gameId };
}

beforeEach(async () => {
    httpServer = http.createServer(createHttpApp());
    ioServer = createSocketServer(httpServer);
    const io = ioServer as unknown as IoServer;
    registerSocketHandlers(io, buildContainer(loadConfig({}), io, silent));
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
    for (const c of clients) c.disconnect();
    clients = [];
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
});

describe("Socket.IO 4 end to end", () => {
    it("creates a room and tells the creator who they are", async () => {
        const host = await player();
        const joined = next<Joined>(host, "joined");
        const state = next<GameDto>(host, "updateGame");

        host.emit("create-game", { nickname: "Host" });

        const { gameId, playerId } = await joined;
        expect(gameId).toMatch(/^[A-Z2-9]{6}$/);
        expect(playerId).toBeTruthy();
        expect((await state).players).toEqual([
            expect.objectContaining({ nickname: "Host", isPartyLeader: true }),
        ]);
    });

    it("lets a second player join with the room code", async () => {
        const { gameId } = await hostAndGuest();

        expect(gameId).toHaveLength(6);
    });

    it("sends the countdown to everyone when the host starts", async () => {
        const { host, guest, gameId } = await hostAndGuest();
        const hostTick = next<{ msg: string }>(host, "timer", (t) => t.msg === "Game Starting");
        const guestTick = next<{ msg: string }>(guest, "timer", (t) => t.msg === "Game Starting");

        host.emit("timer", { gameId });

        await Promise.all([hostTick, guestTick]);

        // Leave, so the room is deleted and no race clock keeps running after the test.
        const hostAlone = next<GameDto>(host, "updateGame", (g) => g.players.length === 1);
        guest.emit("leave-game", { gameId });
        await hostAlone;
        host.emit("leave-game", { gameId });
        await new Promise((r) => setTimeout(r, 50));
    });

    it("answers get-leaderboard", async () => {
        const socket = await player();
        const reply = next<{ mode: string; entries: unknown[] }>(socket, "leaderboard");

        socket.emit("get-leaderboard", { mode: "classic" });

        expect(await reply).toEqual({ mode: "classic", entries: [] });
    });
});
