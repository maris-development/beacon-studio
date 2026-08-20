import { colorScalePosition } from '@/colors/color-scale';
import type { PlotConfig } from './plot-config';
import { resolveRange, type PlotRange, type PlotSeries } from './plot-data';
import { gridSeries, MAX_GRID_RESOLUTION, type ContourRing } from './grid';

export interface InterpolationResult {
	values: Float64Array;
	resolution: number;
	xRange: PlotRange;
	yRange: PlotRange;
	hull: ContourRing;
	/** The Z range that maps the interpolated grid to colours. */
	range: PlotRange;
	bandCount: number;
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

	const resolution = Math.min(
		Math.max(Math.round(plot.interpolation.gridResolution), 10),
		MAX_GRID_RESOLUTION
	);
	const gridded = gridSeries(series, xRange, yRange, resolution);
	if (!gridded) return null;

	return {
		...gridded,
		values: gaussianFilter2d(gridded.values, resolution, plot.interpolation.gaussianSigma),
		range,
		bandCount: Math.min(Math.max(Math.round(plot.interpolation.bandCount), 2), 100)
	};
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

function gaussianFilter2d(values: Float64Array, size: number, sigma: number): Float64Array {
	if (!(sigma > 0)) return new Float64Array(values);

	const kernel = gaussianKernel(sigma);
	const temp = new Float64Array(values.length);
	const output = new Float64Array(values.length);

	for (let row = 0; row < size; row++) {
		for (let column = 0; column < size; column++) {
			let sum = 0;

			for (let k = 0; k < kernel.length; k++) {
				const offset = k - Math.floor(kernel.length / 2);
				const sourceColumn = reflectIndex(column + offset, size);
				sum += values[row * size + sourceColumn] * kernel[k];
			}

			temp[row * size + column] = sum;
		}
	}

	for (let row = 0; row < size; row++) {
		for (let column = 0; column < size; column++) {
			let sum = 0;

			for (let k = 0; k < kernel.length; k++) {
				const offset = k - Math.floor(kernel.length / 2);
				const sourceRow = reflectIndex(row + offset, size);
				sum += temp[sourceRow * size + column] * kernel[k];
			}

			output[row * size + column] = sum;
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
