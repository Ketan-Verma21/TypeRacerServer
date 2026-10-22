// Builds the real services wired to in-memory adapters and fakes.
// Every service test starts from here.
import { InMemoryChatRepository } from "../../src/adapters/memory/InMemoryChatRepository";
import { InMemoryGameRepository } from "../../src/adapters/memory/InMemoryGameRepository";
import { InMemoryRateLimiter } from "../../src/adapters/memory/InMemoryRateLimiter";
import { createDefaultModeRegistry } from "../../src/domain/modes/modeRegistry";
import type { Session } from "../../src/domain/types";
import type { IdGenerator } from "../../src/ports/IdGenerator";
import { ChatService } from "../../src/services/ChatService";
import { GameService } from "../../src/services/GameService";
import { PresenceService } from "../../src/services/PresenceService";
import { QuoteService } from "../../src/services/QuoteService";
import { RaceClock } from "../../src/services/RaceClock";
import { FakeClock } from "./FakeClock";
import { FakeNotifier } from "./FakeNotifier";
import { FakeQuoteProvider } from "./FakeQuoteProvider";
import { FakeScheduler } from "./FakeScheduler";
import { SequentialIdGenerator } from "./SequentialIdGenerator";

export function createTestApp(options: { ids?: IdGenerator } = {}) {
    const clock = new FakeClock();
    const scheduler = new FakeScheduler(clock);
    const notifier = new FakeNotifier();
    const quoteProvider = new FakeQuoteProvider("the quick brown fox");
    const games = new InMemoryGameRepository();
    const chat = new InMemoryChatRepository();
    const ids = options.ids ?? new SequentialIdGenerator();
    const raceClock = new RaceClock({ games, notifier, clock, scheduler });
    const quotes = new QuoteService(quoteProvider);
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
    const chatService = new ChatService({
        chat,
        notifier,
        limiter: new InMemoryRateLimiter(clock),
        clock,
        ids,
    });
    const presence = new PresenceService(scheduler, 15_000);

    /** Session for a player returned by createGame/joinGame. */
    const sessionOf = (r: {
        game: { id: string };
        player: { id: string; nickname: string };
    }): Session => ({
        gameId: r.game.id,
        playerId: r.player.id,
        nickname: r.player.nickname,
    });

    /** Host creates a room and `others` join it. */
    async function lobbyWith(...others: string[]) {
        const host = await gameService.createGame("Host", "s-host");
        const guests = [];
        for (const name of others)
            guests.push(await gameService.joinGame(host.game.id, name, `s-${name}`));
        return { gameId: host.game.id, host: sessionOf(host), guests: guests.map(sessionOf) };
    }

    /** Lobby -> countdown -> racing (6 countdown ticks + 1 to start the clock). */
    async function startRace(host: Session) {
        await gameService.startRace(host);
        await scheduler.tick(7);
    }

    /** Types the whole quote for a player. */
    async function typeAll(session: Session) {
        for (const w of ["the", "quick", "brown", "fox"])
            await gameService.submitWord(session, `${w} `);
    }

    return {
        clock,
        scheduler,
        notifier,
        quoteProvider,
        games,
        chat,
        raceClock,
        gameService,
        chatService,
        presence,
        sessionOf,
        lobbyWith,
        startRace,
        typeAll,
    };
}
