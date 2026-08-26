/**
 * PlotData — the step from an arrow result to the numbers that a plot draws.
 *
 * The renderer must not read arrow. It gets three plain `Float64Array`s and the
 * range of each one. Every concern of the source data lives here: which columns
 * can go on an axis, how a timestamp becomes a number, which rows to drop, and
 * where the X values of a cross section come from.
 *
 * Rows drop when a value on a used axis is null or not finite. A plot cannot
 * place such a row, and one gap must not shift the other axes. Therefore the
 * three output arrays always have the same length, and index `i` is one row.
 *
 * These functions are pure. They take a table and a config, and they return
 * data. No svelte, no canvas.
 */
import * as ApacheArrow from 'apache-arrow';
import { makeAlongLineProjection } from '@/geo/along-line';
import type { SpatialSelection } from '@/geo/spatial-selection';
import { detectCoordinateColumns } from '@/geo/coordinate-columns';
import { MAX_LINE_GROUPS, usesZColumn, type PlotConfig } from './plot-config';

/** How the values of a column are read, and how a tick label is formatted. */
export type PlotColumnKind = 'number' | 'timestamp';

export interface PlotColumn {
	name: string;
	kind: PlotColumnKind;
}

export interface PlotRange {
	min: number;
	max: number;
}

/**
 * One stroke of a line plot: the rows from `start` up to, but not including,
 * `end`. The rows of a group are next to each other in the arrays, and they are
 * in the order that the stroke runs.
 */
export interface PlotGroup {
	/** The value of the group column, as text. This is the legend entry. */
	key: string;
	start: number;
	end: number;
}

export interface PlotSeries {
	/** One entry per kept row. The three arrays share their indices. */
	x: Float64Array;
	y: Float64Array;
	/** Null when the plot has no Z axis. */
	z: Float64Array | null;
	xRange: PlotRange;
	yRange: PlotRange;
	/** Null when the plot has no Z axis. */
	zRange: PlotRange | null;
	xKind: PlotColumnKind;
	yKind: PlotColumnKind;
	zKind: PlotColumnKind | null;
	/** Rows that had no usable value on one of the used axes. */
	skippedRows: number;
	/**
	 * The strokes of a line plot, in draw order. Null for every other type, and
	 * for a line plot that joins all its rows into one stroke.
	 */
	groups: PlotGroup[] | null;
	/** Groups past {@link MAX_LINE_GROUPS} that the plot does not draw. */
	droppedGroups: number;
	/** The width of one bar of a histogram, in X units. Null for every other type. */
	binWidth: number | null;
	/**
	 * The row count before sampling. Null when the plot draws every row.
	 * See `sampling.ts`.
	 */
	sampledFrom: number | null;
}

export type PlotDataResult =
	| { ok: true; series: PlotSeries }
	/** The plot cannot draw. `message` is the reason for the user. */
	| { ok: false; message: string };

/**
 * The counts under the plot title.
 *
 * Two states:
 *
 *     N = 10,000,000
 *     N = 10,000,000 · 500,000 shown (5% sample)
 *
 * `N` counts the rows that the plot draws, not the rows that the query returned:
 * a row without a value on every used axis draws nothing. A histogram needs the
 * row count of `rowCount` and `skippedRows`, because its own arrays hold one
 * entry per bin, not one per row.
 *
 * `series` is the full data and `display` is what the canvas gets. The two are
 * the same object while the plot draws every point.
 */
export function formatSeriesSubtitle(
	rowCount: number,
	series: PlotSeries,
	display: PlotSeries
): string {
	const total = Math.max(0, rowCount - series.skippedRows);
	const drawn = `N = ${total.toLocaleString()}`;

	if (display.sampledFrom === null) return drawn;

	const shown = display.x.length;
	const percent = (shown / display.sampledFrom) * 100;

	// A whole number reads better, but a hard sample of a huge result lands below
	// one percent, where rounding would show `0%`.
	let percentText = `${Math.round(percent)}`;
	if (percent < 1) percentText = `${Number(percent.toFixed(1))}`;

	return `${drawn} · ${shown.toLocaleString()} shown (${percentText}% sample)`;
}

/** What a cross section plot needs beyond the table: the line that the user drew. */
export interface PlotDataContext {
	/** The spatial filter of the query. A cross section plot reads its line. */
	selection?: SpatialSelection | null;
}

