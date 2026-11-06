import type { Logger } from "../ports/Logger";

/**
 * Calls `attempt` until it succeeds, waiting `delayMs` between tries. Used to
 * connect to Kafka without blocking startup: the game works while Kafka is
 * still booting, and events start flowing once it is up.
 * Returns a function that stops further tries.
 */
export function keepTrying(
    name: string,
    attempt: () => Promise<void>,
    logger: Logger,
    delayMs = 5000,
): () => void {
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const run = async (): Promise<void> => {
        try {
            await attempt();
            if (!stopped) logger.info(`${name} connected`);
        } catch (err) {
            if (stopped) return;
            logger.warn(`${name} not reachable, retrying`, {
                inMs: delayMs,
                err: err instanceof Error ? err.message : String(err),
            });
            timer = setTimeout(() => void run(), delayMs);
        }
    };
    void run();

    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}
