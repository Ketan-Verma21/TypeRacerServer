// COMPOSITION ROOT: the only file that picks concrete classes.
// Swapping in-memory -> Redis (Phase 4) or adding Kafka (Phase 7) happens here.
import { InMemoryChatRepository } from "./adapters/memory/InMemoryChatRepository";
import { InMemoryGameRepository } from "./adapters/memory/InMemoryGameRepository";
import { InMemoryRateLimiter } from "./adapters/memory/InMemoryRateLimiter";
import { InMemorySessionStore } from "./adapters/memory/InMemorySessionStore";
import { RedisChatRepository } from "./adapters/redis/RedisChatRepository";
import { RedisGameRepository } from "./adapters/redis/RedisGameRepository";
import { RedisRateLimiter } from "./adapters/redis/RedisRateLimiter";
import { RedisSessionStore } from "./adapters/redis/RedisSessionStore";
import { IntervalScheduler } from "./adapters/IntervalScheduler";
import path from "node:path";
import { ApiNinjasQuoteProvider } from "./adapters/quotes/ApiNinjasQuoteProvider";
import { FallbackQuoteProvider } from "./adapters/quotes/FallbackQuoteProvider";
import { LocalQuoteProvider } from "./adapters/quotes/LocalQuoteProvider";
import { RandomIdGenerator } from "./adapters/RandomIdGenerator";
import { SocketIoNotifier } from "./adapters/socket/SocketIoNotifier";
import { SystemClock } from "./adapters/SystemClock";
import type { Redis } from "ioredis";
import type { Config, Store } from "./config/env";
import { createDefaultModeRegistry } from "./domain/modes/modeRegistry";
import type { ChatRepository } from "./ports/ChatRepository";
import type { Clock } from "./ports/Clock";
import type { GameRepository } from "./ports/GameRepository";
import type { Logger } from "./ports/Logger";
import type { RateLimiter } from "./ports/RateLimiter";
import type { SessionStore } from "./ports/SessionStore";
import { ChatService } from "./services/ChatService";
import { GameService } from "./services/GameService";
import { PresenceService } from "./services/PresenceService";
import { QuoteService } from "./services/QuoteService";
import { RaceClock } from "./services/RaceClock";
import type { SocketHandlerDeps } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

export interface Stores {
    games: GameRepository;
    chat: ChatRepository;
    sessions: SessionStore;
    limiter: RateLimiter;
}

/**
 * STORE=memory | redis picks ONE set of adapters. The services only see the
 * ports above, so nothing else changes when this switch flips (DIP).
 */
export function createStores(store: Store, clock: Clock, redis?: Redis): Stores {
    if (store === "redis") {
        if (!redis) throw new Error("STORE=redis needs a Redis client");
        return {
            games: new RedisGameRepository(redis),
            chat: new RedisChatRepository(redis),
            sessions: new RedisSessionStore(redis),
            limiter: new RedisRateLimiter(redis),
        };
    }
    return {
        games: new InMemoryGameRepository(),
        chat: new InMemoryChatRepository(),
        sessions: new InMemorySessionStore(),
        limiter: new InMemoryRateLimiter(clock),
    };
}

export function buildContainer(
    config: Config,
    io: IoServer,
    logger: Logger,
    redis?: Redis,
): SocketHandlerDeps {
    const clock = new SystemClock();
    const scheduler = new IntervalScheduler((err) =>
        logger.error("timer failed", { err: String(err) }),
    );
    const ids = new RandomIdGenerator();
    const notifier = new SocketIoNotifier(io);

    const { games, chat, sessions, limiter } = createStores(config.store, clock, redis);

    // API Ninjas first; bundled quotes if it fails (or no key is set)
    const localQuotes = LocalQuoteProvider.fromFile(
        path.join(__dirname, "..", "data", "quotes.json"),
    );
    const quoteSources = config.quotesApiKey
        ? [new ApiNinjasQuoteProvider(config.quotesApiUrl, config.quotesApiKey), localQuotes]
        : [localQuotes];
    const quotes = new QuoteService(
        new FallbackQuoteProvider(quoteSources, (err, index) =>
            logger.warn("quote source failed, trying the next one", { index, err: String(err) }),
        ),
    );
    const raceClock = new RaceClock({ games, notifier, clock, scheduler });
    const gameService = new GameService({
        games,
        chat,
        quotes,
        modes: createDefaultModeRegistry(),
        raceClock,
        clock,
        ids,
        notifier,
        rooms: notifier,
    });
    const chatService = new ChatService({ chat, notifier, limiter, clock, ids });
    const presence = new PresenceService(scheduler);

    return { gameService, chatService, presence, sessions, connections: notifier, logger };
}
