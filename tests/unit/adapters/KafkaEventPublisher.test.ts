import { describe, expect, it } from "vitest";
import {
    KafkaEventPublisher,
    type KafkaSender,
} from "../../../src/adapters/kafka/KafkaEventPublisher";
import { topicFor } from "../../../src/adapters/kafka/topics";
import type { MatchFinished, MatchStarted } from "../../../src/domain/events";
import type { LogMeta, Logger } from "../../../src/ports/Logger";

type SentRecord = Parameters<KafkaSender["send"]>[0];

/** Remembers what was sent; can be told to fail. */
class FakeProducer implements KafkaSender {
    readonly sent: SentRecord[] = [];
    mode: "ok" | "reject" | "throw" | "hang" = "ok";

    send(record: SentRecord): Promise<unknown> {
        if (this.mode === "throw") throw new Error("producer not connected");
        this.sent.push(record);
        if (this.mode === "reject") return Promise.reject(new Error("broker down"));
        if (this.mode === "hang") return new Promise(() => {}); // Kafka unreachable
        return Promise.resolve([]);
    }
}

class RecordingLogger implements Logger {
    readonly errors: { message: string; meta?: LogMeta }[] = [];
    info(): void {}
    warn(): void {}
    error(message: string, meta?: LogMeta): void {
        this.errors.push({ message, meta });
    }
}

const started: MatchStarted = {
    type: "match.started",
    eventId: "e1",
    gameId: "ABC123",
    round: 1,
    mode: "classic",
    at: 1000,
    racers: 2,
};

const finished: MatchFinished = {
    type: "match.finished",
    eventId: "e2",
    gameId: "ABC123",
    round: 1,
    mode: "classic",
    at: 2000,
    results: [],
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
    const producer = new FakeProducer();
    const logger = new RecordingLogger();
    return { producer, logger, publisher: new KafkaEventPublisher(producer, logger) };
}

describe("KafkaEventPublisher", () => {
    it("sends each event to its own topic, keyed by gameId, as JSON", async () => {
        const { producer, publisher } = setup();

        await publisher.publish(started);
        await publisher.publish(finished);

        expect(producer.sent).toEqual([
            {
                topic: "match.started",
                messages: [{ key: "ABC123", value: JSON.stringify(started) }],
            },
            {
                topic: "match.finished",
                messages: [{ key: "ABC123", value: JSON.stringify(finished) }],
            },
        ]);
        expect(JSON.parse(producer.sent[1]!.messages[0]!.value)).toEqual(finished);
    });

    it("does not wait for Kafka: a hanging send never blocks the race", async () => {
        const { producer, publisher } = setup();
        producer.mode = "hang";

        await expect(publisher.publish(started)).resolves.toBeUndefined();
    });

    it("logs a failed send instead of throwing", async () => {
        const { producer, logger, publisher } = setup();
        producer.mode = "reject";

        await expect(publisher.publish(started)).resolves.toBeUndefined();
        await flush();

        expect(logger.errors).toHaveLength(1);
        expect(logger.errors[0]!.meta).toMatchObject({ eventId: "e1", err: "broker down" });
    });

    it("logs instead of throwing when the producer throws right away", async () => {
        const { producer, logger, publisher } = setup();
        producer.mode = "throw";

        await expect(publisher.publish(started)).resolves.toBeUndefined();

        expect(logger.errors[0]!.meta).toMatchObject({ err: "producer not connected" });
    });
});

describe("topicFor", () => {
    it("has one topic per event type", () => {
        expect(topicFor("match.started")).toBe("match.started");
        expect(topicFor("match.finished")).toBe("match.finished");
    });
});
