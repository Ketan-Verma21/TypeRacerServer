// Two game servers in this process, sharing one REAL Redis (store + adapter),
// with a player connected to each. Runs only with REDIS_TEST_URL:
//   REDIS_TEST_URL=redis://localhost:6379/15 npm run test:redis
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import type { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApp } from "../../src/app";
import { loadConfig } from "../../src/config/env";
import { buildContainer } from "../../src/container";
import { attachRedisAdapter } from "../../src/infra/redisAdapter";
import { createSocketServer } from "../../src/transport/socket/createSocketServer";
import { registerSocketHandlers } from "../../src/transport/socket/registerSocketHandlers";
import type { IoServer } from "../../src/transport/socket/types";
import { connectRealRedis, realRedisUrl } from "../fakes/realRedis";

const url = realRedisUrl();
const silent = { info: () => {}, warn: () => {}, error: () => {} };

interface GameDto {
    _id: string;
    words: string[];
    players: { nickname: string; currentWordIndex: number }[];
}

interface Instance {
    url: string;
    close(): Promise<void>;
}

/** One game server: HTTP + Socket.IO + Redis store + Redis adapter. */
async function startServer(name: string): Promise<Instance> {
    const redis: Redis = connectRealRedis(url);
    const httpServer = http.createServer(createHttpApp());
    const ioServer: Server = createSocketServer(httpServer);
    // Own channel prefix, so a running Docker game server never sees test traffic.
    const closeAdapter = attachRedisAdapter(ioServer, redis, () => {}, "socket.io-test");
    const io = ioServer as unknown as IoServer;
    const config = loadConfig({ STORE: "redis", REDIS_URL: url, INSTANCE_ID: name });
    const container = buildContainer(config, io, silent, redis);
    registerSocketHandlers(io, container);
    httpServer.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    return {
        url: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
        close: async () => {
            container.stop();
            await new Promise<void>((resolve) => ioServer.close(() => resolve()));
            await closeAdapter();
            await redis.quit();
        },
    };
}

function next<T>(socket: Socket, event: string, match: (d: T) => boolean = () => true, ms = 5000) {
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

let a: Instance;
let b: Instance;
let sockets: Socket[] = [];

async function player(server: Instance): Promise<Socket> {
    const socket = connect(server.url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
    });
    sockets.push(socket);
    await next(socket, "connect");
    return socket;
}

/** Host on server A creates a room; guest on server B joins it. */
async function hostOnAGuestOnB() {
    const host = await player(a);
    const joined = next<{ gameId: string }>(host, "joined");
    host.emit("create-game", { nickname: "Host" });
    const { gameId } = await joined;

    const guest = await player(b);
    const hostSeesGuest = next<GameDto>(host, "updateGame", (g) => g.players.length === 2);
    guest.emit("join-game", { nickname: "Guest", gameId });
    const game = await hostSeesGuest;
    return { host, guest, gameId, game };
}

describe.skipIf(!url)("two servers sharing Redis", () => {
    beforeEach(async () => {
        const redis = connectRealRedis(url);
        await redis.flushdb();
        await redis.quit();
        a = await startServer("appA");
        b = await startServer("appB");
    });

    afterEach(async () => {
        for (const s of sockets) s.disconnect();
        sockets = [];
        await Promise.all([a.close(), b.close()]);
    });

    it("sends the creator their new room right away (regression: the adapter's async join)", async () => {
        const host = await player(a);
        const firstState = next<GameDto>(host, "updateGame", () => true, 2000);

        host.emit("create-game", { nickname: "Host" });

        expect((await firstState).players.map((p) => p.nickname)).toEqual(["Host"]);
    });

    it("lets a player on server B join a room created on server A, and A's player sees it", async () => {
        const { game } = await hostOnAGuestOnB();

        expect(game.players.map((p) => p.nickname)).toEqual(["Host", "Guest"]);
    });

    it("sends the race clock to both, and shows A's player a word typed on B", async () => {
        const { host, guest, gameId, game } = await hostOnAGuestOnB();
        // the clock runs on server A; the guest on B must still get every tick
        const guestRacing = next<{ msg: string }>(
            guest,
            "timer",
            (t) => t.msg === "Time Remaining",
            10_000,
        );

        host.emit("timer", { gameId });
        await guestRacing;

        const hostSeesWord = next<GameDto>(host, "updateGame", (g) =>
            g.players.some((p) => p.nickname === "Guest" && p.currentWordIndex === 1),
        );
        guest.emit("userInput", { gameId, userInput: `${game.words[0]} ` });
        await hostSeesWord;

        // leave, so the room is deleted and server A's race clock stops
        guest.emit("leave-game", { gameId });
        await next<GameDto>(host, "updateGame", (g) => g.players.length === 1);
        host.emit("leave-game", { gameId });
        await new Promise((r) => setTimeout(r, 100));
    }, 20_000);

    it("delivers chat from a player on B to a player on A", async () => {
        const { host, guest, gameId } = await hostOnAGuestOnB();
        const hostGetsChat = next<{ text: string }>(host, "chat-message");

        guest.emit("chat-message", { gameId, text: "hi from server B" });

        expect((await hostGetsChat).text).toBe("hi from server B");
    });
});
