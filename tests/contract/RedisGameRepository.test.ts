import { RedisGameRepository } from "../../src/adapters/redis/RedisGameRepository";
import { createMockRedis } from "../fakes/mockRedis";
import { runGameRepositoryContract } from "./gameRepository.contract";

// Same tests as InMemoryGameRepository: the services can't tell them apart.
runGameRepositoryContract(
    "RedisGameRepository (ioredis-mock)",
    async () => new RedisGameRepository(await createMockRedis()),
);
