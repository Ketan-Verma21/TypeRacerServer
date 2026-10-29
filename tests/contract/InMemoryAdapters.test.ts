import { InMemoryChatRepository } from "../../src/adapters/memory/InMemoryChatRepository";
import { InMemoryRateLimiter } from "../../src/adapters/memory/InMemoryRateLimiter";
import { InMemorySessionStore } from "../../src/adapters/memory/InMemorySessionStore";
import { FakeClock } from "../fakes/FakeClock";
import { runChatRepositoryContract } from "./chatRepository.contract";
import { runRateLimiterContract } from "./rateLimiter.contract";
import { runSessionStoreContract } from "./sessionStore.contract";

runChatRepositoryContract("InMemoryChatRepository", async (max) => new InMemoryChatRepository(max));
runSessionStoreContract("InMemorySessionStore", async () => new InMemorySessionStore());
runRateLimiterContract("InMemoryRateLimiter", async () => {
    const clock = new FakeClock();
    return {
        limiter: new InMemoryRateLimiter(clock),
        wait: async (ms) => clock.advance(ms),
    };
});
