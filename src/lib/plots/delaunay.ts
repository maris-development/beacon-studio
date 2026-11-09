/**
 * Linear interpolation on a Delaunay triangulation of the points.
 *
 * Each cell centre takes the barycentric mix of the three corners of its triangle. Nothing draws
 * outside the convex hull of the points. The axes scale to 0..1 before the triangulation, so a time
 * axis in milliseconds does not give long, thin triangles.
 */
import { Delaunay } from "d3-delaunay";
import { cellOf, domainCellOf, type GridSpec } from "./grid";
import type { PlotSeries } from "./plot-data";

interface ScaledPoint {
    u: number;
    v: number;
    z: number;
}

/**
 * The interpolated value of each cell. NaN where no usable triangle covers the cell centre.
 *
 * `domain` holds 1 for each cell that takes part, or is null for all cells. A triangle that crosses
 * a cell outside the domain drops out, so no value crosses a strip of land.
 */
export function delaunayField(
    series: PlotSeries,
    grid: GridSpec,
    domain: Uint8Array | null
): Float64Array | null {
    const points = scaledPoints(series, grid, domain);
    if (points.length < 3) return null;

    const delaunay = Delaunay.from(
        points,
        (point) => point.u,
        (point) => point.v
    );
    const { triangles, halfedges } = delaunay;
    if (triangles.length < 3) return null;

    const usable = usableTriangles(points, triangles, grid, domain);
    const { xResolution, yResolution } = grid;
    const values = new Float64Array(xResolution * yResolution).fill(Number.NaN);
    let triangle = 0;

    for (let row = 0; row < yResolution; row++) {
        const v = (row + 0.5) / yResolution;

        for (let column = 0; column < xResolution; column++) {
            const cell = row * xResolution + column;
            if (domain && !domain[cell]) continue;

            const u = (column + 0.5) / xResolution;
            const located = locate(u, v, points, triangles, halfedges, triangle);
            if (!located) continue;

            triangle = located.triangle;
            if (usable[triangle / 3]) values[cell] = located.value;
        }
    }

    return values;
}

/** One point per position, with the mean Z of its rows, in scaled axes. */
function scaledPoints(
    series: PlotSeries,
    grid: GridSpec,
    domain: Uint8Array | null
): ScaledPoint[] {
    const z = series.z;
    if (!z) return [];

    const { xRange, yRange } = grid;
    const xSpan = xRange.max - xRange.min;
    const ySpan = yRange.max - yRange.min;
    const byPosition = new Map<string, { x: number; y: number; total: number; count: number }>();

    for (let i = 0; i < series.x.length; i++) {
        const x = series.x[i];
        const y = series.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z[i])) continue;

        // A point outside the grid still shapes the triangles inside it.
        const cell = cellOf(grid, x, y);
        if (domain && cell >= 0 && domainCellOf(grid, domain, cell) < 0) continue;

        const key = `${x}\u0000${y}`;
        const existing = byPosition.get(key);
        if (existing) {
            existing.total += z[i];
            existing.count += 1;
        } else {
            byPosition.set(key, { x, y, total: z[i], count: 1 });
        }
    }

    const points: ScaledPoint[] = [];
    for (const point of byPosition.values()) {
        points.push({
            u: (point.x - xRange.min) / xSpan,
            v: (point.y - yRange.min) / ySpan,
            z: point.total / point.count
        });
    }

    return points;
}

/** 1 for each triangle that may draw, by the index of its first half-edge divided by 3. */
function usableTriangles(
    points: ScaledPoint[],
    triangles: Uint32Array,
    grid: GridSpec,
    domain: Uint8Array | null
): Uint8Array {
    const usable = new Uint8Array(triangles.length / 3).fill(1);
    if (!domain) return usable;

    for (let t = 0; t < triangles.length; t += 3) {
        const a = points[triangles[t]];
        const b = points[triangles[t + 1]];
        const c = points[triangles[t + 2]];

        const crosses =
            crossesOutside(a, b, grid, domain) ||
            crossesOutside(b, c, grid, domain) ||
            crossesOutside(c, a, grid, domain);
        if (crosses) usable[t / 3] = 0;
    }

    return usable;
}

