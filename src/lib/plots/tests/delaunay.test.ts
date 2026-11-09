import { describe, expect, it } from "vitest";
import { delaunayField } from "../delaunay";
import type { GridSpec } from "../grid";
import type { PlotSeries } from "../plot-data";

const GRID: GridSpec = {
    xRange: { min: 0, max: 10 },
    yRange: { min: 0, max: 10 },
    xResolution: 10,
    yResolution: 10
};

function seriesOf(points: Array<[number, number, number]>): PlotSeries {
    return {
        x: Float64Array.from(points, (point) => point[0]),
        y: Float64Array.from(points, (point) => point[1]),
        z: Float64Array.from(points, (point) => point[2]),
        xRange: GRID.xRange,
        yRange: GRID.yRange,
        zRange: { min: 0, max: 1 },
        xKind: "number",
        yKind: "number",
        zKind: "number",
        skippedRows: 0,
        groups: null,
        droppedGroups: 0,
        binWidth: null,
        sampledFrom: null,
        rowIndex: null,
        categories: null
    };
}

/** A domain of all cells, with the given cells as land. */
function domainWithout(...land: Array<[number, number]>): Uint8Array {
    const domain = new Uint8Array(GRID.xResolution * GRID.yResolution).fill(1);
    for (const [column, row] of land) domain[row * GRID.xResolution + column] = 0;
    return domain;
}

function cell(column: number, row: number): number {
    return row * GRID.xResolution + column;
}

// One triangle: two points on the left of the grid and one point far to the right.
const FAR_TRIANGLE = seriesOf([
    [1, 1, 0],
    [1, 9, 0],
    [1e8, 5, 1]
]);

describe("delaunayField", () => {
    it("finishes fast with a far point and a domain", () => {
        const started = performance.now();
        const values = delaunayField(FAR_TRIANGLE, GRID, domainWithout([3, 5]));

        expect(performance.now() - started).toBeLessThan(100);
        expect(values).not.toBeNull();
        expect(Number.isFinite(values![cell(4, 5)])).toBe(true);
        expect(Number.isNaN(values![cell(3, 5)])).toBe(true);
    });

    it("drops a triangle whose far edge crosses land inside the grid", () => {
        const land = Array.from(
            { length: GRID.yResolution },
            (_, row) => [5, row] as [number, number]
        );
        const values = delaunayField(FAR_TRIANGLE, GRID, domainWithout(...land));

        expect(values).not.toBeNull();
        expect(values!.every((value) => Number.isNaN(value))).toBe(true);
    });

    it("draws the triangle without a domain", () => {
        const values = delaunayField(FAR_TRIANGLE, GRID, null);

        expect(values).not.toBeNull();
        expect(Number.isFinite(values![cell(5, 5)])).toBe(true);
        expect(Number.isNaN(values![cell(0, 5)])).toBe(true);
    });
});
