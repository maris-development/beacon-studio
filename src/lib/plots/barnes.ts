/**
 * Barnes analysis on a grid: a Gaussian weighted average of the observations, in two passes.
 *
 * - Barnes (1964), doi:10.1175/1520-0450(1964)003<0396:ATFMDI>2.0.CO;2: the weight of an observation
 *   is a Gaussian of its distance.
 * - Koch, DesJardins and Kocin (1983), J. Climate Appl. Meteor. 22, 1487-1503: a second pass adds the
 *   weighted misfit, with a shorter length.
 * - Weaver and Courtier (2001), Q. J. R. Meteorol. Soc. 127, 1815-1846: diffusion gives the Gaussian
 *   weights. The diffusion moves only between neighbour cells of the domain, so land blocks it.
 */
import type { BinnedSeries, GridSpec } from "./grid";

/** The variance of the second pass, as a fraction of the variance of the first pass. */
const SECOND_PASS_VARIANCE = 0.3;

/** Implicit diffusion steps per pass. More steps give a weight closer to a Gaussian. */
const DIFFUSION_STEPS = 16;

/** The weight of the data mean, as a fraction of one observation at its own cell. */
const BACKGROUND_WEIGHT = 1e-3;

/** A sigma above this many grid widths acts as an infinite one, and costs less. */
const MAX_SIGMA_GRIDS = 4;

/**
 * The Barnes analysis of binned observations. NaN outside the domain.
 *
 * `sigmaX` holds the Gaussian sigma along X of each row, in cells: on a map it grows with the
 * latitude. `sigmaY` is in cells too. `domain` holds 1 for each cell that takes part, or is null for
 * all cells. Far from the observations, the analysis goes to their mean.
 */
export function barnesAnalysis(
    binned: BinnedSeries,
    grid: GridSpec,
    sigmaX: Float64Array,
    sigmaY: number,
    domain: Uint8Array | null
): Float64Array {
    const { xResolution, yResolution } = grid;
    const cells = xResolution * yResolution;
    const { count, sum, mean } = binned;
    const limit = MAX_SIGMA_GRIDS * Math.max(xResolution, yResolution);
    const firstX = sigmaX.map((sigma) => Math.min(sigma, limit));
    const firstY = Math.min(sigmaY, limit);
    const peaks = new PeakTable();

    const weight = diffuse(count, grid, domain, firstX, firstY);
    const weightedSum = diffuse(sum, grid, domain, firstX, firstY);
    const peak = firstX.map((sigma) => peaks.of(sigma) * peaks.of(firstY));

    const values = new Float64Array(cells);
    const misfit = new Float64Array(cells);

    for (let i = 0; i < cells; i++) {
        const background = BACKGROUND_WEIGHT * peak[Math.floor(i / xResolution)];
        values[i] = (weightedSum[i] + background * mean) / (weight[i] + background);
        if (count[i] > 0) misfit[i] = sum[i] - count[i] * values[i];
    }

    const scale = Math.sqrt(SECOND_PASS_VARIANCE);
    const secondX = firstX.map((sigma) => sigma * scale);
    const secondY = firstY * scale;
    const secondWeight = diffuse(count, grid, domain, secondX, secondY);
    const secondSum = diffuse(misfit, grid, domain, secondX, secondY);
    const secondPeak = secondX.map((sigma) => peaks.of(sigma) * peaks.of(secondY));

    for (let i = 0; i < cells; i++) {
        if (domain && !domain[i]) {
            values[i] = Number.NaN;
            continue;
        }

        const background = BACKGROUND_WEIGHT * secondPeak[Math.floor(i / xResolution)];
        values[i] += secondSum[i] / (secondWeight[i] + background);
    }

    return values;
}

/**
 * Spread a field by implicit diffusion, one axis at a time.
 *
 * In open space the result tends to a Gaussian blur with these sigmas, in cells. `sigmaX` is one
 * value, or one value per row. A value moves only between two neighbour cells of the domain, and the
 * total of each connected area stays the same.
 */