// -- columns -----------------------------------------------------------------

function kindOfType(type: ApacheArrow.DataType): PlotColumnKind | null {
	switch (type.typeId) {
		case ApacheArrow.Type.Int:
		case ApacheArrow.Type.Float:
			return 'number';

		case ApacheArrow.Type.Timestamp:
		case ApacheArrow.Type.Date:
			return 'timestamp';

		default:
			return null;
	}
}

/**
 * The columns that a plot can put on an axis.
 *
 * A column of text, of booleans or of a nested type cannot carry a position or a
 * colour, so it never reaches the selectors. The geometry column that the map
 * adds is nested, so this rule removes it too. A decimal column is left out as
 * well: arrow returns it as a big number object, which has no place on a canvas.
 */
export function plottableColumns(table: ApacheArrow.Table | null | undefined): PlotColumn[] {
	if (!table) return [];

	const columns: PlotColumn[] = [];

	for (const field of table.schema.fields) {
		const kind = kindOfType(field.type);
		if (kind) columns.push({ name: field.name, kind });
	}

	return columns;
}

/**
 * The columns that can split a line plot into groups.
 *
 * This list is wider than {@link plottableColumns}. A group only needs a value
 * that reads as a label, and a station name or a cruise code is text. A nested
 * type is still out: the geometry column has no readable label.
 */
export function groupableColumns(table: ApacheArrow.Table | null | undefined): PlotColumn[] {
	if (!table) return [];

	const columns: PlotColumn[] = [];

	for (const field of table.schema.fields) {
		const kind = kindOfType(field.type);

		if (kind) {
			columns.push({ name: field.name, kind });
			continue;
		}

		switch (field.type.typeId) {
			case ApacheArrow.Type.Utf8:
			case ApacheArrow.Type.LargeUtf8:
			case ApacheArrow.Type.Bool:
			case ApacheArrow.Type.Dictionary:
				columns.push({ name: field.name, kind: 'number' });
				break;
		}
	}

	return columns;
}

/** The label of every row in one column. A null becomes {@link NO_GROUP_KEY}. */
export const NO_GROUP_KEY = '(no value)';

export function readGroupKeys(table: ApacheArrow.Table, name: string): string[] | null {
	const vector = table.getChild(name);
	if (!vector) return null;

	const rows = table.numRows;
	const keys = new Array<string>(rows);

	for (let i = 0; i < rows; i++) {
		const value = vector.get(i);

		if (value === null || value === undefined) {
			keys[i] = NO_GROUP_KEY;
			continue;
		}

		keys[i] = String(value);
	}

	return keys;
}

/**
 * Read one column as doubles. A null, and a value that is not a number, becomes
 * `NaN`. The caller drops those rows.
 *
 * A timestamp arrives as a `bigint` of milliseconds. `Number` holds that exactly
 * for every date this app can meet, so the conversion is safe.
 *
 * Returns null when the table has no such column.
 */
export function readNumericColumn(
	table: ApacheArrow.Table,
	name: string
): { values: Float64Array; kind: PlotColumnKind } | null {
	const vector = table.getChild(name);
	if (!vector) return null;

	const kind = kindOfType(vector.type);
	if (!kind) return null;

	const rows = table.numRows;
	const values = new Float64Array(rows);

	// A column with no nulls can go through the typed array in one step. That is
	// the common case, and it avoids one `get()` call per row.
	if (vector.nullCount === 0 && vector.data.length === 1) {
		const raw = vector.toArray();

		for (let i = 0; i < rows; i++) {
			values[i] = Number(raw[i]);
		}

		return { values, kind };
	}

	for (let i = 0; i < rows; i++) {
		const value = vector.get(i);

		if (value === null || value === undefined) {
			values[i] = NaN;
			continue;
		}

		values[i] = Number(value);
	}

	return { values, kind };
}

// -- cross section -----------------------------------------------------------

/**
 * The distance of every row along the drawn cross section line, in kilometres.
 *
 * The line comes from the spatial filter of the query. The coordinates come from
 * the latitude and longitude columns of the result, which
 * {@link detectCoordinateColumns} finds by name.
 *
 * The message on failure names what is missing. A cross section plot fails for
 * three separate reasons, and the user fixes each one somewhere else: on the
 * map, in the query, or in the source data.
 */
