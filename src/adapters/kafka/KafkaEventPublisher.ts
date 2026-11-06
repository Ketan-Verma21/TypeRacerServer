import type { DomainEvent } from "../../domain/events";
import type { EventPublisher } from "../../ports/EventPublisher";
import type { Logger } from "../../ports/Logger";
import { topicFor } from "./topics";

/**
 * The one producer method we use. The real Kafka producer has it; tests pass a
 * fake. Keeping it this small means this class never loads the native client.
 */
export interface KafkaSender {
    send(record: { topic: string; messages: { key: string; value: string }[] }): Promise<unknown>;
}

/**
 * Writes each event to its Kafka topic (Phase 7). The stats worker reads them.
 *
 * Fire and forget: publish() returns at once and never throws. If Kafka is
 * slow or down, the race goes on; a failed send is only logged. While the
 * broker is unreachable the client buffers and retries in the background, so
 * a short outage loses nothing (docs/kafka.md tries it).
 */
export class KafkaEventPublisher implements EventPublisher {
    constructor(
        private readonly producer: KafkaSender,
        private readonly logger: Logger,
    ) {}

    async publish(event: DomainEvent): Promise<void> {
        let sending: Promise<unknown>;
        try {
            sending = this.producer.send({
                topic: topicFor(event.type),
                messages: [{ key: event.gameId, value: JSON.stringify(event) }],
            });
        } catch (err) {
            this.failed(event, err); // e.g. the producer is not connected yet
            return;
        }
        void sending.catch((err: unknown) => this.failed(event, err));
    }

    private failed(event: DomainEvent, err: unknown): void {
        this.logger.error("kafka publish failed, event lost", {
            type: event.type,
            eventId: event.eventId,
            gameId: event.gameId,
            err: err instanceof Error ? err.message : String(err),
        });
    }
}
