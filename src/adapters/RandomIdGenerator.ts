import { randomBytes, randomInt } from "node:crypto";
import { generateRoomCode } from "../domain/roomCode";
import type { IdGenerator } from "../ports/IdGenerator";

export class RandomIdGenerator implements IdGenerator {
    /** 6-character room code (uniqueness is checked by GameService). */
    gameId(): string {
        return generateRoomCode((max) => randomInt(max));
    }

    /** Long and unguessable: it is what a client uses to rejoin after a drop. */
    playerId(): string {
        return randomBytes(12).toString("hex");
    }

    eventId(): string {
        return randomBytes(6).toString("hex");
    }
}
