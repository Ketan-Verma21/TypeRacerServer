// Thin socket handlers: read the payload + session, call ONE service method,
// report errors. No game rules here (they live in services/ and domain/).
import { DomainError } from "../../domain/errors";
import { isValidGameId } from "../../domain/gameId";
import type { Session } from "../../domain/types";
import type { Logger } from "../../ports/Logger";
import type { SessionStore } from "../../ports/SessionStore";
import type { ChatService } from "../../services/ChatService";
import type { GameService, JoinResult } from "../../services/GameService";
import type { PresenceService } from "../../services/PresenceService";
import { ClientEvents, ServerEvents } from "./events";
import type { IoServer, ServerSocket } from "./types";

/** Lets the room adapter know which sockets exist (for joining rooms by socket id). */
export interface ConnectionTracker {
    track(socket: ServerSocket): void;
    untrack(socketId: string): void;
}

export interface SocketHandlerDeps {
    gameService: GameService;
    chatService: ChatService;
    presence: PresenceService;
    sessions: SessionStore;
    connections: ConnectionTracker;
    logger: Logger;
}

type Payload = Record<string, unknown>;
const asPayload = (data: unknown): Payload =>
    data !== null && typeof data === "object" ? (data as Payload) : {};

export function registerSocketHandlers(io: IoServer, deps: SocketHandlerDeps): void {
    io.on("connection", (socket) => handleConnection(socket, deps));
}

export function handleConnection(socket: ServerSocket, deps: SocketHandlerDeps): void {
    const { gameService, chatService, presence, sessions, connections, logger } = deps;
    connections.track(socket);

    /** Runs `fn`; expected (domain) errors are ignored or reported, others logged. */
    const on = (
        event: string,
        fn: (data: Payload) => Promise<void>,
        onDomainError?: (err: DomainError) => void,
    ) => {
        socket.on(event, (data: unknown) => {
            fn(asPayload(data)).catch((err: unknown) => {
                if (err instanceof DomainError) return onDomainError?.(err);
                logger.error("socket handler failed", {
                    event,
                    socketId: socket.id,
                    err: String(err),
                });
                if (event === ClientEvents.createGame || event === ClientEvents.joinGame) {
                    socket.emit(
                        ServerEvents.notCorrectGame,
                        `Couldn't ${event === ClientEvents.createGame ? "create" : "join"} a room right now. Please try again.`,
                    );
                }
            });
        });
    };
    const tellPlayer = (err: DomainError) => socket.emit(ServerEvents.notCorrectGame, err.message);

    /** The session of this socket, only if it belongs to `gameId`. */
    const sessionFor = async (gameId: unknown): Promise<Session | null> => {
        const s = await sessions.get(socket.id);
        return s && s.gameId === gameId ? s : null;
    };
    const remember = async ({ game, player }: JoinResult) => {
        await sessions.set(socket.id, {
            gameId: game.id,
            playerId: player.id,
            nickname: player.nickname,
        });
    };

    on(
        ClientEvents.createGame,
        async (d) => remember(await gameService.createGame(d.nickname, socket.id)),
        tellPlayer,
    );

    on(
        ClientEvents.joinGame,
        async (d) => {
            if (!isValidGameId(d.gameId)) {
                socket.emit(ServerEvents.notCorrectGame, "Please enter a valid game id");
                return;
            }
            await remember(await gameService.joinGame(d.gameId, d.nickname, socket.id));
        },
        tellPlayer,
    );

    on(ClientEvents.updateSettings, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.updateSettings(s, asPayload(d.settings));
    });

    // The host comes from the session, never from the payload's playerId.
    on(ClientEvents.startTimer, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.startRace(s);
    });

    on(ClientEvents.userInput, async (d) => {
        if (typeof d.userInput !== "string" || !d.userInput.trim()) return;
        const s = await sessionFor(d.gameId);
        if (s) await gameService.submitWord(s, d.userInput);
    });

    on(ClientEvents.rematch, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.rematch(s);
    });

    on(ClientEvents.chatMessage, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.send(s, socket.id, d.text);
    });

    on(ClientEvents.chatSync, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.sendHistory(s, socket.id);
    });

    on(ClientEvents.reaction, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.react(s, socket.id, d.emoji);
    });

    // "Back to Home" or the game screen closed: leave right away.
    on(ClientEvents.leaveGame, async (d) => {
        const s = await sessionFor(d.gameId);
        if (!s) return; // already left / not ours
        await sessions.delete(socket.id);
        presence.reconnected(s.playerId); // cancel any pending removal
        await gameService.leaveGame(s.gameId, s.playerId);
    });

    // A reconnecting client (new socket id) reattaches to its player.
    on(
        ClientEvents.rejoinGame,
        async (d) => {
            if (typeof d.gameId !== "string" || typeof d.playerId !== "string") return;
            const result = await gameService.reattach(d.gameId, d.playerId, socket.id);
            presence.reconnected(d.playerId);
            await remember(result);
        },
        tellPlayer,
    );

    // Connection dropped: give the player a grace period to come back.
    socket.on("disconnect", () => {
        connections.untrack(socket.id);
        void (async () => {
            const s = await sessions.get(socket.id);
            if (!s) return;
            await sessions.delete(socket.id);
            presence.disconnected(s.playerId, () => gameService.leaveGame(s.gameId, s.playerId));
        })().catch((err: unknown) => logger.error("disconnect failed", { err: String(err) }));
    });
}
