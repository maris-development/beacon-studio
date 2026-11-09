import { describe, expect, it } from "vitest";
import { diffuse, diffusionPeak } from "../barnes";
import type { GridSpec } from "../grid";

/** The value that one unit keeps at its own cell after the diffusion along one open row. */
function diffusedPeak(sigma: number): number {
    const half = Math.ceil(8 * sigma) + 4;
    const length = 2 * half + 1;
    const grid: GridSpec = {
        xRange: { min: 0, max: length },
        yRange: { min: 0, max: 1 },
        xResolution: length,
        yResolution: 1
    };
    const impulse = new Float64Array(length);
    impulse[half] = 1;

    return diffuse(impulse, grid, null, sigma, 0)[half];
}

describe("diffusionPeak", () => {
    it.each([0.3, 1, 2, 3.9])("diffuses an impulse for sigma %d", (sigma) => {
        expect(diffusionPeak(sigma)).toBeCloseTo(diffusedPeak(sigma), 12);
    });

    it.each([4, 5, 20, 50])("is within 1 % of the diffusion for sigma %d", (sigma) => {
        const expected = diffusedPeak(sigma);
        expect(Math.abs(diffusionPeak(sigma) - expected) / expected).toBeLessThan(0.01);
    });

    it("keeps the whole unit for no spread", () => {
        expect(diffusionPeak(0)).toBe(1);
    });
});
