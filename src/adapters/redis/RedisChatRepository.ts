import type { Redis } from "ioredis";
import { CHAT_HISTORY_SIZE } from "../../config/constants";
import type { ChatMessage, GameId } from "../../domain/types";
import type { ChatRepository } from "../../ports/ChatRepository";
import { keys, ROOM_TTL_SECONDS } from "./keys";

/**
 * Chat history as a capped list: RPUSH adds at the end, LTRIM keeps only the
 * last `maxMessages`. Both run in one MULTI, so the list never grows past the cap.
 */
export class RedisChatRepository implements ChatRepository {
    constructor(
        private readonly redis: Redis,
        private readonly maxMessages = CHAT_HISTORY_SIZE,
        private readonly ttlSeconds = ROOM_TTL_SECONDS,
    ) {}

    async add(gameId: GameId, message: ChatMessage): Promise<void> {
        const key = keys.chat(gameId);
        await this.redis
            .multi()
            .rpush(key, JSON.stringify(message))
            .ltrim(key, -this.maxMessages, -1)
            .expire(key, this.ttlSeconds)
            .exec();
    }

    async recent(gameId: GameId): Promise<ChatMessage[]> {
        const items = await this.redis.lrange(keys.chat(gameId), 0, -1);
        return items.map((item) => JSON.parse(item) as ChatMessage);
    }

    async clear(gameId: GameId): Promise<void> {
        await this.redis.del(keys.chat(gameId));
    }
}
