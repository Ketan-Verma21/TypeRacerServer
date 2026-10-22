import type { GameId } from "../domain/types";

/** Puts a connection in (or takes it out of) a game's broadcast room. */
export interface RoomMembership {
    join(socketId: string, gameId: GameId): Promise<void>;
    leave(socketId: string, gameId: GameId): Promise<void>;
}