export function diffuse(
    field: Float64Array,
    grid: GridSpec,
    domain: Uint8Array | null,
    sigmaX: number | Float64Array,
    sigmaY: number
): Float64Array {
    const { xResolution, yResolution } = grid;
    const output = Float64Array.from(field);
    if (domain) {
        for (let i = 0; i < output.length; i++) {
            if (!domain[i]) output[i] = 0;
        }
    }

    const scratch = new Float64Array(2 * Math.max(xResolution, yResolution));
    // One implicit step adds a variance of 2r cells squared.
    const rx = new Float64Array(yResolution);
    for (let row = 0; row < yResolution; row++) {
        let sigma = sigmaX;
        if (typeof sigma !== "number") sigma = sigma[row];
        rx[row] = (sigma * sigma) / (2 * DIFFUSION_STEPS);
    }
    const ry = (sigmaY * sigmaY) / (2 * DIFFUSION_STEPS);

    for (let step = 0; step < DIFFUSION_STEPS; step++) {
        for (let row = 0; row < yResolution; row++) {
            if (rx[row] > 0) {
                diffuseLine(output, domain, row * xResolution, 1, xResolution, rx[row], scratch);
            }
        }

        if (ry > 0) {
            for (let column = 0; column < xResolution; column++) {
                diffuseLine(output, domain, column, xResolution, yResolution, ry, scratch);
            }
        }
    }

    return output;
}

/** One implicit step on each run of domain cells along a line. No value leaves a run. */
function diffuseLine(
    values: Float64Array,
    domain: Uint8Array | null,
    start: number,
    stride: number,
    length: number,
    r: number,
    scratch: Float64Array
): void {
    let runStart = 0;

    while (runStart < length) {
        if (domain && !domain[start + runStart * stride]) {
            runStart++;
            continue;
        }

        let runEnd = runStart + 1;
        while (runEnd < length && (!domain || domain[start + runEnd * stride])) runEnd++;

        solveRun(values, start + runStart * stride, stride, runEnd - runStart, r, scratch);
        runStart = runEnd;
    }
}

/** Solve (1 - r·D²) u = v on one run, with no flux at its ends (Thomas algorithm). */
function solveRun(
    values: Float64Array,
    first: number,
    stride: number,
    n: number,
    r: number,
    scratch: Float64Array
) {
    if (n < 2) return;

    const upper = scratch;
    const right = scratch.subarray(n);

    for (let i = 0; i < n; i++) {
        let diagonal = 1 + 2 * r;
        if (i === 0 || i === n - 1) diagonal = 1 + r;

        let previousUpper = 0;
        let previousRight = 0;
        if (i > 0) {
            previousUpper = upper[i - 1];
            previousRight = right[i - 1];
        }

        const pivot = diagonal + r * previousUpper;
        upper[i] = -r / pivot;
        right[i] = (values[first + i * stride] + r * previousRight) / pivot;
    }

    values[first + (n - 1) * stride] = right[n - 1];

    for (let i = n - 2; i >= 0; i--) {
        values[first + i * stride] = right[i] - upper[i] * values[first + (i + 1) * stride];
    }
}

/** The value that one unit at a cell keeps after the diffusion along one open axis, by sigma. */
class PeakTable {
    private peaks = new Map<number, number>();

    of(sigma: number): number {
        let peak = this.peaks.get(sigma);
        if (peak === undefined) {
            peak = impulsePeak(sigma);
            this.peaks.set(sigma, peak);
        }
        return peak;
    }
}

function impulsePeak(sigma: number): number {
    if (!(sigma > 0)) return 1;

    const half = Math.ceil(8 * sigma) + 4;
    const length = 2 * half + 1;
    const line = new Float64Array(length);
    line[half] = 1;

    const r = (sigma * sigma) / (2 * DIFFUSION_STEPS);
    const scratch = new Float64Array(2 * length);

    for (let step = 0; step < DIFFUSION_STEPS; step++) {
        solveRun(line, 0, 1, length, r, scratch);
    }

    return line[half];
}
