import { InMemoryRaceSchedule } from "../../src/adapters/memory/InMemoryRaceSchedule";
import { RedisRaceSchedule } from "../../src/adapters/redis/RedisRaceSchedule";
import { FakeClock } from "../fakes/FakeClock";
import { createMockRedis } from "../fakes/mockRedis";
import { runRaceScheduleContract } from "./raceSchedule.contract";

runRaceScheduleContract(
    "InMemoryRaceSchedule",
    async () => new InMemoryRaceSchedule(new FakeClock()),
);
runRaceScheduleContract(
    "RedisRaceSchedule (ioredis-mock)",
    async () => new RedisRaceSchedule(await createMockRedis()),
);
