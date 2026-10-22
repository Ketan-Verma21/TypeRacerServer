import { InMemoryGameRepository } from "../../src/adapters/memory/InMemoryGameRepository";
import { runGameRepositoryContract } from "./gameRepository.contract";

runGameRepositoryContract("InMemoryGameRepository", () => new InMemoryGameRepository());
