import {
    CHAT_MAX_LENGTH,
    CHAT_MIN_INTERVAL_MS,
    REACTION_MIN_INTERVAL_MS,
    REACTIONS,
    type Reaction,
} from "../config/constants";
import type { Session } from "../domain/types";
import type { ChatRepository } from "../ports/ChatRepository";
import type { Clock } from "../ports/Clock";
import type { IdGenerator } from "../ports/IdGenerator";
import type { Notifier } from "../ports/Notifier";
import type { RateLimiter } from "../ports/RateLimiter";

export interface ChatServiceDeps {
    chat: ChatRepository;
    notifier: Notifier;
    limiter: RateLimiter;
    clock: Clock;
    ids: IdGenerator;
}

const isReaction = (v: unknown): v is Reaction => REACTIONS.includes(v as Reaction);

/** Lobby chat + emoji reactions. Too-fast or invalid input is silently dropped. */
export class ChatService {
    constructor(private readonly deps: ChatServiceDeps) {}

    async send(session: Session, socketId: string, rawText: unknown): Promise<void> {
        const { chat, notifier, limiter, clock } = this.deps;
        if (typeof rawText !== "string") return;
        const text = rawText.trim().slice(0, CHAT_MAX_LENGTH);
        if (!text) return;
        if (!(await limiter.allow(`chat:${socketId}`, CHAT_MIN_INTERVAL_MS))) return;

        const message = {
            playerId: session.playerId,
            nickname: session.nickname,
            text,
            ts: clock.now(),
        };
        await chat.add(session.gameId, message);
        notifier.chatMessage(session.gameId, message);
    }

    async sendHistory(session: Session, socketId: string): Promise<void> {
        this.deps.notifier.chatHistory(socketId, await this.deps.chat.recent(session.gameId));
    }

    async react(session: Session, socketId: string, emoji: unknown): Promise<void> {
        const { notifier, limiter, ids } = this.deps;
        if (!isReaction(emoji)) return;
        if (!(await limiter.allow(`reaction:${socketId}`, REACTION_MIN_INTERVAL_MS))) return;
        notifier.reaction(session.gameId, { id: ids.eventId(), nickname: session.nickname, emoji });
    }
}
