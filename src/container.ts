// COMPOSITION ROOT: the only file that picks concrete classes.
// Swapping in-memory -> Redis (Phase 4) or adding Kafka (Phase 7) happens here.
import { InMemoryChatRepository } from "./adapters/memory/InMemoryChatRepository";
import { InProcessEventPublisher } from "./adapters/events/InProcessEventPublisher";
import { InMemoryGameRepository } from "./adapters/memory/InMemoryGameRepository";
import { InMemoryGracePeriods } from "./adapters/memory/InMemoryGracePeriods";
import { InMemoryLeaderboard } from "./adapters/memory/InMemoryLeaderboard";
import { InMemoryMatchHistory } from "./adapters/memory/InMemoryMatchHistory";
import { InMemoryProcessedEvents } from "./adapters/memory/InMemoryProcessedEvents";
import { InMemoryRaceSchedule } from "./adapters/memory/InMemoryRaceSchedule";
import { InMemoryRateLimiter } from "./adapters/memory/InMemoryRateLimiter";
import { InMemorySessionStore } from "./adapters/memory/InMemorySessionStore";
import { RedisChatRepository } from "./adapters/redis/RedisChatRepository";
import { RedisGameRepository } from "./adapters/redis/RedisGameRepository";
import { RedisGracePeriods } from "./adapters/redis/RedisGracePeriods";
import { RedisLeaderboard } from "./adapters/redis/RedisLeaderboard";
import { RedisMatchHistory } from "./adapters/redis/RedisMatchHistory";
import { RedisProcessedEvents } from "./adapters/redis/RedisProcessedEvents";
import { RedisQuotePool } from "./adapters/redis/RedisQuotePool";
import { RedisRaceSchedule } from "./adapters/redis/RedisRaceSchedule";
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
import type { GracePeriods } from "./ports/GracePeriods";
import type { Leaderboard } from "./ports/Leaderboard";
import type { Logger } from "./ports/Logger";
import type { MatchHistory } from "./ports/MatchHistory";
import type { ProcessedEvents } from "./ports/ProcessedEvents";
import type { QuoteProvider } from "./ports/QuoteProvider";
import type { RaceSchedule } from "./ports/RaceSchedule";
import type { RateLimiter } from "./ports/RateLimiter";
import type { SessionStore } from "./ports/SessionStore";
import { ChatService } from "./services/ChatService";
import { GameService } from "./services/GameService";
import { PresenceService } from "./services/PresenceService";
import { QuoteService } from "./services/QuoteService";
import { RaceClock } from "./services/RaceClock";
import { StatsService } from "./services/StatsService";
import { Sweeper } from "./services/Sweeper";
import type { SocketHandlerDeps } from "./transport/socket/registerSocketHandlers";
import type { IoServer } from "./transport/socket/types";

/** How often each server tops up the shared quote pool. */
const QUOTE_POOL_REFILL_MS = 30_000;

export interface Stores {
    games: GameRepository;
    chat: ChatRepository;
    sessions: SessionStore;
    limiter: RateLimiter;
    leaderboard: Leaderboard;
    history: MatchHistory;
    raceSchedule: RaceSchedule;
    grace: GracePeriods;
    processed: ProcessedEvents;
}

/** The socket handlers' dependencies, plus a way to stop the background timers. */
export interface Container extends SocketHandlerDeps {
    stop(): void;
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
            leaderboard: new RedisLeaderboard(redis),
            history: new RedisMatchHistory(redis),
            raceSchedule: new RedisRaceSchedule(redis),
            grace: new RedisGracePeriods(redis),
            processed: new RedisProcessedEvents(redis),
        };
    }
    return {
        games: new InMemoryGameRepository(),
        chat: new InMemoryChatRepository(),
        sessions: new InMemorySessionStore(),
        limiter: new InMemoryRateLimiter(clock),
        leaderboard: new InMemoryLeaderboard(),
        history: new InMemoryMatchHistory(),
        raceSchedule: new InMemoryRaceSchedule(clock),
        grace: new InMemoryGracePeriods(),
        processed: new InMemoryProcessedEvents(),
    };
}

export function buildContainer(
    config: Config,
    io: IoServer,
    logger: Logger,
    redis?: Redis,
): Container {
    const clock = new SystemClock();
    const scheduler = new IntervalScheduler((err) =>
        logger.error("timer failed", { err: String(err) }),
    );
    const ids = new RandomIdGenerator();
    const notifier = new SocketIoNotifier(io);

    const timers: (() => void)[] = []; // stop functions of everything we start
    const stores = createStores(config.store, clock, redis);
    const { games, chat, sessions, limiter, leaderboard, history, raceSchedule, grace } = stores;
    const statsService = new StatsService({ leaderboard, history, processed: stores.processed });
    const events = new InProcessEventPublisher(logger);
    events.subscribe((event) => statsService.onEvent(event));

    // Quote sources, tried in order: Redis pool (pre-fetched) -> API Ninjas
    // live -> bundled quotes. The pool and API are only used with an API key.
    const localQuotes = LocalQuoteProvider.fromFile(
        path.join(__dirname, "..", "data", "quotes.json"),
    );
    const apiQuotes = config.quotesApiKey
        ? new ApiNinjasQuoteProvider(config.quotesApiUrl, config.quotesApiKey)
        : undefined;
    const quoteSources: QuoteProvider[] = [];
    if (apiQuotes && redis && config.store === "redis") {
        const pool = new RedisQuotePool(redis, apiQuotes, {
            onError: (err) => logger.warn("quote pool refill failed", { err: String(err) }),
        });
        quoteSources.push(pool);
        const refill = async (): Promise<void> => {
            await pool.refill();
        };
        timers.push(scheduler.after(0, refill)); // fill it at startup
        timers.push(scheduler.every(QUOTE_POOL_REFILL_MS, refill));
    }
    if (apiQuotes) quoteSources.push(apiQuotes);
    quoteSources.push(localQuotes);
    const quotes = new QuoteService(
        new FallbackQuoteProvider(quoteSources, (err, index) =>
            logger.warn("quote source failed, trying the next one", { index, err: String(err) }),
        ),
    );
    const raceClock = new RaceClock({
        games,
        notifier,
        clock,
        schedule: raceSchedule,
        events,
        ids,
        onError: (err, gameId) => logger.error("race clock failed", { gameId, err: String(err) }),
    });

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
    const presence = new PresenceService({
        grace,
        clock,
        onExpire: (gameId, playerId) => gameService.leaveGame(gameId, playerId),
        onError: (err) => logger.error("presence expiry failed", { err: String(err) }),
    });
    // Every instance sweeps once a second; claims keep each tick / removal to one instance.
    const sweeper = new Sweeper(
        { clock, scheduler, onError: (err) => logger.error("sweep failed", { err: String(err) }) },
        [(now) => raceClock.sweep(now), (now) => presence.sweep(now)],
    );
    timers.push(sweeper.start());

    return {
        gameService,
        chatService,
        presence,
        statsService,
        sessions,
        logger,
        stop: () => {
            for (const stop of timers) stop();
        },
    };
}
