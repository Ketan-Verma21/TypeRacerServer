// Turns a Kafka message back into a DomainEvent, checking its shape first.
// Anything can end up in a topic (an old format, a typo from the console
// producer), so the worker never trusts the bytes it reads.
import { z } from "zod";
import { MODE_IDS } from "../../config/constants";
import type { DomainEvent } from "../../domain/events";

const base = {
    eventId: z.string().min(1),
    gameId: z.string().min(1),
    round: z.number().int().min(1),
    mode: z.enum(MODE_IDS),
    at: z.number(),
};

const result = z.object({
    playerId: z.string(),
    nickname: z.string(),
    wpm: z.number().min(0),
    rank: z.number().int().min(1),
    finished: z.boolean(),
    eliminated: z.boolean(),
    flags: z.array(z.string()).optional(),
});

const eventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("match.started"), ...base, racers: z.number().int().min(0) }),
    z.object({ type: z.literal("match.finished"), ...base, results: z.array(result) }),
]);

export type Decoded = { ok: true; event: DomainEvent } | { ok: false; reason: string };

export function decodeEvent(value: Buffer | null): Decoded {
    if (!value) return { ok: false, reason: "empty message" };
    let json: unknown;
    try {
        json = JSON.parse(value.toString("utf8"));
    } catch {
        return { ok: false, reason: "not JSON" };
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { ok: false, reason: `${issue?.path.join(".") || "event"}: ${issue?.message}` };
    }
    return { ok: true, event: parsed.data };
}
