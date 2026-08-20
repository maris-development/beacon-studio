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
import type { PlotRange, PlotSeries } from './plot-data';
import { resolveRange } from './plot-data';
import type { PlotConfig } from './plot-config';
import { colorScaleValue } from '@/colors/color-scale';
import { gridSeries, MAX_GRID_RESOLUTION, type ContourRing } from './grid';

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
		MAX_GRID_RESOLUTION
	);
	const levelCount = Math.min(Math.max(Math.round(plot.contour.levelCount), 2), 50);

	const grid = gridSeries(series, xRange, yRange, resolution);
	if (!grid) return null;

	// The thresholds sit between the ends, and not on them: a contour exactly at
	// the minimum or the maximum encloses nothing or everything.
	const thresholds: number[] = [];

	for (let i = 1; i <= levelCount; i++) {
		thresholds.push(
			colorScaleValue(i / (levelCount + 1), range.min, range.max, plot.z?.scale ?? 'linear')
		);
	}

	const generator = d3Contours().size([resolution, resolution]).thresholds(thresholds);
	const shapes = generator(Array.from(grid.values));

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

	return { levels, hull: grid.hull, range };
}
