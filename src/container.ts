// COMPOSITION ROOT: the only file that picks concrete classes.
// Swapping in-memory -> Redis (Phase 4) or adding Kafka (Phase 7) happens here.
import { InMemoryChatRepository } from "./adapters/memory/InMemoryChatRepository";
import { InMemoryGameRepository } from "./adapters/memory/InMemoryGameRepository";
import { InMemoryRateLimiter } from "./adapters/memory/InMemoryRateLimiter";
import { InMemorySessionStore } from "./adapters/memory/InMemorySessionStore";
import { IntervalScheduler } from "./adapters/IntervalScheduler";
import path from "node:path";
import { ApiNinjasQuoteProvider } from "./adapters/quotes/ApiNinjasQuoteProvider";
import { FallbackQuoteProvider } from "./adapters/quotes/FallbackQuoteProvider";
import { LocalQuoteProvider } from "./adapters/quotes/LocalQuoteProvider";
import { RandomIdGenerator } from "./adapters/RandomIdGenerator";
import { SocketIoNotifier } from "./adapters/socket/SocketIoNotifier";
import { SystemClock } from "./adapters/SystemClock";
import type { Config } from "./config/env";
import { createDefaultModeRegistry } from "./domain/modes/modeRegistry";
import type { Logger } from "./ports/Logger";
import { ChatService } from "./services/ChatService";
import { GameService } from "./services/GameService";
import { PresenceService } from "./services/PresenceService";
import { QuoteService } from "./services/QuoteService";
import { RaceClock } from "./services/RaceClock";
import type { SocketHandlerDeps } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

export function buildContainer(config: Config, io: IoServer, logger: Logger): SocketHandlerDeps {
    const clock = new SystemClock();
    const scheduler = new IntervalScheduler((err) =>
        logger.error("timer failed", { err: String(err) }),
    );
    const ids = new RandomIdGenerator();
    const notifier = new SocketIoNotifier(io);

    const games = new InMemoryGameRepository();
    const chat = new InMemoryChatRepository();
    const sessions = new InMemorySessionStore();
    const limiter = new InMemoryRateLimiter(clock);

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
