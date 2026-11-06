import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepTrying } from "../../../src/infra/keepTrying";
import type { Logger } from "../../../src/ports/Logger";

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("keepTrying", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("tries again after a failure until it succeeds", async () => {
        const attempt = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error("ECONNREFUSED"))
            .mockRejectedValueOnce(new Error("ECONNREFUSED"))
            .mockResolvedValue(undefined);

        keepTrying("kafka", attempt, logger, 100);
        await vi.advanceTimersByTimeAsync(0);
        expect(attempt).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(250);
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.info).toHaveBeenCalledWith("kafka connected");

        await vi.advanceTimersByTimeAsync(1000);
        expect(attempt).toHaveBeenCalledTimes(3); // stops once connected
    });

    it("stops retrying when told to", async () => {
        const attempt = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("down"));

        const stop = keepTrying("kafka", attempt, logger, 100);
        await vi.advanceTimersByTimeAsync(0);
        stop();
        await vi.advanceTimersByTimeAsync(1000);

        expect(attempt).toHaveBeenCalledTimes(1);
    });
});
