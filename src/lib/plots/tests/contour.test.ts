import { describe, expect, it } from "vitest";
import { buildContours } from "../contour";
import { buildInterpolationField } from "../interpolation";
import {
    DEFAULT_INTERPOLATION,
    makePlotConfig,
    type PlotInterpolationExtent
} from "../plot-config";
import type { PlotSeries } from "../plot-data";

/** A 10 by 10 grid of points with z = x + y. */
function gridSeries(): PlotSeries {
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            x.push(i);
            y.push(j);
            z.push(i + j);
        }
    }

    return {
        x: Float64Array.from(x),
        y: Float64Array.from(y),
        z: Float64Array.from(z),
        xRange: { min: 0, max: 9 },
        yRange: { min: 0, max: 9 },
        zRange: { min: 0, max: 18 },
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

function contoursFor(extent: PlotInterpolationExtent) {
    const series = gridSeries();
    const interpolation = {
        ...DEFAULT_INTERPOLATION,
        enabled: true,
        method: "barnes" as const,
        extent
    };
    const plot = makePlotConfig({ interpolation });
    const field = buildInterpolationField(series, interpolation, series.xRange, series.yRange, {
        land: null,
        map: false
    });
    if (!field) throw new Error("no field");

    return { field, contours: buildContours(field, plot, { min: 0, max: 18 }) };
}

describe("buildContours", () => {
    it("has no outline when the surface has none", () => {
        const { contours } = contoursFor("all");
        expect(contours).not.toBeNull();
        expect(contours?.outline).toEqual([]);
    });

    it("takes the outline of the field for the hull extent", () => {
        const { field, contours } = contoursFor("hull");
        expect(field.outline.length).toBeGreaterThanOrEqual(3);
        expect(contours?.outline).toBe(field.outline);
    });
});
