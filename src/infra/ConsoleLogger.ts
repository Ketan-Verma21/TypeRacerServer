/* eslint-disable no-console -- the one place allowed to print (replaced by pino in Phase 2) */
import type { LogMeta, Logger } from "../ports/Logger";

export class ConsoleLogger implements Logger {
    info(message: string, meta?: LogMeta): void {
        console.log(message, meta ?? "");
    }
    warn(message: string, meta?: LogMeta): void {
        console.warn(message, meta ?? "");
    }
    error(message: string, meta?: LogMeta): void {
        console.error(message, meta ?? "");
    }
}
