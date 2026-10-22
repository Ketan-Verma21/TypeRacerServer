import type { ChatMessage, Game, GameId, ReactionEvent } from "../../src/domain/types";
import type { Notifier, TimerUpdate } from "../../src/ports/Notifier";
import type { RoomMembership } from "../../src/ports/RoomMembership";

type Sent =
    | { type: "gameChanged"; game: Game }
    | { type: "timer"; gameId: GameId; update: TimerUpdate }
    | { type: "raceOver"; gameId: GameId }
    | { type: "playerFinished"; socketId: string }
    | { type: "chatMessage"; gameId: GameId; message: ChatMessage }
    | { type: "chatHistory"; socketId: string; messages: ChatMessage[] }
    | { type: "reaction"; gameId: GameId; reaction: ReactionEvent };

/** Records everything services "send" (and room joins/leaves) so tests can check it. */
export class FakeNotifier implements Notifier, RoomMembership {
    readonly sent: Sent[] = [];
    /** gameId -> socket ids currently in that room */
    readonly rooms = new Map<GameId, Set<string>>();

    async join(socketId: string, gameId: GameId): Promise<void> {
        if (!this.rooms.has(gameId)) this.rooms.set(gameId, new Set());
        this.rooms.get(gameId)!.add(socketId);
    }
    async leave(socketId: string, gameId: GameId): Promise<void> {
        this.rooms.get(gameId)?.delete(socketId);
    }
    membersOf(gameId: GameId): string[] {
        return [...(this.rooms.get(gameId) ?? [])];
    }

    gameChanged(game: Game): void {
        this.sent.push({ type: "gameChanged", game: structuredClone(game) });
    }
    timer(gameId: GameId, update: TimerUpdate): void {
        this.sent.push({ type: "timer", gameId, update });
    }
    raceOver(gameId: GameId): void {
        this.sent.push({ type: "raceOver", gameId });
    }
    playerFinished(socketId: string): void {
        this.sent.push({ type: "playerFinished", socketId });
    }
    chatMessage(gameId: GameId, message: ChatMessage): void {
        this.sent.push({ type: "chatMessage", gameId, message });
    }
    chatHistory(socketId: string, messages: ChatMessage[]): void {
        this.sent.push({ type: "chatHistory", socketId, messages });
    }
    reaction(gameId: GameId, reaction: ReactionEvent): void {
        this.sent.push({ type: "reaction", gameId, reaction });
    }

    /** All messages of one type, e.g. ofType("timer"). */
    ofType<T extends Sent["type"]>(type: T): Extract<Sent, { type: T }>[] {
        return this.sent.filter((s): s is Extract<Sent, { type: T }> => s.type === type);
    }

    /** The game from the most recent gameChanged. */
    get lastGame(): Game | undefined {
        return this.ofType("gameChanged").at(-1)?.game;
    }

    clear(): void {
        this.sent.length = 0;
    }
}
