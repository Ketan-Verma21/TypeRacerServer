// PORT: "this happened" for whoever is interested (stats now, Kafka in Phase 7).
import type { DomainEvent } from "../domain/events";

export interface EventPublisher {
    /**
     * Never rejects and never throws into gameplay: failures are logged by the
     * publisher. Callers may fire and forget.
     */
    publish(event: DomainEvent): Promise<void>;
}
