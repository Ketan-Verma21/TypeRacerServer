import { pino, type Logger as Pino } from "pino";
import type { Config } from "../config/env";
import type { LogMeta, Logger } from "../ports/Logger";

/**
 * Structured logs. Every line carries `instanceId`, so logs from several
 * servers (Phase 5+) can be told apart. Pretty colours in a terminal,
 * one JSON object per line everywhere else (e.g. Render).
 */
export class PinoLogger implements Logger {
    constructor(private readonly log: Pino) {}

    static create(config: Pick<Config, "logLevel" | "instanceId">): PinoLogger {
        const pretty = process.stdout.isTTY === true;
        return new PinoLogger(
            pino({
                level: config.logLevel,
                base: { instanceId: config.instanceId },
                ...(pretty
                    ? {
                          transport: {
                              target: "pino-pretty",
                              options: { translateTime: "SYS:HH:MM:ss" },
                          },
                      }
                    : {}),
            }),
        );
    }

    info(message: string, meta: LogMeta = {}): void {
        this.log.info(meta, message);
    }
    warn(message: string, meta: LogMeta = {}): void {
        this.log.warn(meta, message);
    }
    error(message: string, meta: LogMeta = {}): void {
        this.log.error(meta, message);
    }
}