function crossSectionDistances(
	table: ApacheArrow.Table,
	selection: SpatialSelection | null | undefined
): { values: Float64Array } | { message: string } {
	if (!selection || selection.mode !== 'cross-section' || !selection.line) {
		return {
			message:
				'This plot needs a cross section. Draw one on the map viewer, then apply it to the query.'
		};
	}

	const projection = makeAlongLineProjection(selection.line);
	if (!projection) {
		return { message: 'The cross section line has less than two points.' };
	}

	const names = table.schema.fields.map((field) => field.name);
	const detection = detectCoordinateColumns(names);

	if (!detection.latitude || !detection.longitude) {
		return { message: 'The result has no latitude and longitude columns, so it has no distance.' };
	}

	const latitude = readNumericColumn(table, detection.latitude.name);
	const longitude = readNumericColumn(table, detection.longitude.name);

	if (!latitude || !longitude) {
		return { message: 'The latitude and longitude columns hold no numbers.' };
	}

	const rows = table.numRows;
	const values = new Float64Array(rows);

	for (let i = 0; i < rows; i++) {
		values[i] = projection.distanceKm(longitude.values[i], latitude.values[i]);
	}

	return { values };
}

/** The axis title of the distance axis of a cross section. */
export const CROSS_SECTION_AXIS_LABEL = 'Distance along section (km)';

// -- series ------------------------------------------------------------------

function emptyRange(): PlotRange {
	return { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
}

/** A range that no value reached is not usable. Give it a width of one. */
function settleRange(range: PlotRange): PlotRange {
	if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
		return { min: 0, max: 1 };
	}

	if (range.min === range.max) {
		return { min: range.min - 0.5, max: range.max + 0.5 };
	}

	return range;
}

// -- histogram ---------------------------------------------------------------

/** The Y axis title of a histogram. The Y axis holds no column. */
export const HISTOGRAM_AXIS_LABEL = 'Count';

/**
 * Count the rows of one column into bins.
 *
 * The bins span the X range that the user pinned, and the extent of the data
 * for the ends they left on auto. A pinned range therefore drops the rows
 * outside it rather than squeezing them into the end bins, which would put a
 * false spike there.
 *
 * The output is the same {@link PlotSeries} as every other type: X holds the
 * centre of each bin and Y holds its count. `binWidth` tells the renderer how
 * wide to draw a bar.
 */
function buildHistogramSeries(table: ApacheArrow.Table, plot: PlotConfig): PlotDataResult {
	if (!plot.x.column) {
		return { ok: false, message: 'Select a column to count.' };
	}

	const column = readNumericColumn(table, plot.x.column);
	if (!column) {
		return { ok: false, message: `The result has no numeric column "${plot.x.column}".` };
	}

	const rows = table.numRows;
	const values = column.values;

	const dataRange = emptyRange();
	let usable = 0;

	for (let i = 0; i < rows; i++) {
		const value = values[i];
		if (!Number.isFinite(value)) continue;

		if (value < dataRange.min) dataRange.min = value;
		if (value > dataRange.max) dataRange.max = value;
		usable++;
	}

	if (usable === 0) {
		return { ok: false, message: 'The column holds no numbers, so there is nothing to count.' };
	}

	const settled = settleRange(dataRange);
	const low = plot.x.min ?? settled.min;
	const high = plot.x.max ?? settled.max;

	if (!(high > low)) {
		return { ok: false, message: 'The X range is empty, so the bins have no width.' };
	}

	const binCount = Math.max(2, Math.round(plot.histogram.binCount));
	const binWidth = (high - low) / binCount;

	const centres = new Float64Array(binCount);
	const counts = new Float64Array(binCount);

	for (let bin = 0; bin < binCount; bin++) {
		centres[bin] = low + binWidth * (bin + 0.5);
	}

	let counted = 0;

	for (let i = 0; i < rows; i++) {
		const value = values[i];
		if (!Number.isFinite(value) || value < low || value > high) continue;

		// The top edge belongs to the last bin. Without this the maximum value
		// alone would land in a bin past the end of the array.
		let bin = Math.floor((value - low) / binWidth);
		if (bin >= binCount) bin = binCount - 1;

		counts[bin]++;
		counted++;
	}

	let tallest = 0;
	for (let bin = 0; bin < binCount; bin++) {
		if (counts[bin] > tallest) tallest = counts[bin];
	}

	return {
		ok: true,
		series: {
			x: centres,
			y: counts,
			z: null,
			xRange: { min: low, max: high },
			// A bar grows from zero. An auto-ranged floor would cut every bar off.
			yRange: { min: 0, max: tallest || 1 },
			zRange: null,
			xKind: column.kind,
			yKind: 'number',
			zKind: null,
			skippedRows: rows - counted,
			groups: null,
			droppedGroups: 0,
			binWidth,
			sampledFrom: null
		}
	};
}

