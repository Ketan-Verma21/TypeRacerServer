import { InMemoryProcessedEvents } from "../../src/adapters/memory/InMemoryProcessedEvents";
import { RedisProcessedEvents } from "../../src/adapters/redis/RedisProcessedEvents";
import { createMockRedis } from "../fakes/mockRedis";
import { runProcessedEventsContract } from "./processedEvents.contract";

runProcessedEventsContract("InMemoryProcessedEvents", async () => new InMemoryProcessedEvents());
runProcessedEventsContract(
    "RedisProcessedEvents (ioredis-mock)",
    async () => new RedisProcessedEvents(await createMockRedis()),
);
