import { describe, expect, it } from "vitest";
import { fieldRanges } from "../interpolation";
import {
    DEFAULT_INTERPOLATION,
    type PlotInterpolationExtent,
    type PlotInterpolationMethod
} from "../plot-config";
import type { PlotSeries } from "../plot-data";

/** A series with data from 2 to 8 on both axes. Only the ranges matter here. */
const series = {
    xRange: { min: 2, max: 8 },
    yRange: { min: 2, max: 8 }
} as PlotSeries;

const axis = { min: 0, max: 10 };

function rangesFor(method: PlotInterpolationMethod, extent: PlotInterpolationExtent) {
    const settings = { ...DEFAULT_INTERPOLATION, method, extent };
    return fieldRanges(series, settings, axis, axis);
}

describe("fieldRanges", () => {
    it("cuts the axis ranges to the data for the hull extent", () => {
        expect(rangesFor("barnes", "hull")).toEqual({
            x: { min: 2, max: 8 },
            y: { min: 2, max: 8 }
        });
    });

    it("reads Delaunay with extent all as the hull", () => {
        expect(rangesFor("delaunay-barycentric", "all").x).toEqual({ min: 2, max: 8 });
    });

    it("keeps the axis ranges for the near and all extents of Barnes", () => {
        expect(rangesFor("barnes", "near")).toEqual({ x: axis, y: axis });
        expect(rangesFor("barnes", "all")).toEqual({ x: axis, y: axis });
    });

    it("keeps an axis limit inside the data", () => {
        const cut = fieldRanges(
            series,
            { ...DEFAULT_INTERPOLATION, extent: "hull" },
            { min: 4, max: 6 },
            axis
        );
        expect(cut.x).toEqual({ min: 4, max: 6 });
    });
});