// -- line ordering -----------------------------------------------------------

/**
 * Put the rows of a line plot into stroke order.
 *
 * A stroke joins its rows in the order of the arrays, so the order is the whole
 * picture. The rows sort by group first, which makes every group one contiguous
 * run, and then along the chosen axis, which makes the stroke run one way.
 *
 * `groupIndex` holds the group of every kept row, or null when the plot draws a
 * single stroke. A group past {@link MAX_LINE_GROUPS} is dropped here: forty
 * strokes is already more than a reader can follow, and a group column with one
 * value per row would otherwise draw a stroke per row.
 */
function orderLineSeries(
	series: PlotSeries,
	groupIndex: Int32Array | null,
	groupNames: string[],
	sortBy: 'x' | 'y'
): PlotSeries {
	const count = series.x.length;

	let primary = series.x;
	if (sortBy === 'y') primary = series.y;

	const kept: number[] = [];

	for (let i = 0; i < count; i++) {
		if (groupIndex && groupIndex[i] >= MAX_LINE_GROUPS) continue;
		kept.push(i);
	}

	kept.sort((a, b) => {
		if (groupIndex) {
			const byGroup = groupIndex[a] - groupIndex[b];
			if (byGroup !== 0) return byGroup;
		}

		return primary[a] - primary[b];
	});

	const total = kept.length;
	const x = new Float64Array(total);
	const y = new Float64Array(total);

	let z: Float64Array | null = null;
	if (series.z) z = new Float64Array(total);

	for (let i = 0; i < total; i++) {
		const source = kept[i];
		x[i] = series.x[source];
		y[i] = series.y[source];
		if (z && series.z) z[i] = series.z[source];
	}

	let groups: PlotGroup[] | null = null;

	if (groupIndex) {
		groups = [];
		let start = 0;

		for (let i = 1; i <= total; i++) {
			const ended = i === total || groupIndex[kept[i]] !== groupIndex[kept[start]];
			if (!ended) continue;

			groups.push({ key: groupNames[groupIndex[kept[start]]], start, end: i });
			start = i;
		}
	}

	let droppedGroups = 0;
	if (groupNames.length > MAX_LINE_GROUPS) droppedGroups = groupNames.length - MAX_LINE_GROUPS;

	return {
		...series,
		x,
		y,
		z,
		skippedRows: series.skippedRows + (count - total),
		groups,
		droppedGroups
	};
}

/**
 * Build the numbers for one plot.
 *
 * The function reads the used columns once each, then walks the rows one time
 * and keeps the rows that every used axis can place. Therefore the cost is
 * linear in the row count, and it does not grow with the number of axes.
 */
