/** Shared gridding for contour lines and interpolated surfaces. */
import { polygonHull } from 'd3-polygon';
import type { PlotRange, PlotSeries } from './plot-data';

/** A closed ring of `[x, y]` points, in data coordinates. */
export type ContourRing = Array<[number, number]>;

export interface GriddedSeries {
	values: Float64Array;
	xResolution: number;
	yResolution: number;
	xRange: PlotRange;
	yRange: PlotRange;
	hull: ContourRing;
}

/** A grid larger than this is refused. It costs more than it shows. */
export const MAX_GRID_RESOLUTION = 500;

/**
 * How far a cell searches for points, as a count of cells.
 */
const SEARCH_CELLS = 2;

/**
 * Inverse distance weighted gridding.
 *
 * The points go into bins the size of one cell first. A cell then reads only the
 * bins inside its search radius, instead of every point.
 */
export function gridSeries(
	series: PlotSeries,
	xRange: PlotRange,
	yRange: PlotRange,
	xResolution: number,
	yResolution: number
): GriddedSeries | null {
	const z = series.z;
	if (!z) return null;

	const xSpan = xRange.max - xRange.min;
	const ySpan = yRange.max - yRange.min;
	if (!(xSpan > 0) || !(ySpan > 0)) return null;

	const bins = new Map<number, number[]>();
	const binOf = (column: number, row: number): number => row * xResolution + column;

	const columnOf = (x: number): number => {
		const column = Math.floor(((x - xRange.min) / xSpan) * xResolution);
		return Math.min(Math.max(column, 0), xResolution - 1);
	};

	const rowOf = (y: number): number => {
		const row = Math.floor(((y - yRange.min) / ySpan) * yResolution);
		return Math.min(Math.max(row, 0), yResolution - 1);
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

	const values = new Float64Array(xResolution * yResolution);
	const xStep = xSpan / xResolution;
	const yStep = ySpan / yResolution;

	for (let row = 0; row < yResolution; row++) {
		const cellY = yRange.min + (row + 0.5) * yStep;

		for (let column = 0; column < xResolution; column++) {
			const cellX = xRange.min + (column + 0.5) * xStep;

			let radius = SEARCH_CELLS;
			let weighted = 0;
			let weight = 0;

			while (weight === 0 && radius <= Math.max(xResolution, yResolution)) {
				weighted = 0;
				weight = 0;

				const minRow = Math.max(row - radius, 0);
				const maxRow = Math.min(row + radius, yResolution - 1);
				const minColumn = Math.max(column - radius, 0);
				const maxColumn = Math.min(column + radius, xResolution - 1);

				for (let r = minRow; r <= maxRow; r++) {
					for (let c = minColumn; c <= maxColumn; c++) {
						const bucket = bins.get(binOf(c, r));
						if (!bucket) continue;

						for (const index of bucket) {
							const dx = (series.x[index] - cellX) / xStep;
							const dy = (series.y[index] - cellY) / yStep;
							const distanceSquared = dx * dx + dy * dy;

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

			if (weight > 0) values[row * xResolution + column] = weighted / weight;
		}
	}

	return { values, xResolution, yResolution, xRange, yRange, hull: hullOf(series) };
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
