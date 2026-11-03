// The reconnect grace period with two server instances sharing one store.
import { describe, expect, it } from "vitest";
import { InMemoryGracePeriods } from "../../../src/adapters/memory/InMemoryGracePeriods";
import { PresenceService } from "../../../src/services/PresenceService";
import { FakeClock } from "../../fakes/FakeClock";

function twoServers() {
    const clock = new FakeClock();
    const grace = new InMemoryGracePeriods(); // shared, like Redis
    const removed: string[] = [];
    const server = () =>
        new PresenceService(
            {
                grace,
                clock,
                onExpire: async (gameId, playerId) => {
                    removed.push(`${gameId}:${playerId}`);
                },
                onError: (err) => {
                    throw err;
                },
            },
            15_000,
        );
    return { clock, removed, a: server(), b: server() };
}

describe("PresenceService across instances", () => {
    it("keeps a player who drops on server A and comes back on server B", async () => {
        const { clock, removed, a, b } = twoServers();

        await a.disconnected("g1", "p1");
        clock.advance(5_000);
        await b.reconnected("g1", "p1");
        clock.advance(20_000);
        await Promise.all([a.sweep(clock.now()), b.sweep(clock.now())]);

        expect(removed).toEqual([]);
    });

    it("removes an expired player exactly once when both servers sweep", async () => {
        const { clock, removed, a, b } = twoServers();
        await a.disconnected("g1", "p1");

        clock.advance(15_000);
        await Promise.all([a.sweep(clock.now()), b.sweep(clock.now())]);

        expect(removed).toEqual(["g1:p1"]);
    });

    it("gives a player who drops again a fresh 15 s", async () => {
        const { clock, removed, a, b } = twoServers();
        await a.disconnected("g1", "p1");
        clock.advance(10_000);
        await b.reconnected("g1", "p1");
        await b.disconnected("g1", "p1"); // dropped again at 10 s

        clock.advance(10_000); // 20 s: the first period would be over
        await a.sweep(clock.now());
        expect(removed).toEqual([]);

        clock.advance(5_000); // 25 s: 15 s after the second drop
        await a.sweep(clock.now());
        expect(removed).toEqual(["g1:p1"]);
    });
});
