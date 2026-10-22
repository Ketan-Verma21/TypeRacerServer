import type { ChatMessage, Game, GameId, ReactionEvent } from "../../domain/types";
import type { Notifier, TimerUpdate } from "../../ports/Notifier";
import type { RoomMembership } from "../../ports/RoomMembership";
import { ServerEvents } from "../../transport/socket/events";
import { toGameDto } from "../../transport/socket/gameDto";
import type { IoServer, ServerSocket } from "../../transport/socket/types";

/**
 * Turns service notifications into Socket.IO events. Every socket is in a
 * room named after its own id, so `io.to(socketId)` reaches one player.
 */
export class SocketIoNotifier implements Notifier, RoomMembership {
    private readonly sockets = new Map<string, ServerSocket>();

    constructor(private readonly io: IoServer) {}

    /** The socket layer registers each connection so rooms can be joined by id. */
    track(socket: ServerSocket): void {
        this.sockets.set(socket.id, socket);
    }

    untrack(socketId: string): void {
        this.sockets.delete(socketId);
    }

    async join(socketId: string, gameId: GameId): Promise<void> {
        this.sockets.get(socketId)?.join(gameId);
    }

    async leave(socketId: string, gameId: GameId): Promise<void> {
        this.sockets.get(socketId)?.leave(gameId);
    }

    gameChanged(game: Game): void {
        this.io.to(game.id).emit(ServerEvents.updateGame, toGameDto(game));
    }
    timer(gameId: GameId, update: TimerUpdate): void {
        this.io.to(gameId).emit(ServerEvents.timer, update);
    }
    raceOver(gameId: GameId): void {
        this.io.to(gameId).emit(ServerEvents.done);
    }
    playerFinished(socketId: string): void {
        this.io.to(socketId).emit(ServerEvents.done);
    }
    chatMessage(gameId: GameId, message: ChatMessage): void {
        this.io.to(gameId).emit(ServerEvents.chatMessage, message);
    }
    chatHistory(socketId: string, messages: ChatMessage[]): void {
        this.io.to(socketId).emit(ServerEvents.chatHistory, messages);
    }
    reaction(gameId: GameId, reaction: ReactionEvent): void {
        this.io.to(gameId).emit(ServerEvents.reaction, reaction);
    }
}
