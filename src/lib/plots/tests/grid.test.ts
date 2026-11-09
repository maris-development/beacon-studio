import { describe, expect, it } from "vitest";
import { cellOf, fillGridGaps, hullOf, type GridSpec } from "../grid";
import type { PlotSeries } from "../plot-data";

const GRID: GridSpec = {
    xRange: { min: 0, max: 10 },
    yRange: { min: 0, max: 20 },
    xResolution: 10,
    yResolution: 4
};

function seriesOf(points: Array<[number, number]>): PlotSeries {
    return {
        x: Float64Array.from(points, (point) => point[0]),
        y: Float64Array.from(points, (point) => point[1]),
        z: null,
        xRange: { min: 0, max: 10 },
        yRange: { min: 0, max: 10 },
        zRange: null,
        xKind: "number",
        yKind: "number",
        zKind: null,
        skippedRows: 0,
        groups: null,
        droppedGroups: 0,
        binWidth: null,
        sampledFrom: null,
        rowIndex: null,
        categories: null
    };
}

describe("cellOf", () => {
    it("puts the minimum corner in the first cell", () => {
        expect(cellOf(GRID, 0, 0)).toBe(0);
    });

    it("puts the maximum edge in the last cell", () => {
        expect(cellOf(GRID, 10, 20)).toBe(39);
        expect(cellOf(GRID, 10, 0)).toBe(9);
        expect(cellOf(GRID, 0, 20)).toBe(30);
    });

    it("counts the rows from the minimum of Y", () => {
        expect(cellOf(GRID, 0.5, 5)).toBe(10);
        expect(cellOf(GRID, 9.99, 4.99)).toBe(9);
    });

    it("returns -1 for a point outside the grid", () => {
        expect(cellOf(GRID, -0.1, 5)).toBe(-1);
        expect(cellOf(GRID, 10.1, 5)).toBe(-1);
        expect(cellOf(GRID, 5, -0.1)).toBe(-1);
        expect(cellOf(GRID, 5, 20.1)).toBe(-1);
    });

    it("returns -1 for NaN", () => {
        expect(cellOf(GRID, Number.NaN, 5)).toBe(-1);
        expect(cellOf(GRID, 5, Number.NaN)).toBe(-1);
    });
});

describe("fillGridGaps", () => {
    it("gives an empty cell the mean of its filled neighbours", () => {
        const values = Float64Array.from([1, 2, 3, 4, Number.NaN, 6, 7, 8, 9]);
        expect(fillGridGaps(values, 3)[4]).toBe((2 + 4 + 6 + 8) / 4);
    });

    it("does not take a neighbour from the end of the row above", () => {
        // Cell 3 starts row 1. Cell 2, at the end of row 0, is no neighbour.
        const values = Float64Array.from([10, 20, 100, Number.NaN, 40, 50]);
        expect(fillGridGaps(values, 3)[3]).toBe((10 + 40) / 2);
    });

    it("fills a gap a few cells deep, one ring per pass", () => {
        const values = Float64Array.from([0, Number.NaN, Number.NaN, Number.NaN, 6]);
        expect(Array.from(fillGridGaps(values, 5))).toEqual([0, 0, 3, 6, 6]);
    });

    it("gives the mean of all cells to a gap past the last pass", () => {
        const values = Float64Array.from([0, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 8]);
        expect(Array.from(fillGridGaps(values, 6, 1))).toEqual([0, 0, 4, 4, 8, 8]);
    });

    it("fills a grid with no value with zero", () => {
        const values = new Float64Array(4).fill(Number.NaN);
        expect(Array.from(fillGridGaps(values, 2))).toEqual([0, 0, 0, 0]);
    });

    it("keeps the input as it is", () => {
        const values = Float64Array.from([1, Number.NaN, 3]);
        fillGridGaps(values, 3);
        expect(values[1]).toBeNaN();
    });
});

describe("hullOf", () => {
    it("gives the corners as a closed ring", () => {
        const ring = hullOf(
            seriesOf([
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [5, 5],
                [3, 7]
            ])
        );

        expect(ring).toHaveLength(5);
        expect(ring[4]).toEqual(ring[0]);

        const corners = ring.slice(0, 4).map(([x, y]) => `${x},${y}`);
        expect(corners.sort()).toEqual(["0,0", "0,10", "10,0", "10,10"]);
    });

    it("gives no ring for points on one line", () => {
        expect(
            hullOf(
                seriesOf([
                    [0, 0],
                    [1, 1],
                    [2, 2]
                ])
            )
        ).toEqual([]);
    });

    it("gives no ring for points on one meridian or on a sloped line", () => {
        const meridian = seriesOf([
            [4, -60],
            [4, -50],
            [4, -40],
            [4, -30]
        ]);
        const sloped = seriesOf(
            Array.from({ length: 50 }, (_, i): [number, number] => [0.1 * i, 0.3 * i + 2])
        );

        expect(hullOf(meridian)).toEqual([]);
        expect(hullOf(sloped)).toEqual([]);
    });

    it("keeps the ring of a thin triangle", () => {
        expect(
            hullOf(
                seriesOf([
                    [0, 0],
                    [100, 0],
                    [50, 0.01]
                ])
            )
        ).toHaveLength(4);
    });

    it("gives no ring for fewer than three points", () => {
        expect(hullOf(seriesOf([[0, 0]]))).toEqual([]);
        expect(hullOf(seriesOf([]))).toEqual([]);
    });
});
