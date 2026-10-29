import type { DomainEvent } from "../../domain/events";
import type { EventPublisher } from "../../ports/EventPublisher";
import type { Logger } from "../../ports/Logger";

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

/**
 * Calls subscribers in this process (Phases 4–6). Phase 7 swaps in a Kafka
 * publisher behind the same port. A failing subscriber is logged and skipped:
 * stats must never break a race.
 */
export class InProcessEventPublisher implements EventPublisher {
    private readonly handlers: EventHandler[] = [];

    constructor(private readonly logger: Logger) {}

    subscribe(handler: EventHandler): void {
        this.handlers.push(handler);
    }

    async publish(event: DomainEvent): Promise<void> {
        for (const handler of this.handlers) {
            try {
                await handler(event);
            } catch (err) {
                this.logger.error("event handler failed", {
                    type: event.type,
                    gameId: event.gameId,
                    err: err instanceof Error ? err.stack : String(err),
                });
            }
        }
    }
}
