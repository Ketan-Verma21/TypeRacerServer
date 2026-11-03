import { InMemoryGracePeriods } from "../../src/adapters/memory/InMemoryGracePeriods";
import { RedisGracePeriods } from "../../src/adapters/redis/RedisGracePeriods";
import { createMockRedis } from "../fakes/mockRedis";
import { runGracePeriodsContract } from "./gracePeriods.contract";

runGracePeriodsContract("InMemoryGracePeriods", async () => new InMemoryGracePeriods());
runGracePeriodsContract(
    "RedisGracePeriods (ioredis-mock)",
    async () => new RedisGracePeriods(await createMockRedis()),
);
