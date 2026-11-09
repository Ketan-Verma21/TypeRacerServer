import type { Logger } from "../../ports/Logger";
import type { StatsService } from "../../services/StatsService";
import { decodeEvent } from "./decodeEvent";
import { TOPICS } from "./topics";

/** One message as the consumer hands it to us. */
export interface ConsumedMessage {
    topic: string;
    partition: number;
    message: { value: Buffer | null; offset: string };
}

/** The consumer methods we use. The real Kafka consumer has them; tests pass a fake. */
export interface ConsumerClient {
    subscribe(subscription: { topics: string[] }): Promise<void>;
    run(config: { eachMessage: (payload: ConsumedMessage) => Promise<void> }): Promise<void>;
    commitOffsets(offsets: { topic: string; partition: number; offset: string }[]): Promise<void>;
}

export interface RetryOptions {
    firstDelayMs: number;
    maxDelayMs: number;
}

/**
 * The stats worker's main loop (Phase 7): reads match events from Kafka and
 * hands them to StatsService, which updates the leaderboard and match history.
 *
 * Commit after, never before: the offset is committed only once Redis has the
 * result. If the worker dies in between, Kafka sends the event again and
 * StatsService skips it by its eventId, so it still counts once
 * (at-least-once delivery + dedup = effectively once).
 *
 * If Redis is down, the same event is retried with growing pauses and the
 * partition waits, so events of one room are never applied out of order.
 */
export class KafkaStatsConsumer {
    private stopped = false;

    constructor(
        private readonly consumer: ConsumerClient,
        private readonly stats: StatsService,
        private readonly logger: Logger,
        private readonly retry: RetryOptions = { firstDelayMs: 500, maxDelayMs: 10_000 },
    ) {}

    async start(): Promise<void> {
        await this.consumer.subscribe({ topics: Object.values(TOPICS) });
        await this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
    }

    /** Lets a retry loop give up so the worker can shut down. */
    stop(): void {
        this.stopped = true;
    }

    async handle({ topic, partition, message }: ConsumedMessage): Promise<void> {
        const where = { topic, partition, offset: message.offset };
        const decoded = decodeEvent(message.value);

        if (!decoded.ok) {
            // A broken message would block the partition forever, so log it and move on.
            this.logger.error("skipping bad message", { ...where, reason: decoded.reason });
        } else if (!(await this.applyWithRetry(decoded.event, where))) {
            return; // stopping: don't commit, the next worker picks it up again
        }

        // Kafka's committed offset means "next one to read", hence + 1.
        await this.consumer.commitOffsets([
            { topic, partition, offset: String(Number(message.offset) + 1) },
        ]);
    }

    /** true once the event is applied; false if the worker is stopping. */
    private async applyWithRetry(
        event: Parameters<StatsService["onEvent"]>[0],
        where: Record<string, string | number>,
    ): Promise<boolean> {
        let delay = this.retry.firstDelayMs;
        while (!this.stopped) {
            try {
                await this.stats.onEvent(event);
                return true;
            } catch (err) {
                this.logger.warn("stats update failed, retrying", {
                    ...where,
                    eventId: event.eventId,
                    inMs: delay,
                    err: err instanceof Error ? err.message : String(err),
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
                delay = Math.min(delay * 2, this.retry.maxDelayMs);
            }
        }
        return false;
    }
}
