import { CHAT_HISTORY_SIZE } from "../../config/constants";
import type { ChatMessage, GameId } from "../../domain/types";
import type { ChatRepository } from "../../ports/ChatRepository";

export class InMemoryChatRepository implements ChatRepository {
    private readonly history = new Map<GameId, ChatMessage[]>();

    constructor(private readonly maxMessages = CHAT_HISTORY_SIZE) {}

    async add(gameId: GameId, message: ChatMessage): Promise<void> {
        const list = this.history.get(gameId) ?? [];
        list.push({ ...message });
        if (list.length > this.maxMessages) list.splice(0, list.length - this.maxMessages);
        this.history.set(gameId, list);
    }

    async recent(gameId: GameId): Promise<ChatMessage[]> {
        return (this.history.get(gameId) ?? []).map((m) => ({ ...m }));
    }

    async clear(gameId: GameId): Promise<void> {
        this.history.delete(gameId);
    }
}
