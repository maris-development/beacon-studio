import { describe, expect, it } from "vitest";
import { formatAxisLimit, parseAxisLimit } from "../plot-view";

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
