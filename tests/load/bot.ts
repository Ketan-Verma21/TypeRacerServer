// One simulated player: a real Socket.IO connection that behaves like the app.
import { io as connect, type Socket } from "socket.io-client";
import type { Metrics } from "./metrics";

export interface PlayerState {
    _id: string;
    currentWordIndex: number;
}

export interface GameState {
    _id: string;
    words: string[];
    players: PlayerState[];
    isJoin: boolean;
    isOver: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Bot {
    game?: GameState;
    gameId?: string;
    playerId?: string;
    private readonly waiters = new Set<() => void>();
    private droppedAt?: number;
    private closing = false;

    private constructor(
        readonly socket: Socket,
        private readonly metrics: Metrics,
    ) {
        socket.on("updateGame", (game: GameState) => {
            this.game = game;
            for (const wake of [...this.waiters]) wake();
        });
        socket.on("joined", (d: { gameId: string; playerId: string }) => {
            this.gameId = d.gameId;
            this.playerId = d.playerId;
            if (this.droppedAt !== undefined) {
                metrics.rejoined++;
                metrics.rejoinTimes.push(Date.now() - this.droppedAt);
                this.droppedAt = undefined;
            }
        });
        socket.on("error-message", (e: { code?: string }) => metrics.error(`server:${e.code}`));
        socket.on("disconnect", () => {
            metrics.onDisconnect(this.closing);
            if (!this.closing) this.droppedAt ??= Date.now();
        });
        // Like the app: after a reconnect, tell the server who we are.
        socket.io.on("reconnect", () => {
            metrics.onConnect();
            if (this.gameId && this.playerId) {
                socket.emit("rejoin-game", { gameId: this.gameId, playerId: this.playerId });
            }
        });
    }

    /** Connects through Nginx (WebSocket only, like the app). */
    static async connect(url: string, metrics: Metrics): Promise<Bot> {
        const socket = connect(url, {
            transports: ["websocket"],
            forceNew: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 2000,
            timeout: 10_000,
        });
        const bot = new Bot(socket, metrics);
        await new Promise<void>((resolve, reject) => {
            socket.once("connect", () => resolve());
            socket.once("connect_error", (err: Error) => reject(err));
        });
        metrics.onConnect();
        return bot;
    }

    /** Resolves true as soon as `check()` holds (re-checked on every updateGame), false after `ms`. */
    waitUntil(check: (game: GameState) => boolean, ms: number): Promise<boolean> {
        return new Promise((resolve) => {
            const done = (result: boolean): void => {
                clearTimeout(timer);
                this.waiters.delete(wake);
                resolve(result);
            };
            const wake = (): void => {
                if (this.game && check(this.game)) done(true);
            };
            const timer = setTimeout(() => done(false), ms);
            this.waiters.add(wake);
            wake();
        });
    }

    /** Waits for the server's `joined` reply after create / join. */
    async joinedGame(ms = 10_000): Promise<string> {
        const start = Date.now();
        while (!this.gameId) {
            if (Date.now() - start > ms) throw new Error("no joined reply");
            await sleep(20);
        }
        return this.gameId;
    }

    wordIndex(game = this.game): number {
        return game?.players.find((p) => p._id === this.playerId)?.currentWordIndex ?? 0;
    }

    /**
     * Types the quote: send one word, wait until a broadcast shows it (that wait
     * is the measured latency), pause like a human, repeat. A word that isn't
     * confirmed within 3 s (e.g. our server just died) is sent again.
     */
    async race(wordIntervalMs: number, deadline: number): Promise<void> {
        while (this.game && !this.game.isOver && Date.now() < deadline) {
            const words = this.game.words;
            const index = this.wordIndex();
            if (index >= words.length) return; // finished
            const sentAt = Date.now();
            this.socket.emit("userInput", { gameId: this.gameId, userInput: `${words[index]} ` });
            this.metrics.wordsSent++;
            const seen = await this.waitUntil((g) => g.isOver || this.wordIndex(g) > index, 3000);
            if (!seen) {
                this.metrics.wordsResent++;
                continue;
            }
            if (this.wordIndex() > index) this.metrics.wordLatencies.push(Date.now() - sentAt);
            await sleep(wordIntervalMs * (0.7 + Math.random() * 0.6)); // ±30 % like a human
        }
    }

    close(): void {
        this.closing = true;
        this.socket.io.reconnection(false);
        this.socket.disconnect();
    }
}
