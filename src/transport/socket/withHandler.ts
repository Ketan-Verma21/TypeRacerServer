// One place that decides what happens when a socket event goes wrong:
//   bad payload   -> error-message BAD_REQUEST
//   DomainError   -> error-message with its code + message (expected, not logged as an error)
//   anything else -> error-message INTERNAL + logged with the stack
// Create/join/rejoin also answer with `notCorrectGame`, which the app shows on screen.
import type { z } from "zod";
import { DomainError } from "../../domain/errors";
import type { Logger } from "../../ports/Logger";
import { ServerEvents } from "./events";
import type { ServerSocket } from "./types";

export interface HandlerOptions {
    /** Also reply with `notCorrectGame` (create/join/rejoin screens show it). */
    showOnScreen?: boolean;
    /** Text shown when the payload is invalid. */
    invalidMessage?: string;
    /** Text shown for unexpected errors. */
    failureMessage?: string;
}

export type On = <S extends z.ZodType>(
    event: string,
    schema: S,
    run: (data: z.infer<S>) => Promise<void>,
    options?: HandlerOptions,
) => void;

export function createOn(socket: ServerSocket, logger: Logger): On {
    const reply = (code: string, message: string, options: HandlerOptions) => {
        socket.emit(ServerEvents.errorMessage, { code, message });
        if (options.showOnScreen) socket.emit(ServerEvents.notCorrectGame, message);
    };

    return (event, schema, run, options = {}) => {
        socket.on(event, (raw?: unknown) => {
            const parsed = schema.safeParse(raw ?? {});
            if (!parsed.success) {
                reply("BAD_REQUEST", options.invalidMessage ?? "Invalid request", options);
                return;
            }
            run(parsed.data).catch((err: unknown) => {
                if (err instanceof DomainError) {
                    reply(err.code, err.message, options);
                    return;
                }
                logger.error("socket handler failed", {
                    event,
                    socketId: socket.id,
                    err: err instanceof Error ? err.stack : String(err),
                });
                reply("INTERNAL", options.failureMessage ?? "Something went wrong", options);
            });
        });
    };
}
