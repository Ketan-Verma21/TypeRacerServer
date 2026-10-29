// Rough latency of the game's hot paths against a real Redis (FR: record in Memory.md).
//   REDIS_TEST_URL=redis://localhost:6379/15 npm run bench:redis
// Measures the repository calls a join and a typed word make. It is NOT the
// full round trip to a browser (that comes with the Phase 6 load test).
import { RedisGameRepository } from "../../src/adapters/redis/RedisGameRepository";
import { makeGame, makePlayer } from "../fakes/builders";
import { connectRealRedis, realRedisUrl } from "../fakes/realRedis";

const ROUNDS = 1000;

function summary(name: string, samples: number[]): string {
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (p: number): string => (sorted[Math.floor((sorted.length - 1) * p)] ?? 0).toFixed(2);
    return `${name.padEnd(28)} p50 ${at(0.5)} ms   p95 ${at(0.95)} ms   p99 ${at(0.99)} ms`;
}

async function time(fn: () => Promise<unknown>): Promise<number> {
    const start = performance.now();
    await fn();
    return performance.now() - start;
}

async function main(): Promise<void> {
    const url = realRedisUrl();
    if (!url) throw new Error("Set REDIS_TEST_URL, e.g. redis://localhost:6379/15");
    const redis = connectRealRedis(url);
    await redis.flushdb();
    const repo = new RedisGameRepository(redis);
    const join: number[] = [];
    const word: number[] = [];

    for (let i = 0; i < ROUNDS; i++) {
        const id = `bench${i}`;
        await repo.create(makeGame({ id, phase: "lobby", players: [makePlayer({ id: "host" })] }));
        // What GameService.joinGame does with the store: read, atomic add, read again.
        join.push(
            await time(async () => {
                await repo.get(id);
                await repo.addPlayer(id, makePlayer({ id: "guest" }), 5);
                await repo.get(id);
            }),
        );
        // What GameService.submitWord does: read, update one player, read again.
        word.push(
            await time(async () => {
                await repo.get(id);
                await repo.updatePlayer(id, "guest", { wordIndex: 1 });
                await repo.get(id);
            }),
        );
    }

    process.stdout.write(`${ROUNDS} rounds against ${url}\n`);
    process.stdout.write(`${summary("join (get + addPlayer + get)", join)}\n`);
    process.stdout.write(`${summary("word (get + update + get)", word)}\n`);
    await redis.flushdb();
    await redis.quit();
}

main().catch((err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
});
