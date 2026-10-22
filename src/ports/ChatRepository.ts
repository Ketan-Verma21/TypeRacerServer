import type { ChatMessage, GameId } from "../domain/types";

export interface ChatRepository {
    /** Stores a message, keeping only the most recent ones. */
    add(gameId: GameId, message: ChatMessage): Promise<void>;
    recent(gameId: GameId): Promise<ChatMessage[]>;
    clear(gameId: GameId): Promise<void>;
}
