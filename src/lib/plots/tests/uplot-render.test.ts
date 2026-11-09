import { describe, expect, it } from "vitest";
import { contourStrokes } from "../uplot-render";

describe("contourStrokes", () => {
    const colors = { backgroundColor: "#17171b", textColor: "#e4e4e7" };

    it("strokes a halo in the background colour below the line", () => {
        expect(contourStrokes(1, 1, colors)).toEqual([
            { color: "#17171b", width: 3 },
            { color: "#e4e4e7", width: 1 }
        ]);
    });

    it("scales both widths with the pixel ratio", () => {
        expect(contourStrokes(1.5, 2, colors)).toEqual([
            { color: "#17171b", width: 7 },
            { color: "#e4e4e7", width: 3 }
        ]);
    });
});
