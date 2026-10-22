// Thin socket handlers: validated payload + session -> ONE service call.
// No game rules here (services/ and domain/), no error plumbing (withHandler).
import { isValidRoomCode, normalizeRoomCode } from "../../domain/roomCode";
import type { Session } from "../../domain/types";
import type { Logger } from "../../ports/Logger";
import type { SessionStore } from "../../ports/SessionStore";
import type { ChatService } from "../../services/ChatService";
import type { GameService, JoinResult } from "../../services/GameService";
import type { PresenceService } from "../../services/PresenceService";
import { ValidationError } from "../../domain/errors";
import { ClientEvents, ServerEvents } from "./events";
import { Schemas } from "./schemas";
import type { IoServer, ServerSocket } from "./types";
import { createOn } from "./withHandler";

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

const BAD_ROOM_CODE = "Please enter a valid game id";

export function registerSocketHandlers(io: IoServer, deps: SocketHandlerDeps): void {
    io.on("connection", (socket) => handleConnection(socket, deps));
}

export function handleConnection(socket: ServerSocket, deps: SocketHandlerDeps): void {
    const { gameService, chatService, presence, sessions, connections, logger } = deps;
    const on = createOn(socket, logger);
    connections.track(socket);

    /** This socket's session, only if it belongs to `gameId`. */
    const sessionFor = async (gameId: string): Promise<Session | null> => {
        const s = await sessions.get(socket.id);
        return s && s.gameId === normalizeRoomCode(gameId) ? s : null;
    };
    /** Remember who this connection is, and tell the app. */
    const joined = async ({ game, player }: JoinResult) => {
        await sessions.set(socket.id, {
            gameId: game.id,
            playerId: player.id,
            nickname: player.nickname,
        });
        socket.emit(ServerEvents.joined, { gameId: game.id, playerId: player.id });
    };

    on(
        ClientEvents.createGame,
        Schemas.createGame,
        async (d) => joined(await gameService.createGame(d.nickname, socket.id)),
        {
            showOnScreen: true,
            invalidMessage: "Please enter your name",
            failureMessage: "Couldn't create a room right now. Please try again.",
        },
    );

    on(
        ClientEvents.joinGame,
        Schemas.joinGame,
        async (d) => {
            const code = normalizeRoomCode(d.gameId);
            if (!isValidRoomCode(code)) throw new ValidationError(BAD_ROOM_CODE);
            await joined(await gameService.joinGame(code, d.nickname, socket.id));
        },
        {
            showOnScreen: true,
            invalidMessage: BAD_ROOM_CODE,
            failureMessage: "Couldn't join the room right now. Please try again.",
        },
    );

    on(ClientEvents.updateSettings, Schemas.updateSettings, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.updateSettings(s, d.settings);
    });

    // The host comes from the session, never from the payload.
    on(ClientEvents.startTimer, Schemas.startTimer, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.startRace(s);
    });

    on(ClientEvents.userInput, Schemas.userInput, async (d) => {
        if (!d.userInput.trim()) return;
        const s = await sessionFor(d.gameId);
        if (s) await gameService.submitWord(s, d.userInput);
    });

    on(ClientEvents.rematch, Schemas.rematch, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await gameService.rematch(s);
    });

    on(ClientEvents.chatMessage, Schemas.chatMessage, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.send(s, socket.id, d.text);
    });

    on(ClientEvents.chatSync, Schemas.chatSync, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.sendHistory(s, socket.id);
    });

    on(ClientEvents.reaction, Schemas.reaction, async (d) => {
        const s = await sessionFor(d.gameId);
        if (s) await chatService.react(s, socket.id, d.emoji);
    });

    // "Back to Home" or the game screen closed: leave right away.
    on(ClientEvents.leaveGame, Schemas.leaveGame, async (d) => {
        const s = await sessionFor(d.gameId);
        if (!s) return; // already left / not ours
        await sessions.delete(socket.id);
        presence.reconnected(s.playerId); // cancel any pending removal
        await gameService.leaveGame(s.gameId, s.playerId);
    });

    // A reconnecting client (new socket id) reattaches to its player.
    on(
        ClientEvents.rejoinGame,
        Schemas.rejoinGame,
        async (d) => {
            const result = await gameService.reattach(
                normalizeRoomCode(d.gameId),
                d.playerId,
                socket.id,
            );
            presence.reconnected(d.playerId);
            await joined(result);
        },
        { showOnScreen: true },
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
