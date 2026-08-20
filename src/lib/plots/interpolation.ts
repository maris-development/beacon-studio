import { Delaunay } from 'd3-delaunay';
import { colorScalePosition } from '@/colors/color-scale';
import type { PlotConfig } from './plot-config';
import { resolveRange, type PlotRange, type PlotSeries } from './plot-data';
import { gridSeries, MAX_GRID_RESOLUTION, type ContourRing, type GriddedSeries } from './grid';

export interface InterpolationResult {
	values: Float64Array;
	xResolution: number;
	yResolution: number;
	xRange: PlotRange;
	yRange: PlotRange;
	hull: ContourRing;
	/** The Z range that maps the interpolated grid to colours. */
	range: PlotRange;
	bandCount: number;
	renderMode: 'banded' | 'continuous';
}

const KERNEL_TRUNCATE = 4;

export function buildInterpolationSurface(
	series: PlotSeries,
	plot: PlotConfig,
	xRange: PlotRange,
	yRange: PlotRange
): InterpolationResult | null {
	if (!series.z || !series.zRange) return null;
	if (series.x.length < 3) return null;

	const clipRange = percentileRange(
		series.z,
		plot.interpolation.percentileMin,
		plot.interpolation.percentileMax
	);
	if (!clipRange) return null;

	const range = resolveRange(clipRange, plot.z?.min ?? null, plot.z?.max ?? null);
	if (!(range.max > range.min)) return null;

	const scale = plot.z?.scale ?? 'linear';
	if (scale !== 'linear') {
		const minPosition = colorScalePosition(range.min, range.min, range.max, scale);
		const maxPosition = colorScalePosition(range.max, range.min, range.max, scale);
		if (!Number.isFinite(minPosition) || !Number.isFinite(maxPosition)) return null;
	}

	const xResolution = Math.min(
		Math.max(Math.round(plot.interpolation.xGridResolution), 10),
		MAX_GRID_RESOLUTION
	);
	const yResolution = Math.min(
		Math.max(Math.round(plot.interpolation.yGridResolution), 10),
		MAX_GRID_RESOLUTION
	);

	let gridded: GriddedSeries | null = null;
	if (plot.interpolation.method === 'delaunay-barycentric') {
		gridded = delaunayGridSeries(series, xRange, yRange, xResolution, yResolution);
	} else {
		gridded = gridSeries(series, xRange, yRange, xResolution, yResolution);
	}

	if (!gridded) return null;

	let values = gridded.values;
	if (plot.interpolation.method === 'gaussian') {
		values = gaussianFilter2d(
			gridded.values,
			xResolution,
			yResolution,
			plot.interpolation.gaussianSigma
		);
	}

	return {
		...gridded,
		values,
		range,
		bandCount: Math.min(Math.max(Math.round(plot.interpolation.bandCount), 2), 100),
		renderMode: plot.interpolation.method === 'delaunay-barycentric' ? 'continuous' : 'banded'
	};
}

interface DelaunayPoint {
	x: number;
	y: number;
	z: number;
}

function delaunayGridSeries(
	series: PlotSeries,
	xRange: PlotRange,
	yRange: PlotRange,
	xResolution: number,
	yResolution: number
): GriddedSeries | null {
	const points = uniqueDelaunayPoints(series);
	if (points.length < 3) return null;

	const xSpan = xRange.max - xRange.min;
	const ySpan = yRange.max - yRange.min;
	if (!(xSpan > 0) || !(ySpan > 0)) return null;

	const delaunay = Delaunay.from(
		points,
		(point) => point.x,
		(point) => point.y
	);
	if (delaunay.hull.length < 3 || delaunay.triangles.length < 3) return null;

	const values = new Float64Array(xResolution * yResolution);
	values.fill(Number.NaN);
	const xStep = xSpan / xResolution;
	const yStep = ySpan / yResolution;
	let triangle = 0;

	for (let row = 0; row < yResolution; row++) {
		const cellY = yRange.min + (row + 0.5) * yStep;

		for (let column = 0; column < xResolution; column++) {
			const cellX = xRange.min + (column + 0.5) * xStep;
			const located = locateBarycentricValue(
				cellX,
				cellY,
				points,
				delaunay.triangles,
				delaunay.halfedges,
				triangle
			);

			if (located) {
				triangle = located.triangle;
				values[row * xResolution + column] = located.value;
			}
		}
	}

	return {
		values,
		xResolution,
		yResolution,
		xRange,
		yRange,
		hull: delaunayHull(points, delaunay.hull)
	};
}

function uniqueDelaunayPoints(series: PlotSeries): DelaunayPoint[] {
	const z = series.z;
	if (!z) return [];

	const byCoordinate = new Map<string, { x: number; y: number; zTotal: number; count: number }>();

	for (let i = 0; i < series.x.length; i++) {
		const x = series.x[i];
		const y = series.y[i];
		const value = z[i];
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) continue;

		const key = `${x}\u0000${y}`;
		const existing = byCoordinate.get(key);
		if (existing) {
			existing.zTotal += value;
			existing.count += 1;
		} else {
			byCoordinate.set(key, { x, y, zTotal: value, count: 1 });
		}
	}

	const points: DelaunayPoint[] = [];
	for (const point of byCoordinate.values()) {
		points.push({ x: point.x, y: point.y, z: point.zTotal / point.count });
	}

	return points;
}
interface LocatedBarycentricValue {
	triangle: number;
	value: number;
}

