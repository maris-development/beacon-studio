/** The regular grid that the interpolated surface and the contour lines share. */
import { contours as d3Contours } from "d3-contour";
import { Delaunay } from "d3-delaunay";
import type { PlotRange, PlotSeries } from "./plot-data";

/** A closed ring of `[x, y]` points, in data coordinates. */
export type ContourRing = Array<[number, number]>;

/** A grid larger than this is refused. It costs more than it shows. */
export const MAX_GRID_RESOLUTION = 500;

/** The extent and the cell count of a grid. Row 0 is at the minimum of Y. */
export interface GridSpec {
    xRange: PlotRange;
    yRange: PlotRange;
    xResolution: number;
    yResolution: number;
}

/** One value per cell, row by row. NaN marks a cell with no value. */
export interface GridField extends GridSpec {
    values: Float64Array;
}

/** The observations of a series, added up per cell. */
export interface BinnedSeries {
    count: Float64Array;
    sum: Float64Array;
    /** The mean of all binned values. */
    mean: number;
}

/** How far a point outside the domain can move to a domain cell, in cells. */
export const NUDGE_CELLS = 2;

/** The cell that holds a point, or -1 when the point is outside the grid. */
export function cellOf(grid: GridSpec, x: number, y: number): number {
    const { xRange, yRange, xResolution, yResolution } = grid;
    const u = (x - xRange.min) / (xRange.max - xRange.min);
    const v = (y - yRange.min) / (yRange.max - yRange.min);
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return -1;

    const column = Math.min(Math.floor(u * xResolution), xResolution - 1);
    const row = Math.min(Math.floor(v * yResolution), yResolution - 1);
    return row * xResolution + column;
}

/**
 * The cell of the domain that takes a point in this cell.
 *
 * A coarse coastline can put a coastal station on the wrong side. Such a point moves to the nearest
 * domain cell within {@link NUDGE_CELLS}. Returns -1 when there is none.
 */
export function domainCellOf(grid: GridSpec, domain: Uint8Array | null, cell: number): number {
    if (cell < 0 || !domain || domain[cell]) return cell;

    const { xResolution, yResolution } = grid;
    const row = Math.floor(cell / xResolution);
    const column = cell % xResolution;
    let best = -1;
    let bestDistance = Infinity;

    for (let dr = -NUDGE_CELLS; dr <= NUDGE_CELLS; dr++) {
        for (let dc = -NUDGE_CELLS; dc <= NUDGE_CELLS; dc++) {
            const r = row + dr;
            const c = column + dc;
            if (r < 0 || r >= yResolution || c < 0 || c >= xResolution) continue;

            const distance = dr * dr + dc * dc;
            if (domain[r * xResolution + c] && distance < bestDistance) {
                best = r * xResolution + c;
                bestDistance = distance;
            }
        }
    }

    return best;
}

/** Add up the Z values of a series per cell. Points outside the grid or the domain drop out. */
export function binSeries(
    series: PlotSeries,
    grid: GridSpec,
    domain: Uint8Array | null
): BinnedSeries | null {
    const z = series.z;
    if (!z) return null;

    const cells = grid.xResolution * grid.yResolution;
    const count = new Float64Array(cells);
    const sum = new Float64Array(cells);
    let total = 0;
    let points = 0;

    for (let i = 0; i < series.x.length; i++) {
        if (!Number.isFinite(z[i])) continue;

        const cell = domainCellOf(grid, domain, cellOf(grid, series.x[i], series.y[i]));
        if (cell < 0) continue;

        count[cell] += 1;
        sum[cell] += z[i];
        total += z[i];
        points += 1;
    }

    if (points === 0) return null;
    return { count, sum, mean: total / points };
}

/** The convex hull of the points, as a closed ring. Empty when the points span no area. */
export function hullOf(series: PlotSeries): ContourRing {
    const delaunay = Delaunay.from(
        Array.from(series.x, (x, i) => [x, series.y[i]] as [number, number])
    );
    if (delaunay.hull.length < 3) return [];

    const ring: ContourRing = Array.from(delaunay.hull, (index) => [
        series.x[index],
        series.y[index]
    ]);
    ring.push(ring[0]);

    // d3-delaunay moves points on one line a little, so their hull has a tiny area.
    if (ringArea(ring) <= 1e-9 * boxArea(ring)) return [];
    return ring;
}

/** The area of a closed ring, by the shoelace formula. */
function ringArea(ring: ContourRing): number {
    let twice = 0;
    for (let i = 1; i < ring.length; i++) {
        twice += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
    }
    return Math.abs(twice) / 2;
}

/** The area of the bounding box of a ring. */
function boxArea(ring: ContourRing): number {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const [x, y] of ring) {
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
    }

    return (xMax - xMin) * (yMax - yMin);
}

/**
 * A copy where each empty cell takes the mean of its filled neighbours, a few cells deep. The rest
 * takes the mean of all cells. The contour tracer needs a value in each cell, and a clip hides the
 * filled cells again, so no line traces the edge of a gap.
 */
