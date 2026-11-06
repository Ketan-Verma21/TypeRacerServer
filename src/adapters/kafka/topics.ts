// Kafka topics: one per event type, so a consumer can subscribe to only what it needs.
// The message key is the gameId, so every event of one room lands on the same
// partition and is read in order.
import type { EventType } from "../../domain/events";

export const TOPICS: Record<EventType, string> = {
    "match.started": "match.started",
    "match.finished": "match.finished",
};

/** Partitions per topic. 2 lets two stats workers share the work (Phase 7 experiment). */
export const PARTITIONS = 2;

export function topicFor(type: EventType): string {
    return TOPICS[type];
}
