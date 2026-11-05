/**
 * The search behind the hover tooltip: the point nearest to the mouse.
 *
 * A scatter can draw half a million points, and the mouse moves many times per
 * second. A scan of every point on each move costs too much, so the points go
 * into a grid of cells over the data range one time. A search then reads only
 * the cells under the mouse.
 *
 * The grid is in data units, so a zoom or a pan keeps it valid. The distance is
 * measured in pixels, through a linear transform per axis that the caller gives.
 */

/** The points of a series, sorted into cells of a grid over their range. */
export interface PointIndex {
    readonly x: ArrayLike<number>;
    readonly y: ArrayLike<number>;
    readonly cells: number;
    readonly xMin: number;
    readonly yMin: number;
    readonly xStep: number;
    readonly yStep: number;
    /** The points of cell `c` are `order[start[c]]` up to `order[start[c + 1]]`. */
    readonly start: Uint32Array;
    readonly order: Uint32Array;
}

/** Pixel = `a * value + b`, per axis. A reversed axis has a negative `a`. */
export interface PixelTransform {
    ax: number;
    bx: number;
    ay: number;
    by: number;
}

/** The most cells per side. More cells cost memory and give no faster search. */
const MAX_CELLS = 512;

export function buildPointIndex(x: ArrayLike<number>, y: ArrayLike<number>): PointIndex {
    const count = x.length;
    const cells = Math.max(1, Math.min(MAX_CELLS, Math.round(Math.sqrt(count / 4))));

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let i = 0; i < count; i++) {
        if (x[i] < xMin) xMin = x[i];
        if (x[i] > xMax) xMax = x[i];
        if (y[i] < yMin) yMin = y[i];
        if (y[i] > yMax) yMax = y[i];
    }

    if (count === 0) {
        xMin = 0;
        xMax = 1;
        yMin = 0;
        yMax = 1;
    }

    const xStep = (xMax - xMin) / cells || 1;
    const yStep = (yMax - yMin) / cells || 1;

    const cellOf = new Uint32Array(count);
    const start = new Uint32Array(cells * cells + 1);

    for (let i = 0; i < count; i++) {
        const column = Math.min(Math.floor((x[i] - xMin) / xStep), cells - 1);
        const row = Math.min(Math.floor((y[i] - yMin) / yStep), cells - 1);
        const cell = row * cells + column;
        cellOf[i] = cell;
        start[cell + 1]++;
    }

    for (let c = 0; c < cells * cells; c++) start[c + 1] += start[c];

    const fill = start.slice(0, cells * cells);
    const order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[fill[cellOf[i]]++] = i;

    return { x, y, cells, xMin, yMin, xStep, yStep, start, order };
}

/**
 * Call `visit` for every point within `radius` pixels of the pixel `(px, py)`,
 * with the squared distance. `accept` can leave a point out, for example a point
 * of a hidden group.
 */
export function forEachPointNear(
    index: PointIndex,
    transform: PixelTransform,
    px: number,
    py: number,
    radius: number,
    visit: (point: number, distanceSquared: number) => void,
    accept: ((point: number) => boolean) | null = null
): void {
    const { ax, bx, ay, by } = transform;
    if (!ax || !ay) return;

    // The data box of the circle. A reversed axis gives the ends in the other order.
    const xa = (px - radius - bx) / ax;
    const xb = (px + radius - bx) / ax;
    const ya = (py - radius - by) / ay;
    const yb = (py + radius - by) / ay;

    const { cells, xMin, yMin, xStep, yStep, start, order, x, y } = index;
    const c0 = clampCell(Math.floor((Math.min(xa, xb) - xMin) / xStep), cells);
    const c1 = clampCell(Math.floor((Math.max(xa, xb) - xMin) / xStep), cells);
    const r0 = clampCell(Math.floor((Math.min(ya, yb) - yMin) / yStep), cells);
    const r1 = clampCell(Math.floor((Math.max(ya, yb) - yMin) / yStep), cells);

    // A box past the edge of the grid holds no point.
    if (Math.max(xa, xb) < xMin || Math.max(ya, yb) < yMin) return;
    if (Math.min(xa, xb) > xMin + cells * xStep || Math.min(ya, yb) > yMin + cells * yStep) return;

    const limit = radius * radius;

    for (let row = r0; row <= r1; row++) {
        for (let column = c0; column <= c1; column++) {
            const cell = row * cells + column;

            for (let k = start[cell]; k < start[cell + 1]; k++) {
                const point = order[k];
                const dx = ax * x[point] + bx - px;
                if (dx > radius || dx < -radius) continue;
                const dy = ay * y[point] + by - py;
                if (dy > radius || dy < -radius) continue;

                const distance = dx * dx + dy * dy;
                if (distance > limit) continue;
                if (accept && !accept(point)) continue;
                visit(point, distance);
            }
        }
    }
}

/** The point nearest to the pixel, within `radius` pixels. Returns -1 when none is that near. */
export function nearestPoint(
    index: PointIndex,
    transform: PixelTransform,
    px: number,
    py: number,
    radius: number,
    accept: ((point: number) => boolean) | null = null
): number {
    let best = -1;
    let bestDistance = Infinity;

    forEachPointNear(
        index,
        transform,
        px,
        py,
        radius,
        (point, distance) => {
            if (distance >= bestDistance) return;
            best = point;
            bestDistance = distance;
        },
        accept
    );

    return best;
}

/** True when the point lies inside the closed ring. The ring is a list of `[x, y]` pairs. */
export function insideRing(
    ring: ReadonlyArray<readonly [number, number]>,
    x: number,
    y: number
): boolean {
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }

    return inside;
}

function clampCell(value: number, cells: number): number {
    if (value < 0) return 0;
    if (value > cells - 1) return cells - 1;
    return value;
}
