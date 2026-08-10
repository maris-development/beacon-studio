/**
 * Contour — turn a scatter of (x, y, z) points into contour lines.
 *
 * A contour algorithm needs a value at every cell of a regular grid. Ship data
 * is not that: it is an irregular scatter along a track. Therefore this module
 * has two parts.
 *
 * 1. **Gridding.** Every cell takes an inverse distance weighted average of the
 *    points near it. "Near" means inside a search radius of a few cells, found
 *    through a bin index, so the cost does not grow with the point count in the
 *    way a scan over every point would. A cell with no point in range widens its
 *    search until it finds one, so no cell stays empty and the contour algorithm
 *    never meets a hole.
 *
 * 2. **Clipping.** Step 1 also invents values far outside the data, because a
 *    far cell still finds a nearest point. Drawing those would claim knowledge
 *    the query does not have. Therefore the result carries the convex hull of
 *    the points, and the renderer clips to it.
 *
 * The output is in data coordinates, not pixels. The chart owns the scales, so
 * the plugin converts at draw time and the contours survive a resize without a
 * recompute.
 */
import { contours as d3Contours } from 'd3-contour';
import { polygonHull } from 'd3-polygon';
import type { PlotRange, PlotSeries } from './plot-data';
import { resolveRange } from './plot-data';
import type { PlotConfig } from './plot-config';

/** A closed ring of `[x, y]` points, in data coordinates. */
export type ContourRing = Array<[number, number]>;

export interface ContourLevel {
	/** The Z value of this level. */
	value: number;
	rings: ContourRing[];
}

export interface ContourResult {
	levels: ContourLevel[];
	/** The convex hull of the points. The renderer clips to it. */
	hull: ContourRing;
	/** The Z range that the levels span. The colour of a level comes from it. */
	range: PlotRange;
}

/**
 * How far a cell searches for points, as a count of cells. A wider radius
 * smooths the field; a narrow one keeps detail but leaves more cells to the
 * widening fallback.
 */
const SEARCH_CELLS = 2;

/** A grid larger than this is refused. It costs more than it shows. */
const MAX_RESOLUTION = 500;

/**
 * Build the contours of a series.
 *
 * Returns null when the plot cannot have contours: no Z axis, too few points, or
 * a flat Z range, which has no level to draw.
 */
export function buildContours(
	series: PlotSeries,
	plot: PlotConfig,
	xRange: PlotRange,
	yRange: PlotRange
): ContourResult | null {
	if (!series.z || !series.zRange) return null;
	if (series.x.length < 3) return null;

	const range = resolveRange(series.zRange, plot.z?.min ?? null, plot.z?.max ?? null);
	if (!(range.max > range.min)) return null;

	const resolution = Math.min(
		Math.max(Math.round(plot.contour.gridResolution), 10),
		MAX_RESOLUTION
	);
	const levelCount = Math.min(Math.max(Math.round(plot.contour.levelCount), 2), 50);

	const grid = gridSeries(series, xRange, yRange, resolution);
	if (!grid) return null;

	// The thresholds sit between the ends, and not on them: a contour exactly at
	// the minimum or the maximum encloses nothing or everything.
	const step = (range.max - range.min) / (levelCount + 1);
	const thresholds: number[] = [];

	for (let i = 1; i <= levelCount; i++) {
		thresholds.push(range.min + i * step);
	}

	const generator = d3Contours().size([resolution, resolution]).thresholds(thresholds);
	const shapes = generator(Array.from(grid));

	// Grid space runs 0..resolution. Map a cell centre back to data coordinates.
	const xStep = (xRange.max - xRange.min) / resolution;
	const yStep = (yRange.max - yRange.min) / resolution;

	const toData = (point: number[]): [number, number] => [
		xRange.min + (point[0] - 0.5) * xStep,
		yRange.min + (point[1] - 0.5) * yStep
	];

	const levels: ContourLevel[] = [];

	for (const shape of shapes) {
		const rings: ContourRing[] = [];

		for (const polygon of shape.coordinates) {
			for (const ring of polygon) {
				if (ring.length < 3) continue;
				rings.push(ring.map(toData));
			}
		}

		if (rings.length > 0) levels.push({ value: shape.value, rings });
	}

	if (levels.length === 0) return null;

	return { levels, hull: hullOf(series), range };
}

