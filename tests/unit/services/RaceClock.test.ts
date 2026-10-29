// The race clock with several server instances. Each "instance" is its own
// RaceClock; they share the game store and the schedule, like servers sharing
// Redis. Tests move time and call sweep() by hand, as the Sweeper would.
import { describe, expect, it } from "vitest";
import { InProcessEventPublisher } from "../../../src/adapters/events/InProcessEventPublisher";
import { InMemoryGameRepository } from "../../../src/adapters/memory/InMemoryGameRepository";
import { InMemoryRaceSchedule } from "../../../src/adapters/memory/InMemoryRaceSchedule";
import type { DomainEvent } from "../../../src/domain/events";
import { RaceClock } from "../../../src/services/RaceClock";
import { makeGame, makePlayer } from "../../fakes/builders";
import { FakeClock } from "../../fakes/FakeClock";
import { FakeNotifier } from "../../fakes/FakeNotifier";

function cluster(instances: number) {
    const clock = new FakeClock();
    const games = new InMemoryGameRepository();
    const schedule = new InMemoryRaceSchedule(clock);
    const notifier = new FakeNotifier(); // one "room": sees what every instance sends
    const published: DomainEvent[] = [];
    const events = new InProcessEventPublisher({ info: () => {}, warn: () => {}, error: () => {} });
    events.subscribe((e) => {
        published.push(e);
    });
    const clocks = Array.from(
        { length: instances },
        () =>
            new RaceClock({
                games,
                notifier,
                clock,
                schedule,
                events,
                onError: (err) => {
                    throw err;
                },
            }),
    );

    /** One second passes; the listed instances (default: all) sweep. */
    async function second(alive: RaceClock[] = clocks) {
        clock.advance(1000);
        await Promise.all(alive.map((c) => c.sweep(clock.now())));
    }
    const timers = () => notifier.ofType("timer").map((t) => t.update.countDown);
    const phase = async (id = "g1") => (await games.get(id))?.phase;

    return { clock, games, schedule, notifier, published, clocks, second, timers, phase };
}

async function lobby(games: InMemoryGameRepository, timeLimit = 30) {
    await games.create(
        makeGame({
            id: "g1",
            phase: "lobby",
            startTime: undefined,
            players: [makePlayer({ id: "host", isHost: true })],
            settings: { mode: "classic", timeLimit, length: "medium", maxPlayers: 5 },
        }),
    );
}

describe("RaceClock with several instances", () => {
    it("sends each countdown tick once and starts the race once, with 3 instances sweeping", async () => {
        const c = cluster(3);
        await lobby(c.games);
        await c.clocks[0]!.start("g1");

        for (let i = 0; i < 7; i++) await c.second();

        expect(c.timers()).toEqual([5, 4, 3, 2, 1, 0, "0:30"]);
        expect(await c.phase()).toBe("racing");
        const racingUpdates = c.notifier
            .ofType("gameChanged")
            .filter((g) => g.game.phase === "racing");
        expect(racingUpdates).toHaveLength(1);
    });

    it("keeps the race going when the instance that started it dies", async () => {
        const c = cluster(2);
        const [a, b] = c.clocks as [RaceClock, RaceClock];
        await lobby(c.games, 30);
        await a.start("g1");
        await c.second([a, b]);
        await c.second([a, b]);

        // instance A is gone; only B sweeps from now on
        for (let i = 0; i < 5 + 31; i++) await c.second([b]);

        expect(await c.phase()).toBe("over");
        expect(c.timers().slice(0, 7)).toEqual([5, 4, 3, 2, 1, 0, "0:30"]);
        expect(c.timers().at(-1)).toBe("0:00");
    });

    it("lets a brand-new instance pick up a race after a restart", async () => {
        const c = cluster(1);
        await lobby(c.games, 30);
        await c.clocks[0]!.start("g1");
        for (let i = 0; i < 10; i++) await c.second(); // racing for a few seconds

        const restarted = new RaceClock({
            games: c.games,
            notifier: c.notifier,
            clock: c.clock,
            schedule: c.schedule,
            events: new InProcessEventPublisher({
                info: () => {},
                warn: () => {},
                error: () => {},
            }),
            onError: (err) => {
                throw err;
            },
        });
        for (let i = 0; i < 31; i++) await c.second([restarted]);

        expect(await c.phase()).toBe("over");
    });

    it("ends a race only once when it finishes early as its time runs out", async () => {
        const c = cluster(2);
        const [a, b] = c.clocks as [RaceClock, RaceClock];
        await lobby(c.games, 30);
        await a.start("g1");
        for (let i = 0; i < 7 + 30; i++) await c.second(); // last second of the race

        c.clock.advance(1000);
        await Promise.all([b.finishRace("g1"), a.sweep(c.clock.now()), b.sweep(c.clock.now())]);

        expect(await c.phase()).toBe("over");
        expect(c.published.filter((e) => e.type === "match.finished")).toHaveLength(1);
        expect(c.notifier.ofType("raceOver")).toHaveLength(1);
    });

    it("shows 5..0 even when Start is pressed mid-second and timers fire a little late", async () => {
        const c = cluster(1);
        await lobby(c.games);
        c.clock.advance(300); // Start at .300
        await c.clocks[0]!.start("g1");
        c.clock.advance(700 + 8); // first sweep at the next full second, 8 ms late

        for (let i = 0; i < 7; i++) {
            await c.clocks[0]!.sweep(c.clock.now());
            c.clock.advance(1000 + (i % 2 ? -3 : 4)); // jitter
        }

        expect(c.timers()).toEqual([5, 4, 3, 2, 1, 0, "0:30"]);
    });

    it("forgets a room that was deleted while its clock was running", async () => {
        const c = cluster(1);
        await lobby(c.games);
        await c.clocks[0]!.start("g1");
        await c.games.delete("g1");

        await c.second();

        expect(await c.schedule.all()).toEqual([]);
    });
});
