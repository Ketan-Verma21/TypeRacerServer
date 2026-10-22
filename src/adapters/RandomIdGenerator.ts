import { randomBytes } from "node:crypto";
import type { IdGenerator } from "../ports/IdGenerator";

/**
 * Game ids are 24 hex characters for now, because the v1 app only accepts
 * that format. Phase 2 switches to 6-character room codes.
 */
export class RandomIdGenerator implements IdGenerator {
    gameId(): string {
        return randomBytes(12).toString("hex");
    }

    playerId(): string {
        return randomBytes(12).toString("hex");
    }

    eventId(): string {
        return randomBytes(6).toString("hex");
    }
}
