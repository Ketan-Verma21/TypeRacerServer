import type { Session } from "../../domain/types";
import type { SessionStore } from "../../ports/SessionStore";

export class InMemorySessionStore implements SessionStore {
    private readonly sessions = new Map<string, Session>();

    async get(socketId: string): Promise<Session | null> {
        const s = this.sessions.get(socketId);
        return s ? { ...s } : null;
    }

    async set(socketId: string, session: Session): Promise<void> {
        this.sessions.set(socketId, { ...session });
    }

    async delete(socketId: string): Promise<void> {
        this.sessions.delete(socketId);
    }
}
