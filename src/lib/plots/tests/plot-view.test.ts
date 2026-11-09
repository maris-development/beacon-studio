import { describe, expect, it } from "vitest";
import {
    dragFigureSide,
    fitMapShape,
    formatAxisLimit,
    panRange,
    parseAxisLimit,
    zoomAround,
    zoomBoxOf,
    type PixelRect,
    type PlotView
} from "../plot-view";

describe("formatAxisLimit and parseAxisLimit", () => {
    it("shows a whole minute without seconds", () => {
        const value = Date.UTC(2020, 5, 16, 12, 30);
        expect(formatAxisLimit(value, true)).toBe("2020-06-16 12:30");
        expect(parseAxisLimit(formatAxisLimit(value, true), true)).toBe(value);
    });

    it("keeps the seconds of a time", () => {
        const value = Date.UTC(2020, 5, 16, 12, 30, 45);
        expect(formatAxisLimit(value, true)).toBe("2020-06-16 12:30:45");
        expect(parseAxisLimit(formatAxisLimit(value, true), true)).toBe(value);
    });

    it("keeps the milliseconds of a time", () => {
        const value = Date.UTC(2020, 5, 16, 12, 30, 0, 250);
        expect(formatAxisLimit(value, true)).toBe("2020-06-16 12:30:00.250");
        expect(parseAxisLimit(formatAxisLimit(value, true), true)).toBe(value);
    });

    it("reads a date with no time as midnight UTC", () => {
        expect(parseAxisLimit("2020-06-16", true)).toBe(Date.UTC(2020, 5, 16));
    });

    it("reads a time with a zone", () => {
        expect(parseAxisLimit("2020-06-16 14:30+02:00", true)).toBe(Date.UTC(2020, 5, 16, 12, 30));
    });

    it("round trips a plain value", () => {
        for (const value of [0, -3.5, 1234.5, 0.000125, 1e9]) {
            expect(parseAxisLimit(formatAxisLimit(value, false), false)).toBe(value);
        }
    });

    it("returns NaN for a text that is no value", () => {
        expect(parseAxisLimit("", false)).toBeNaN();
        expect(parseAxisLimit("abc", false)).toBeNaN();
        expect(parseAxisLimit("not a date", true)).toBeNaN();
    });
});

const AREA: PixelRect = { left: 0, top: 0, width: 400, height: 300 };

describe("zoomAround", () => {
    it("keeps the anchor at the same place", () => {
        const range = { min: 0, max: 10 };
        const zoomed = zoomAround(range, 2, 0.5);

        expect(zoomed).toEqual({ min: 1, max: 6 });
        expect((2 - zoomed.min) / (zoomed.max - zoomed.min)).toBeCloseTo(0.2);
    });

    it("grows the range with a factor above one", () => {
        expect(zoomAround({ min: 0, max: 10 }, 5, 2)).toEqual({ min: -5, max: 15 });
    });
});

describe("panRange", () => {
    it("moves both ends by the same amount", () => {
        expect(panRange({ min: 0, max: 10 }, 3)).toEqual({ min: 3, max: 13 });
        expect(panRange({ min: 0, max: 10 }, -12)).toEqual({ min: -12, max: -2 });
    });
});

describe("zoomBoxOf", () => {
    it("gives the box of a drag up and to the left", () => {
        expect(zoomBoxOf({ x: 100, y: 100 }, { x: 50, y: 40 }, AREA)).toEqual({
            rect: { left: 50, top: 40, width: 50, height: 60 },
            keep: "both"
        });
    });

    it("zooms only X for a box that is flat along Y", () => {
        expect(zoomBoxOf({ x: 100, y: 100 }, { x: 200, y: 105 }, AREA)).toEqual({
            rect: { left: 100, top: 0, width: 100, height: 300 },
            keep: "x"
        });
    });

    it("zooms only Y for a box that is flat along X", () => {
        expect(zoomBoxOf({ x: 100, y: 100 }, { x: 105, y: 200 }, AREA)).toEqual({
            rect: { left: 0, top: 100, width: 400, height: 100 },
            keep: "y"
        });
    });

    it("keeps a box that is flat on both sides as it is", () => {
        expect(zoomBoxOf({ x: 100, y: 100 }, { x: 103, y: 103 }, AREA)).toEqual({
            rect: { left: 100, top: 100, width: 3, height: 3 },
            keep: "both"
        });
    });

    it("stops the box at the edge of the plot area", () => {
        expect(zoomBoxOf({ x: 100, y: 100 }, { x: 900, y: -50 }, AREA)).toEqual({
            rect: { left: 100, top: 0, width: 300, height: 100 },
            keep: "both"
        });
    });
});

describe("fitMapShape", () => {
    const equator: PlotView = { x: { min: 0, max: 20 }, y: { min: -5, max: 5 } };

    it("keeps X and fits Y", () => {
        expect(fitMapShape(equator, "x", 1)).toEqual({
            x: { min: 0, max: 20 },
            y: { min: -10, max: 10 }
        });
    });

    it("keeps Y and fits X around its centre", () => {
        expect(fitMapShape(equator, "y", 1)).toEqual({
            x: { min: 5, max: 15 },
            y: { min: -5, max: 5 }
        });
    });

    it("grows the smaller side with both", () => {
        expect(fitMapShape(equator, "both", 1).y).toEqual({ min: -10, max: 10 });
        expect(fitMapShape(equator, "both", 4).x).toEqual({ min: -10, max: 30 });
    });

    it("makes a degree of longitude shorter at a high latitude", () => {
        const view = fitMapShape({ x: { min: 0, max: 10 }, y: { min: 55, max: 65 } }, "y", 1);

        expect(view.x.min).toBeCloseTo(-5);
        expect(view.x.max).toBeCloseTo(15);
        expect(view.y).toEqual({ min: 55, max: 65 });
    });

    it("gives the ratio of the plot box", () => {
        const view = fitMapShape(equator, "both", 1.5);
        const width = view.x.max - view.x.min;
        const height = view.y.max - view.y.min;

        expect(width / height).toBeCloseTo(1.5);
    });
});

describe("dragFigureSide", () => {
    it("adds two times the move", () => {
        expect(dragFigureSide(400, 50, 240, 1000)).toBe(500);
        expect(dragFigureSide(400, -50, 240, 1000)).toBe(300);
    });

    it("stops at the minimum and at the room", () => {
        expect(dragFigureSide(400, -200, 240, 1000)).toBe(240);
        expect(dragFigureSide(400, 400, 240, 1000)).toBe(1000);
    });

    it("gives the room when the room is smaller than the minimum", () => {
        expect(dragFigureSide(400, -300, 240, 200)).toBe(200);
    });
});
