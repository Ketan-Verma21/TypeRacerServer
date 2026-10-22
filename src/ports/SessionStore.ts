import type { Session } from "../domain/types";

/** socketId -> which game/player that connection belongs to. */
export interface SessionStore {
    get(socketId: string): Promise<Session | null>;
    set(socketId: string, session: Session): Promise<void>;
    delete(socketId: string): Promise<void>;
}