export function fillGridGaps(values: Float64Array, xResolution: number, passes = 6): Float64Array {
    const output = Float64Array.from(values);
    let todo: number[] = [];
    for (let k = 0; k < output.length; k++) {
        if (!Number.isFinite(output[k])) todo.push(k);
    }

    for (let pass = 0; pass < passes && todo.length > 0; pass++) {
        const updates: Array<[number, number]> = [];
        const next: number[] = [];

        for (const k of todo) {
            const column = k % xResolution;
            const neighbours = [k - xResolution, k + xResolution];
            if (column > 0) neighbours.push(k - 1);
            if (column < xResolution - 1) neighbours.push(k + 1);

            let sum = 0;
            let count = 0;
            for (const j of neighbours) {
                if (j < 0 || j >= output.length || !Number.isFinite(output[j])) continue;
                sum += output[j];
                count++;
            }

            if (count > 0) {
                updates.push([k, sum / count]);
            } else {
                next.push(k);
            }
        }

        for (const [k, value] of updates) output[k] = value;
        todo = next;
    }

    if (todo.length > 0) {
        let sum = 0;
        let count = 0;
        for (const value of output) {
            if (!Number.isFinite(value)) continue;
            sum += value;
            count++;
        }

        let mean = 0;
        if (count > 0) mean = sum / count;
        for (const k of todo) output[k] = mean;
    }

    return output;
}

/** The rings of d3 contour polygons, from grid space to data coordinates. */
export function gridRings(coordinates: number[][][][], grid: GridSpec): ContourRing[] {
    // Grid space runs 0..resolution, with cell i between i and i + 1.
    const xStep = (grid.xRange.max - grid.xRange.min) / grid.xResolution;
    const yStep = (grid.yRange.max - grid.yRange.min) / grid.yResolution;

    return coordinates
        .flat()
        .filter((ring) => ring.length >= 3)
        .map((ring) =>
            ring.map(([x, y]) => [grid.xRange.min + x * xStep, grid.yRange.min + y * yStep])
        );
}

/**
 * The edge of the cells with a value, as smooth rings: the contour of a score at its threshold, or
 * of a 0/1 mask without a score. A cell outside the domain counts as valid, because the coastline
 * clips there. Null when no cell in the domain is empty.
 */
export function validOutline(
    field: GridField,
    domain: Uint8Array | null,
    score: Float64Array | null,
    threshold = 0.5
): ContourRing[] | null {
    const empty = field.values.some(
        (value, k) => !Number.isFinite(value) && (!domain || domain[k])
    );
    if (!empty) return null;

    const grid = Array.from(field.values, (value, k) => {
        if (domain && !domain[k]) return 1e9;
        if (score) return score[k];
        return Number(Number.isFinite(value));
    });

    const [shape] = d3Contours()
        .size([field.xResolution, field.yResolution])
        .thresholds([threshold])(grid);
    return gridRings(shape.coordinates, field);
}

/** A cost that stands for "no data here" in the distance transform. Infinity would give NaN. */
const FAR = 1e20;

/**
 * The squared distance from each cell to the nearest cell with data, in units of the maximum
 * distance: a value of 1 or less is near the data.
 *
 * `xWeight` holds per row the squared size of one cell along X, and `yWeight` that along Y, both in
 * those units. On a map a degree of longitude shrinks with the latitude, so the X weight changes per
 * row. The exact transform of Felzenszwalb and Huttenlocher (2012) runs along the rows, then along
 * the columns.
 */
export function distanceToData(
    occupied: ArrayLike<number>,
    grid: GridSpec,
    xWeight: Float64Array,
    yWeight: number
): Float64Array {
    const { xResolution: nx, yResolution: ny } = grid;
    const distance = new Float64Array(nx * ny);
    const line = new Float64Array(Math.max(nx, ny));
    const result = new Float64Array(Math.max(nx, ny));
    const scratch = {
        hulls: new Int32Array(Math.max(nx, ny)),
        bounds: new Float64Array(Math.max(nx, ny) + 1)
    };

    for (let row = 0; row < ny; row++) {
        for (let column = 0; column < nx; column++) {
            line[column] = occupied[row * nx + column] ? 0 : FAR;
        }
        distanceTransform1d(line, nx, xWeight[row], result, scratch);
        for (let column = 0; column < nx; column++) distance[row * nx + column] = result[column];
    }

    for (let column = 0; column < nx; column++) {
        for (let row = 0; row < ny; row++) line[row] = distance[row * nx + column];
        distanceTransform1d(line, ny, yWeight, result, scratch);
        for (let row = 0; row < ny; row++) distance[row * nx + column] = result[row];
    }

    return distance;
}

/** The lower envelope of the parabolas w·(q - p)² + f(p): for each q, the least of them. */
function distanceTransform1d(
    costs: Float64Array,
    n: number,
    weight: number,
    output: Float64Array,
    scratch: { hulls: Int32Array; bounds: Float64Array }
): void {
    const { hulls, bounds } = scratch;
    const at = (p: number): number => costs[p] + weight * p * p;
    let k = 0;
    hulls[0] = 0;
    bounds[0] = -Infinity;
    bounds[1] = Infinity;

    for (let q = 1; q < n; q++) {
        let crossing = (at(q) - at(hulls[k])) / (2 * weight * (q - hulls[k]));
        while (crossing <= bounds[k]) {
            k--;
            crossing = (at(q) - at(hulls[k])) / (2 * weight * (q - hulls[k]));
        }
        k++;
        hulls[k] = q;
        bounds[k] = crossing;
        bounds[k + 1] = Infinity;
    }

    k = 0;
    for (let q = 0; q < n; q++) {
        while (bounds[k + 1] < q) k++;
        const p = hulls[k];
        output[q] = Math.min(weight * (q - p) * (q - p) + costs[p], FAR);
    }
}
