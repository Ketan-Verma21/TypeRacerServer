// PORT: which events have already been handled, so a redelivered event
// (Kafka is at-least-once) is counted only once.
export interface ProcessedEvents {
    /** true the first time an event id is claimed; false if it was handled already. */
    claim(eventId: string): Promise<boolean>;
    /** Gives a claim back after the handling failed, so a retry can do it again. */
    release(eventId: string): Promise<void>;
}
