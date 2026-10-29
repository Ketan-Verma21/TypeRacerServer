import { InMemoryLeaderboard } from "../../src/adapters/memory/InMemoryLeaderboard";
import { InMemoryMatchHistory } from "../../src/adapters/memory/InMemoryMatchHistory";
import { RedisLeaderboard } from "../../src/adapters/redis/RedisLeaderboard";
import { RedisMatchHistory } from "../../src/adapters/redis/RedisMatchHistory";
import { createMockRedis } from "../fakes/mockRedis";
import { runLeaderboardContract } from "./leaderboard.contract";
import { runMatchHistoryContract } from "./matchHistory.contract";

runLeaderboardContract("InMemoryLeaderboard", async () => new InMemoryLeaderboard());
runLeaderboardContract(
    "RedisLeaderboard (ioredis-mock)",
    async () => new RedisLeaderboard(await createMockRedis()),
);

runMatchHistoryContract(
    "InMemoryMatchHistory",
    async (maxRecent, maxPerGame) => new InMemoryMatchHistory(maxRecent, maxPerGame),
);
runMatchHistoryContract(
    "RedisMatchHistory (ioredis-mock)",
    async (maxRecent, maxPerGame) =>
        new RedisMatchHistory(await createMockRedis(), maxRecent, maxPerGame),
);
