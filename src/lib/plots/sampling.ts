/**
 * Sampling — the step that keeps a dense plot drawable.
 *
 * A scatter draws one mark per row. Above a few hundred thousand rows that work
 * makes the page unusable, and the picture is solid colour anyway. This module
 * keeps a uniform random sample of the rows and drops the rest.
 *
 * The sample always holds the rows at the ends of the X and Y axes. uPlot takes
 * its axis range from the arrays it gets, not from the stored range of the
 * series, so without those rows the plot would draw a smaller box than the data
 * covers. With them the axes match the full data exactly.
 *
 * The seed is fixed, and every plot shares it. Therefore one result draws the
 * same points on every rebuild, on every reload and in the PNG export.
 *
 * The cap comes from the `sampleAfterRows` setting. The caller reads it, so
 * these functions stay pure.
 */
import type { PlotSeries } from './plot-data';

/** The seed of the shuffle. One constant, so a plot never changes under the user. */
const SAMPLE_SEED = 1;

/**
 * A small seeded PRNG (xorshift32).
 *
 * `Math.random` has no seed, so it would pick new points on every rebuild. A
 * resize or a colour edit would then move every point of the plot.
 */
function makeRandom(seed: number): () => number {
	let state = seed >>> 0 || 1;

	return () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};
}

/**
 * The rows that hold the ends of the X and Y axes.
 *
 * At most four, and fewer when one row holds two ends. The series is never
 * empty here: {@link buildPlotSeries} fails before it returns an empty one.
 */
function extremeRows(series: PlotSeries): number[] {
	const { x, y } = series;

	let xMin = 0;
	let xMax = 0;
	let yMin = 0;
	let yMax = 0;

	for (let i = 1; i < x.length; i++) {
		if (x[i] < x[xMin]) xMin = i;
		if (x[i] > x[xMax]) xMax = i;
		if (y[i] < y[yMin]) yMin = i;
		if (y[i] > y[yMax]) yMax = i;
	}

	return [...new Set([xMin, xMax, yMin, yMax])];
}

/**
 * Pick at most `maxPoints` rows out of a series, at random.
 *
 * Returns the same object when the series already fits. The caller can use the
 * identity of the result to know whether a sample happened.
 *
 * The X, Y and Z ranges of the source carry over untouched. They come from the
 * full data, and the colour bar reads `zRange`, so the palette does not move.
 */
export function samplePlotSeries(series: PlotSeries, maxPoints: number): PlotSeries {
	const total = series.x.length;
	if (!Number.isFinite(maxPoints) || total <= maxPoints) return series;

	const keep = Math.max(1, Math.floor(maxPoints));

	const order = new Uint32Array(total);
	for (let i = 0; i < total; i++) order[i] = i;

	// Put the extreme rows in the first slots. The shuffle below starts after
	// them, so the sample always holds the true ends of both axes.
	let head = 0;

	for (const row of extremeRows(series)) {
		if (head >= keep) break;

		// `order[i]` still holds `i` for every slot the loop has not touched. A
		// row that an earlier swap moved needs a search instead.
		let slot = row;
		if (order[slot] !== row) slot = order.indexOf(row, head);

		// Below `head` the row is already in the sample, and `-1` means the same.
		if (slot < head) continue;

		const swap = order[head];
		order[head] = order[slot];
		order[slot] = swap;
		head++;
	}

	// Partial Fisher-Yates. It picks the rest uniformly and without replacement,
	// in one pass over the slots that the sample keeps.
	const random = makeRandom(SAMPLE_SEED);

	for (let i = head; i < keep; i++) {
		const j = i + Math.floor(random() * (total - i));
		const swap = order[i];
		order[i] = order[j];
		order[j] = swap;
	}

	// Ascending order keeps the draw order of the plot stable, and it reads the
	// source arrays forward instead of jumping over them.
	const picked = order.slice(0, keep).sort();

	const x = new Float64Array(keep);
	const y = new Float64Array(keep);

	let z: Float64Array | null = null;
	if (series.z) z = new Float64Array(keep);

	for (let i = 0; i < keep; i++) {
		const source = picked[i];
		x[i] = series.x[source];
		y[i] = series.y[source];
		if (z && series.z) z[i] = series.z[source];
	}

	return { ...series, x, y, z, sampledFrom: total };
}
