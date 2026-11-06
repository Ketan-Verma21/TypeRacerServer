import { describe, expect, it } from "vitest";
import { percentile, summarize } from "../../load/metrics";

describe("load-test metrics", () => {
    it("takes nearest-rank percentiles", () => {
        const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

        expect(percentile(sorted, 50)).toBe(50);
        expect(percentile(sorted, 95)).toBe(95);
        expect(percentile(sorted, 99)).toBe(99);
    });

    it("summarizes unsorted numbers", () => {
        expect(summarize([30, 10, 20])).toEqual({
            count: 3,
            mean: 20,
            p50: 20,
            p95: 30,
            p99: 30,
            max: 30,
        });
    });

    it("treats no data as zeros", () => {
        expect(summarize([])).toMatchObject({ count: 0, p95: 0, max: 0 });
    });
});