/** True when the edge passes a cell outside the domain. The cells of its two ends do not count. */
function crossesOutside(
    a: ScaledPoint,
    b: ScaledPoint,
    grid: GridSpec,
    domain: Uint8Array
): boolean {
    const { xResolution, yResolution } = grid;
    const cellAt = (u: number, v: number): number => {
        if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return -1;
        return Math.floor(v * yResolution) * xResolution + Math.floor(u * xResolution);
    };

    const clipped = clipToUnitSquare(a, b);
    if (!clipped) return false;

    const [t0, t1] = clipped;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const startCell = cellAt(a.u, a.v);
    const endCell = cellAt(b.u, b.v);
    // Two samples per cell along the part of the edge inside the grid.
    const steps = Math.ceil(
        2 * (t1 - t0) * Math.max(Math.abs(du) * xResolution, Math.abs(dv) * yResolution)
    );

    for (let s = 0; s <= steps; s++) {
        const f = t0 + ((t1 - t0) * s) / Math.max(steps, 1);
        const cell = cellAt(a.u + f * du, a.v + f * dv);
        if (cell < 0 || cell === startCell || cell === endCell) continue;
        if (!domain[cell]) return true;
    }

    return false;
}

/**
 * The part of the edge from `a` to `b` inside the unit square, as fractions `[t0, t1]` of the edge.
 * Null when the edge misses the square. Liang-Barsky clipping.
 */
function clipToUnitSquare(a: ScaledPoint, b: ScaledPoint): [number, number] | null {
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const sides: Array<[number, number]> = [
        [-du, a.u],
        [du, 1 - a.u],
        [-dv, a.v],
        [dv, 1 - a.v]
    ];

    let t0 = 0;
    let t1 = 1;
    for (const [p, q] of sides) {
        if (p === 0) {
            if (q < 0) return null;
            continue;
        }

        const t = q / p;
        if (p < 0) {
            if (t > t1) return null;
            t0 = Math.max(t0, t);
        } else {
            if (t < t0) return null;
            t1 = Math.min(t1, t);
        }
    }

    return [t0, t1];
}

/** Walk from a start triangle to the triangle that holds the point, and mix its corners. */
function locate(
    u: number,
    v: number,
    points: ScaledPoint[],
    triangles: Uint32Array,
    halfedges: Int32Array,
    start: number
): { triangle: number; value: number } | null {
    let triangle = start - (start % 3);
    if (triangle < 0 || triangle >= triangles.length) triangle = 0;

    // A walk visits each triangle at most one time.
    for (let visited = 0; visited <= triangles.length / 3; visited++) {
        const a = points[triangles[triangle]];
        const b = points[triangles[triangle + 1]];
        const c = points[triangles[triangle + 2]];

        const denominator = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v);
        if (Math.abs(denominator) < 1e-15) return null;

        const weightA = ((b.v - c.v) * (u - c.u) + (c.u - b.u) * (v - c.v)) / denominator;
        const weightB = ((c.v - a.v) * (u - c.u) + (a.u - c.u) * (v - c.v)) / denominator;
        const weightC = 1 - weightA - weightB;

        const epsilon = -1e-9;
        if (weightA >= epsilon && weightB >= epsilon && weightC >= epsilon) {
            return { triangle, value: weightA * a.z + weightB * b.z + weightC * c.z };
        }

        // Cross the edge in front of the corner with the most negative weight.
        let edge = 1;
        let lowest = weightA;
        if (weightB < lowest) {
            edge = 2;
            lowest = weightB;
        }
        if (weightC < lowest) edge = 0;

        const next = halfedges[triangle + edge];
        if (next < 0) return null;
        triangle = next - (next % 3);
    }

    return null;
}
