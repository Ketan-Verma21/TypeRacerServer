import type { ChatMessage, Game, GameId, ReactionEvent } from "../../domain/types";
import type { Notifier, TimerUpdate } from "../../ports/Notifier";
import type { RoomMembership } from "../../ports/RoomMembership";
import { ServerEvents } from "../../transport/socket/events";
import { toGameDto } from "../../transport/socket/gameDto";
import type { IoServer } from "../../transport/socket/types";

/**
 * Turns service notifications into Socket.IO events. Every socket is in a
 * room named after its own id, so `io.to(socketId)` reaches one player.
 * With the Redis adapter, broadcasts reach players on every server instance.
 */
export class SocketIoNotifier implements Notifier, RoomMembership {
    constructor(private readonly io: IoServer) {}

    // A socket is always put in / taken out of a room by the server it is
    // connected to (the one handling its create / join / rejoin / leave). So we
    // join locally, which happens at once. Through the Redis adapter, a plain
    // `io.in(id).socketsJoin()` is a pub/sub round trip that lands a moment
    // LATER — the room state sent right after would miss the new player.
    // Broadcasts to the room still reach every instance via the adapter.
    async join(socketId: string, gameId: GameId): Promise<void> {
        this.io.local.in(socketId).socketsJoin(gameId);
    }

    async leave(socketId: string, gameId: GameId): Promise<void> {
        this.io.local.in(socketId).socketsLeave(gameId);
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