function locateBarycentricValue(
	x: number,
	y: number,
	points: DelaunayPoint[],
	triangles: ArrayLike<number>,
	halfedges: ArrayLike<number>,
	startTriangle: number
): LocatedBarycentricValue | null {
	if (triangles.length < 3) return null;

	let triangle = startTriangle - (startTriangle % 3);
	if (triangle < 0 || triangle >= triangles.length) triangle = 0;

	const seen = new Set<number>();
	while (!seen.has(triangle)) {
		seen.add(triangle);
		const result = barycentricWeights(x, y, points, triangles, triangle);
		if (!result) return null;

		const epsilon = -1e-9;
		if (result.weightA >= epsilon && result.weightB >= epsilon && result.weightC >= epsilon) {
			return {
				triangle,
				value:
					result.weightA * result.a.z + result.weightB * result.b.z + result.weightC * result.c.z
			};
		}

		const edgeOffset = mostNegativeWeightEdge(result.weightA, result.weightB, result.weightC);
		const next = halfedges[triangle + edgeOffset];
		if (next < 0) return null;
		triangle = next - (next % 3);
	}

	return null;
}

interface BarycentricWeights {
	a: DelaunayPoint;
	b: DelaunayPoint;
	c: DelaunayPoint;
	weightA: number;
	weightB: number;
	weightC: number;
}

function barycentricWeights(
	x: number,
	y: number,
	points: DelaunayPoint[],
	triangles: ArrayLike<number>,
	triangle: number
): BarycentricWeights | null {
	const a = points[triangles[triangle]];
	const b = points[triangles[triangle + 1]];
	const c = points[triangles[triangle + 2]];
	if (!a || !b || !c) return null;

	const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
	if (Math.abs(denominator) < 1e-12) return null;

	const weightA = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
	const weightB = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
	const weightC = 1 - weightA - weightB;
	return { a, b, c, weightA, weightB, weightC };
}

function mostNegativeWeightEdge(weightA: number, weightB: number, weightC: number): number {
	let edgeOffset = 1;
	let value = weightA;

	if (weightB < value) {
		edgeOffset = 2;
		value = weightB;
	}

	if (weightC < value) edgeOffset = 0;
	return edgeOffset;
}

function delaunayHull(points: DelaunayPoint[], hull: ArrayLike<number>): ContourRing {
	const ring: ContourRing = [];

	for (let i = 0; i < hull.length; i++) {
		const point = points[hull[i]];
		if (point) ring.push([point.x, point.y]);
	}

	if (ring.length > 0) ring.push(ring[0]);
	return ring;
}

function percentileRange(
	values: Float64Array,
	minPercentile: number,
	maxPercentile: number
): PlotRange | null {
	const finite: number[] = [];

	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (Number.isFinite(value)) finite.push(value);
	}

	if (finite.length === 0) return null;
	finite.sort((a, b) => a - b);

	const min = percentile(finite, minPercentile);
	const max = percentile(finite, maxPercentile);
	if (!(max > min)) return null;

	return { min, max };
}

function percentile(sorted: number[], percentileValue: number): number {
	const position = (Math.min(Math.max(percentileValue, 0), 100) / 100) * (sorted.length - 1);
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower];

	const weight = position - lower;
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function gaussianFilter2d(
	values: Float64Array,
	width: number,
	height: number,
	sigma: number
): Float64Array {
	if (!(sigma > 0)) return new Float64Array(values);

	const kernel = gaussianKernel(sigma);
	const temp = new Float64Array(values.length);
	const output = new Float64Array(values.length);

	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			let sum = 0;

			for (let k = 0; k < kernel.length; k++) {
				const offset = k - Math.floor(kernel.length / 2);
				const sourceColumn = reflectIndex(column + offset, width);
				sum += values[row * width + sourceColumn] * kernel[k];
			}

			temp[row * width + column] = sum;
		}
	}

	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			let sum = 0;

			for (let k = 0; k < kernel.length; k++) {
				const offset = k - Math.floor(kernel.length / 2);
				const sourceRow = reflectIndex(row + offset, height);
				sum += temp[sourceRow * width + column] * kernel[k];
			}

			output[row * width + column] = sum;
		}
	}

	return output;
}

function gaussianKernel(sigma: number): Float64Array {
	const radius = Math.max(1, Math.ceil(KERNEL_TRUNCATE * sigma));
	const kernel = new Float64Array(radius * 2 + 1);
	const twoSigmaSquared = 2 * sigma * sigma;
	let total = 0;

	for (let i = -radius; i <= radius; i++) {
		const value = Math.exp(-(i * i) / twoSigmaSquared);
		kernel[i + radius] = value;
		total += value;
	}

	for (let i = 0; i < kernel.length; i++) {
		kernel[i] /= total;
	}

	return kernel;
}

function reflectIndex(index: number, length: number): number {
	if (length <= 1) return 0;

	let reflected = index;
	while (reflected < 0 || reflected >= length) {
		if (reflected < 0) {
			reflected = -reflected - 1;
		} else {
			reflected = 2 * length - reflected - 1;
		}
	}

	return reflected;
}
