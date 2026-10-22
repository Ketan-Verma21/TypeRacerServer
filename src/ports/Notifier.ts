// PORT: how services tell players what happened. Services describe events
// in game terms; the socket adapter decides event names and payload shapes.
import type { ChatMessage, Game, GameId, ReactionEvent } from "../domain/types";

export interface TimerUpdate {
    countDown: string | number;
    msg: "Game Starting" | "Time Remaining" | "Waiting for players";
}

export interface Notifier {
    gameChanged(game: Game): void;
    timer(gameId: GameId, update: TimerUpdate): void;
    /** The race is over (to the whole room). */
    raceOver(gameId: GameId): void;
    /** This one player finished their quote. */
    playerFinished(socketId: string): void;
    chatMessage(gameId: GameId, message: ChatMessage): void;
    chatHistory(socketId: string, messages: ChatMessage[]): void;
    reaction(gameId: GameId, reaction: ReactionEvent): void;
}
