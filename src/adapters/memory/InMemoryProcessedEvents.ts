import type { ProcessedEvents } from "../../ports/ProcessedEvents";

/** One process only (STORE=memory). Never forgets — fine for development. */
export class InMemoryProcessedEvents implements ProcessedEvents {
    private readonly seen = new Set<string>();

    async claim(eventId: string): Promise<boolean> {
        if (this.seen.has(eventId)) return false;
        this.seen.add(eventId);
        return true;
    }

    async release(eventId: string): Promise<void> {
        this.seen.delete(eventId);
    }
}