export function buildPlotSeries(
	table: ApacheArrow.Table | null | undefined,
	plot: PlotConfig,
	context: PlotDataContext = {}
): PlotDataResult {
	if (!table || table.numRows === 0) {
		return { ok: false, message: 'The query returned no rows.' };
	}

	if (plot.type === 'histogram') return buildHistogramSeries(table, plot);

	if (!plot.y.column) {
		return { ok: false, message: 'Select a column for the Y axis.' };
	}

	const y = readNumericColumn(table, plot.y.column);
	if (!y) {
		return { ok: false, message: `The result has no numeric column "${plot.y.column}".` };
	}

	let xValues: Float64Array;
	let xKind: PlotColumnKind = 'number';

	if (plot.type === 'cross-section') {
		const distances = crossSectionDistances(table, context.selection);
		if ('message' in distances) return { ok: false, message: distances.message };
		xValues = distances.values;
	} else {
		if (!plot.x.column) {
			return { ok: false, message: 'Select a column for the X axis.' };
		}

		const x = readNumericColumn(table, plot.x.column);
		if (!x) {
			return { ok: false, message: `The result has no numeric column "${plot.x.column}".` };
		}

		xValues = x.values;
		xKind = x.kind;
	}

	let zValues: Float64Array | null = null;
	let zKind: PlotColumnKind | null = null;

	// A line takes its colour from the group, so it must not drop a row because
	// the colour column of an earlier scatter is null there.
	if (plot.z?.column && usesZColumn(plot.type)) {
		const z = readNumericColumn(table, plot.z.column);
		if (!z) {
			return { ok: false, message: `The result has no numeric column "${plot.z.column}".` };
		}

		zValues = z.values;
		zKind = z.kind;
	}

	// The group column of a line plot. It is read as text, so it also accepts a
	// station name. `groupNames` collects the values in order of first sight, so
	// the colour of a stroke does not jump when the row order changes.
	let groupKeys: string[] | null = null;

	if (plot.type === 'line' && plot.line.groupColumn) {
		groupKeys = readGroupKeys(table, plot.line.groupColumn);

		if (!groupKeys) {
			return { ok: false, message: `The result has no column "${plot.line.groupColumn}".` };
		}
	}

	const rows = table.numRows;
	const outX = new Float64Array(rows);
	const outY = new Float64Array(rows);

	let outZ: Float64Array | null = null;
	if (zValues) outZ = new Float64Array(rows);

	let outGroups: Int32Array | null = null;
	if (groupKeys) outGroups = new Int32Array(rows);

	const groupNames: string[] = [];
	const groupIds = new Map<string, number>();

	const xRange = emptyRange();
	const yRange = emptyRange();
	const zRange = emptyRange();

	let kept = 0;

	for (let i = 0; i < rows; i++) {
		const xValue = xValues[i];
		const yValue = y.values[i];

		if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) continue;

		let zValue = 0;
		if (zValues) {
			zValue = zValues[i];
			if (!Number.isFinite(zValue)) continue;
		}

		outX[kept] = xValue;
		outY[kept] = yValue;

		if (groupKeys && outGroups) {
			const key = groupKeys[i];
			let id = groupIds.get(key);

			if (id === undefined) {
				id = groupNames.length;
				groupNames.push(key);
				groupIds.set(key, id);
			}

			outGroups[kept] = id;
		}

		if (xValue < xRange.min) xRange.min = xValue;
		if (xValue > xRange.max) xRange.max = xValue;
		if (yValue < yRange.min) yRange.min = yValue;
		if (yValue > yRange.max) yRange.max = yValue;

		if (outZ) {
			outZ[kept] = zValue;
			if (zValue < zRange.min) zRange.min = zValue;
			if (zValue > zRange.max) zRange.max = zValue;
		}

		kept++;
	}

	if (kept === 0) {
		return {
			ok: false,
			message: 'No row has a value on every selected axis, so the plot has nothing to draw.'
		};
	}

	let z: Float64Array | null = null;
	if (outZ) z = outZ.subarray(0, kept);

	let settledZRange: PlotRange | null = null;
	if (outZ) settledZRange = settleRange(zRange);

	const series: PlotSeries = {
		x: outX.subarray(0, kept),
		y: outY.subarray(0, kept),
		z,
		xRange: settleRange(xRange),
		yRange: settleRange(yRange),
		zRange: settledZRange,
		xKind,
		yKind: y.kind,
		zKind,
		skippedRows: rows - kept,
		groups: null,
		droppedGroups: 0,
		binWidth: null,
		sampledFrom: null
	};

	if (plot.type !== 'line') return { ok: true, series };

	let keptGroups: Int32Array | null = null;
	if (outGroups) keptGroups = outGroups.subarray(0, kept);

	const ordered = orderLineSeries(series, keptGroups, groupNames, plot.line.sortBy);

	if (ordered.x.length === 0) {
		return { ok: false, message: 'Every group was dropped, so the plot has nothing to draw.' };
	}

	return { ok: true, series: ordered };
}

/**
 * The range that an axis draws over: the values that the user set, and the range
 * of the data for the ends that they left on auto.
 */
export function resolveRange(
	dataRange: PlotRange,
	min: number | null,
	max: number | null
): PlotRange {
	return {
		min: min ?? dataRange.min,
		max: max ?? dataRange.max
	};
}
