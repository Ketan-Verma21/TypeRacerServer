// The Kafka connection (Phase 7). Only index.ts and the worker import this
// file, because it loads the native Kafka client (librdkafka).
import { KafkaJS } from "@confluentinc/kafka-javascript";

export type KafkaProducer = KafkaJS.Producer;

export function createKafka(brokers: string[], clientId: string): KafkaJS.Kafka {
    return new KafkaJS.Kafka({
        kafkaJS: { brokers, clientId, logLevel: KafkaJS.logLevel.WARN },
    });
}

/**
 * Idempotent producer with acks=all: the broker writes each message once,
 * even when the client retries after a timeout, and only confirms it once it
 * is safely stored. Topics are created by Compose (kafka-init), never by a typo.
 */
export function createProducer(kafka: KafkaJS.Kafka): KafkaProducer {
    return kafka.producer({
        kafkaJS: { idempotent: true, acks: -1, allowAutoTopicCreation: false },
    });
}