/**
 * Inverse distance weighted gridding.
 *
 * The points go into bins the size of one cell first. A cell then reads only the
 * bins inside its search radius, instead of every point. The weight is `1 / d²`,
 * which is the usual choice: it falls off fast enough that a near point
 * dominates, and it needs no square root.
 */
function gridSeries(
	series: PlotSeries,
	xRange: PlotRange,
	yRange: PlotRange,
	resolution: number
): Float64Array | null {
	const z = series.z;
	if (!z) return null;

	const xSpan = xRange.max - xRange.min;
	const ySpan = yRange.max - yRange.min;
	if (!(xSpan > 0) || !(ySpan > 0)) return null;

	// Bin index: one bucket per cell, holding the indices of the points in it.
	const bins = new Map<number, number[]>();
	const binOf = (column: number, row: number): number => row * resolution + column;

	const columnOf = (x: number): number => {
		const column = Math.floor(((x - xRange.min) / xSpan) * resolution);
		return Math.min(Math.max(column, 0), resolution - 1);
	};

	const rowOf = (y: number): number => {
		const row = Math.floor(((y - yRange.min) / ySpan) * resolution);
		return Math.min(Math.max(row, 0), resolution - 1);
	};

	for (let i = 0; i < series.x.length; i++) {
		const key = binOf(columnOf(series.x[i]), rowOf(series.y[i]));
		const bucket = bins.get(key);

		if (bucket) {
			bucket.push(i);
		} else {
			bins.set(key, [i]);
		}
	}

	const grid = new Float64Array(resolution * resolution);
	const xStep = xSpan / resolution;
	const yStep = ySpan / resolution;

	// Distances are compared in cell units, so one axis cannot dominate the other
	// because its numbers are larger.
	for (let row = 0; row < resolution; row++) {
		const cellY = yRange.min + (row + 0.5) * yStep;

		for (let column = 0; column < resolution; column++) {
			const cellX = xRange.min + (column + 0.5) * xStep;

			let radius = SEARCH_CELLS;
			let weighted = 0;
			let weight = 0;

			// Widen the search until it finds a point. A cell far from the data
			// still gets a value, and the clip to the hull hides it.
			while (weight === 0 && radius <= resolution) {
				weighted = 0;
				weight = 0;

				const minRow = Math.max(row - radius, 0);
				const maxRow = Math.min(row + radius, resolution - 1);
				const minColumn = Math.max(column - radius, 0);
				const maxColumn = Math.min(column + radius, resolution - 1);

				for (let r = minRow; r <= maxRow; r++) {
					for (let c = minColumn; c <= maxColumn; c++) {
						const bucket = bins.get(binOf(c, r));
						if (!bucket) continue;

						for (const index of bucket) {
							const dx = (series.x[index] - cellX) / xStep;
							const dy = (series.y[index] - cellY) / yStep;
							const distanceSquared = dx * dx + dy * dy;

							// A point on the cell centre decides it alone.
							if (distanceSquared < 1e-9) {
								weighted = z[index];
								weight = 1;
								r = maxRow;
								c = maxColumn;
								break;
							}

							const w = 1 / distanceSquared;
							weighted += z[index] * w;
							weight += w;
						}
					}
				}

				radius *= 2;
			}

			if (weight > 0) grid[row * resolution + column] = weighted / weight;
		}
	}

	return grid;
}

/** The convex hull of the points, as a closed ring. Empty when there is none. */
function hullOf(series: PlotSeries): ContourRing {
	const points: Array<[number, number]> = new Array(series.x.length);

	for (let i = 0; i < series.x.length; i++) {
		points[i] = [series.x[i], series.y[i]];
	}

	const hull = polygonHull(points);
	if (!hull) return [];

	return hull as ContourRing;
}
