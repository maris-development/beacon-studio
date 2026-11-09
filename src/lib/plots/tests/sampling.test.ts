import { describe, expect, it } from "vitest";
import type { PlotCategories, PlotSeries } from "../plot-data";
import { samplePlotSeries } from "../sampling";

const ROW_OFFSET = 1000;

/** A series with one point per row. `x` holds the row, and `rowIndex` holds the row plus {@link ROW_OFFSET}. */
function groupedSeries(groupOf: number[], slots = 8): PlotSeries {
    const total = groupOf.length;
    const groupCount = Math.max(...groupOf) + 1;

    const sizes = new Array<number>(groupCount).fill(0);
    for (const group of groupOf) sizes[group]++;

    const legend = sizes
        .map((_, group) => group)
        .sort((a, b) => sizes[b] - sizes[a] || a - b)
        .slice(0, slots);
    const slotOf = new Int16Array(groupCount).fill(-1);
    legend.forEach((group, slot) => {
        slotOf[group] = slot;
    });

    let colouredRows = 0;
    for (const group of legend) colouredRows += sizes[group];

    const categories: PlotCategories = {
        list: sizes.map((rows, group) => ({ name: `g${group}`, rows })),
        index: Uint32Array.from(groupOf),
        slotOf,
        legend,
        otherGroups: groupCount - legend.length,
        otherRows: total - colouredRows
    };

    return {
        x: Float64Array.from(groupOf, (_, row) => row),
        y: Float64Array.from(groupOf, (_, row) => (row * 37) % 101),
        z: null,
        xRange: { min: 0, max: total - 1 },
        yRange: { min: 0, max: 100 },
        zRange: null,
        xKind: "number",
        yKind: "number",
        zKind: null,
        skippedRows: 0,
        groups: null,
        droppedGroups: 0,
        binWidth: null,
        sampledFrom: null,
        rowIndex: Uint32Array.from(groupOf, (_, row) => row + ROW_OFFSET),
        categories
    };
}

function countGroup(sample: PlotSeries, group: number): number {
    let count = 0;
    for (const value of sample.categories?.index ?? []) {
        if (value === group) count++;
    }
    return count;
}

describe("samplePlotSeries with a text colour column", () => {
    it("keeps the sample size when every row has its own value", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => row);
        const sample = samplePlotSeries(groupedSeries(groupOf), 500);

        expect(sample.x.length).toBe(500);
        expect(sample.sampledFrom).toBe(10_000);
    });

    it("stays at the cap with two unequal groups", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => Number(row >= 9_990));
        const sample = samplePlotSeries(groupedSeries(groupOf), 100);

        expect(sample.x.length).toBeLessThanOrEqual(100);
    });

    it("gives a rare legend group its floor", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => Number(row >= 9_960));
        const sample = samplePlotSeries(groupedSeries(groupOf), 100);

        // Two buckets and at most four extreme rows: floor = floor(96 / 4).
        expect(countGroup(sample, 1)).toBeGreaterThanOrEqual(24);
    });

    it("keeps the extreme rows", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => row % 3);
        const sample = samplePlotSeries(groupedSeries(groupOf), 100);

        expect(sample.x).toContain(0);
        expect(sample.x).toContain(9_999);
        expect(Math.min(...sample.y)).toBe(0);
        expect(Math.max(...sample.y)).toBe(100);
    });

    it("moves the row index and the group with each row", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => row % 20);
        const sample = samplePlotSeries(groupedSeries(groupOf), 300);

        for (let i = 0; i < sample.x.length; i++) {
            const row = sample.x[i];
            expect(sample.rowIndex?.[i]).toBe(row + ROW_OFFSET);
            expect(sample.categories?.index[i]).toBe(groupOf[row]);
        }
    });

    it("picks the same rows on every call", () => {
        const groupOf = Array.from({ length: 10_000 }, (_, row) => row % 20);
        const series = groupedSeries(groupOf);

        expect(samplePlotSeries(series, 300).x).toEqual(samplePlotSeries(series, 300).x);
    });
});
