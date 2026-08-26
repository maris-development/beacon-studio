/**
 * PlotConfig is the record shape for one plot on the chart explorer page.
 *
 * A plot is display state, not query state. It never reaches the server, and it
 * never changes the cache key of a result. Therefore it lives in
 * `StoredQuery.view.chart`, beside the map view, and not inside `draft` or
 * `compiled`. A change to a plot must not drop the result of the last run.
 *
 * One query holds many plots. {@link ChartViewState} keeps the list and the id
 * of the plot that the page shows now.
 *
 * Four plot types exist:
 *   - `scatter`       X and Y both come from a column.
 *   - `cross-section` X is the distance along the drawn cross section line.
 *                     Y still comes from a column. See `geo/along-line.ts`.
 *   - `line`          Like a scatter, but the rows join into a stroke. A group
 *                     column splits the rows into one stroke per group.
 *   - `histogram`     One column on X, binned. Y is the count per bin.
 *
 * Storage holds plain JSON that an older version of the app wrote. Therefore
 * every value that comes back from storage goes through {@link normaliseChartView}
 * first. That function repairs a partial record and drops a broken one.
 */

import { createId } from '@/stores/stored-query';
import { DEFAULT_PALETTE_ID, isPaletteId, type PaletteId } from '@/colors/palettes';

export type PlotType = 'scatter' | 'cross-section' | 'line' | 'histogram';
export type ColorScale = 'linear' | 'logarithmic' | 'exponential';
export type PlotInterpolationMethod = 'gaussian' | 'delaunay-barycentric';
export type PlotTypeConfig = { id: PlotType; label: string; description: string };

export const PLOT_TYPES: ReadonlyArray<PlotTypeConfig> = [
	{
		id: 'scatter',
		label: 'Scatter plot',
		description: 'X and Y both come from a data column.'
	},
	{
		id: 'cross-section',
		label: 'Cross section',
		description: 'X is the distance along the cross section line drawn on the map.'
	},
	{
		id: 'line',
		label: 'Line / profile',
		description: 'The rows join into a stroke. A group column draws one stroke per cast.'
	},
	{
		id: 'histogram',
		label: 'Histogram',
		description: 'One column, split into bins. The height of a bar is the row count.'
	}
];

/** True when the plot type requires sampling above a certain amount of rows. */
export function needsSampling(type: PlotType): boolean {
	return type === 'scatter' || type === 'cross-section';
}


/** True when the type puts a column on both X and Y. */
export function usesXColumn(type: PlotType): boolean {
	return type !== 'cross-section';
}

/** True when the type reads the Y column. A histogram counts rows instead. */
export function usesYColumn(type: PlotType): boolean {
	return type !== 'histogram';
}

/**
 * True when the type can colour its rows from a Z column.
 *
 * A line takes its colour from the group, and a histogram bar holds many rows,
 * so neither has a per-row colour to show.
 */
export function usesZColumn(type: PlotType): boolean {
	return type === 'scatter' || type === 'cross-section';
}

/**
 * One axis of a plot.
 *
 * `min` and `max` are the range of the axis. Null means that the renderer takes
 * the range from the data. On the Z axis the pair is the range of the colours.
 *
 * `reverse` turns the axis around. A depth axis needs this, because depth grows
 * downward. On the Z axis it turns the palette around instead.
 */
export interface PlotAxisConfig {
	/** The column that feeds the axis. Null for the X axis of a cross section. */
	column: string | null;
	/** The axis title. Null means that the renderer uses the column name. */
	label: string | null;
	min: number | null;
	max: number | null;
	reverse: boolean;
	/** The value transform used when this axis drives the colour palette. */
	scale: ColorScale;
}

export interface PlotContourConfig {
	enabled: boolean;
	/** How many contour levels to draw over the range of the Z values. */
	levelCount: number;
	/** Cells per axis of the grid that the contour algorithm reads. */
	gridResolution: number;
	lineWidth: number;
	showLabels: boolean;
	labelFontSize: number;
}

export interface PlotInterpolationConfig {
	enabled: boolean;
	/** The algorithm that fills the interpolation grid. */
	method: PlotInterpolationMethod;
	/** Cells along the X axis of the interpolation grid. */
	xGridResolution: number;
	/** Cells along the Y axis of the interpolation grid. */
	yGridResolution: number;
	/** Gaussian blur radius, in grid cells. */
	gaussianSigma: number;
	/** Lower percentile for colour clipping. */
	percentileMin: number;
	/** Upper percentile for colour clipping. */
	percentileMax: number;
	/** Filled colour bands that approximate the interpolated surface. */
	bandCount: number;
}

/**
 * The settings of a line plot.
 *
 * `groupColumn` splits the rows into one stroke per value. Without it every row
 * joins into one stroke, which is right for a single cast and wrong for a
 * result that holds many. The column does not have to hold numbers: a station
 * name is text, and it is the common case.
 *
 * `sortBy` is the axis that the stroke runs along inside a group. A time series
 * runs along X. A vertical profile runs along Y, because the measurement is on
 * X and the depth is on Y.
 */
export interface PlotLineConfig {
	groupColumn: string | null;
	sortBy: 'x' | 'y';
	width: number;
	/** Draw a dot on every row as well as the stroke. */
	showPoints: boolean;
}

export interface PlotHistogramConfig {
	/** How many bins the X range is cut into. */
	binCount: number;
}

export interface PlotStyleConfig {
	palette: PaletteId;
	/** Draw the raw datapoints for scatter and cross-section plots. */
	showPoints: boolean;
	pointRadius: number;
	/** 0 to 1. A dense scatter needs a low value to show its structure. */
	pointOpacity: number;
	gridlines: boolean;
	xAxisTitleFontSize: number;
	yAxisTitleFontSize: number;
	/** Optional title shared by the group legend and the colour scale. */
	legendTitle: string;
	legendTitleFontSize: number;
	tickFontSize: number;
	titleFontSize: number;
	/** CSS colour. The renderer paints it behind the plot, and into the export. */
	backgroundColor: string;
	/** CSS colour of the gridlines and axis ticks. */
	gridlineColor: string;
	/** 0 to 1. Controls the opacity of the gridlines and axis ticks. */
	gridlineOpacity: number;
	/** CSS colour of the title, the axis titles and the tick labels. */
	textColor: string;
}

export interface PlotConfig {
	/** Stable identity inside one query. {@link ChartViewState.activePlotId} points at it. */
	id: string;
	/** The name in the plot list. */
	name: string;
	type: PlotType;
	/** The heading over the plot. Empty means no heading. */
	title: string;
	x: PlotAxisConfig;
	y: PlotAxisConfig;
	/** The colour axis. Null means that every point takes one colour. */
	z: PlotAxisConfig | null;
	contour: PlotContourConfig;
	interpolation: PlotInterpolationConfig;
	line: PlotLineConfig;
	histogram: PlotHistogramConfig;
	style: PlotStyleConfig;
}

/** The display state of the chart explorer for one query. */
export interface ChartViewState {
	plots: PlotConfig[];
	activePlotId: string | null;
}

// -- defaults ----------------------------------------------------------------

export const DEFAULT_CONTOUR: PlotContourConfig = {
	enabled: false,
	levelCount: 10,
	gridResolution: 120,
	lineWidth: 1,
	showLabels: true,
	labelFontSize: 10
};

export const DEFAULT_INTERPOLATION: PlotInterpolationConfig = {
	enabled: false,
	method: 'gaussian',
	xGridResolution: 120,
	yGridResolution: 120,
	gaussianSigma: 1.2,
	percentileMin: 1,
	percentileMax: 99,
	bandCount: 25
};

export const DEFAULT_LINE: PlotLineConfig = {
	groupColumn: null,
	sortBy: 'x',
	width: 1.5,
	showPoints: false
};

export const DEFAULT_HISTOGRAM: PlotHistogramConfig = {
	binCount: 30
};

/** The most groups a line plot draws. Beyond this the picture reads as noise. */
export const MAX_LINE_GROUPS = 40;

export const DEFAULT_STYLE: PlotStyleConfig = {
	palette: DEFAULT_PALETTE_ID,
	showPoints: true,
	pointRadius: 3,
	pointOpacity: 0.85,
	gridlines: true,
	xAxisTitleFontSize: 13,
	yAxisTitleFontSize: 13,
	legendTitle: '',
	legendTitleFontSize: 13,
	tickFontSize: 11,
	titleFontSize: 16,
	backgroundColor: '#ffffff',
	gridlineColor: '#1f2937',
	gridlineOpacity: 0.15,
	textColor: '#1f2937'
};

/** The colour of a point when the plot has no Z axis. */
export const DEFAULT_POINT_COLOR = '#2563eb';

export function makeAxisConfig(overrides: Partial<PlotAxisConfig> = {}): PlotAxisConfig {
	return {
		column: null,
		label: null,
		min: null,
		max: null,
		reverse: false,
		scale: 'linear',
		...overrides
	};
}

export function makePlotConfig(overrides: Partial<PlotConfig> = {}): PlotConfig {
	return {
		id: createId(),
		name: 'Plot 1',
		type: 'scatter',
		title: '',
		x: makeAxisConfig(),
		y: makeAxisConfig(),
		z: null,
		contour: { ...DEFAULT_CONTOUR },
		interpolation: { ...DEFAULT_INTERPOLATION },
		line: { ...DEFAULT_LINE },
		histogram: { ...DEFAULT_HISTOGRAM },
		style: { ...DEFAULT_STYLE },
		...overrides
	};
}

export function makeChartViewState(plots: PlotConfig[] = []): ChartViewState {
	let activePlotId: string | null = null;
	if (plots.length > 0) activePlotId = plots[0].id;

	return { plots, activePlotId };
}

/** Copy a plot under a new identity. "Duplicate plot" uses this function. */
export function clonePlotConfig(
	source: PlotConfig,
	overrides: Partial<PlotConfig> = {}
): PlotConfig {
	let z: PlotAxisConfig | null = null;
	if (source.z) z = { ...source.z };

	return {
		...source,
		id: createId(),
		x: { ...source.x },
		y: { ...source.y },
		z,
		contour: { ...source.contour },
		interpolation: { ...source.interpolation },
		line: { ...source.line },
		histogram: { ...source.histogram },
		style: { ...source.style },
		...overrides
	};
}

/** The next free "Plot n" name in a list. */
export function nextPlotName(plots: ReadonlyArray<PlotConfig>): string {
	let number = plots.length + 1;

	while (plots.some((plot) => plot.name === `Plot ${number}`)) {
		number++;
	}

	return `Plot ${number}`;
}

// -- reading a plot ----------------------------------------------------------

/** The title of an axis: the override, or the column name, or an empty string. */
export function axisTitle(axis: PlotAxisConfig | null, fallback = ''): string {
	if (!axis) return fallback;
	if (axis.label !== null && axis.label !== '') return axis.label;
	return axis.column ?? fallback;
}

/**
 * True when the renderer has enough of a plot to draw it.
 *
 * Each type asks for a different set. A cross section takes its X values from
 * the drawn line, so it needs a Y column alone. A histogram counts the rows of
 * one column, so it needs an X column alone.
 */
export function isPlotRenderable(plot: PlotConfig | null | undefined): boolean {
	if (!plot) return false;
	if (usesXColumn(plot.type) && !plot.x.column) return false;
	if (usesYColumn(plot.type) && !plot.y.column) return false;
	return true;
}

/**
 * Drop a column that the result no longer holds.
 *
 * A user edits the query behind a plot. The new result can miss a column that
 * the plot points at. The plot then keeps a name that resolves to nothing, and
 * the renderer draws an empty canvas with no reason on screen. This function
 * clears such a reference, so the panel shows an empty selector instead.
 *
 * It returns the same object when nothing changed. Therefore a caller can use
 * the identity of the result to decide whether to write to storage.
 *
 * `groupColumns` is the wider list that the group column of a line plot draws
 * from: that one may hold text, so it is not in `columns`.
 */
export function pruneMissingColumns(
	plot: PlotConfig,
	columns: ReadonlyArray<string>,
	groupColumns: ReadonlyArray<string> = columns
): PlotConfig {
	const exists = (name: string | null): boolean => !!name && columns.includes(name);

	const keepX = !usesXColumn(plot.type) || exists(plot.x.column);
	const keepY = !usesYColumn(plot.type) || exists(plot.y.column);
	const keepZ = !plot.z || exists(plot.z.column);

	const group = plot.line.groupColumn;
	const keepGroup = !group || groupColumns.includes(group);

	if (keepX && keepY && keepZ && keepGroup) return plot;

	const pruned: PlotConfig = { ...plot, x: { ...plot.x }, y: { ...plot.y } };
	if (!keepX) pruned.x.column = null;
	if (!keepY) pruned.y.column = null;

	if (!keepGroup) pruned.line = { ...plot.line, groupColumn: null };

	if (plot.z && !keepZ) {
		pruned.z = { ...plot.z, column: null };
	} else if (plot.z) {
		pruned.z = { ...plot.z };
	}

	return pruned;
}

// -- reading from storage ----------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/** A finite number, or the fallback. A stored `null` and a stored string both fail. */
function asNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return fallback;
}

/** A finite number, or null. This is the "auto" of an axis range. */
function asNullableNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === 'boolean') return value;
	return fallback;
}

function asColorScale(value: unknown): ColorScale {
	if (value === 'logarithmic' || value === 'exponential') return value;
	return 'linear';
}

function asInterpolationMethod(value: unknown): PlotInterpolationMethod {
	if (value === 'delaunay-barycentric') return value;
	return 'gaussian';
}

function asString(value: unknown, fallback: string): string {
	if (typeof value === 'string') return value;
	return fallback;
}

function asNullableString(value: unknown): string | null {
	if (typeof value === 'string' && value !== '') return value;
	return null;
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

function normaliseAxis(raw: unknown): PlotAxisConfig {
	const record = asRecord(raw);
	if (!record) return makeAxisConfig();

	return {
		column: asNullableString(record.column),
		label: asNullableString(record.label),
		min: asNullableNumber(record.min),
		max: asNullableNumber(record.max),
		reverse: asBoolean(record.reverse, false),
		scale: asColorScale(record.scale)
	};
}

function normaliseContour(raw: unknown): PlotContourConfig {
	const record = asRecord(raw);
	if (!record) return { ...DEFAULT_CONTOUR };

	return {
		enabled: asBoolean(record.enabled, DEFAULT_CONTOUR.enabled),
		levelCount: clamp(Math.round(asNumber(record.levelCount, DEFAULT_CONTOUR.levelCount)), 2, 50),
		gridResolution: clamp(
			Math.round(asNumber(record.gridResolution, DEFAULT_CONTOUR.gridResolution)),
			10,
			500
		),
		lineWidth: clamp(asNumber(record.lineWidth, DEFAULT_CONTOUR.lineWidth), 0.25, 10),
		showLabels: asBoolean(record.showLabels, DEFAULT_CONTOUR.showLabels),
		labelFontSize: clamp(asNumber(record.labelFontSize, DEFAULT_CONTOUR.labelFontSize), 6, 48)
	};
}

function normaliseInterpolation(raw: unknown): PlotInterpolationConfig {
	const record = asRecord(raw);
	if (!record) return { ...DEFAULT_INTERPOLATION };

	let percentileMin = clamp(
		asNumber(record.percentileMin, DEFAULT_INTERPOLATION.percentileMin),
		0,
		100
	);
	let percentileMax = clamp(
		asNumber(record.percentileMax, DEFAULT_INTERPOLATION.percentileMax),
		0,
		100
	);

	if (percentileMax <= percentileMin) {
		percentileMin = DEFAULT_INTERPOLATION.percentileMin;
		percentileMax = DEFAULT_INTERPOLATION.percentileMax;
	}

	return {
		enabled: asBoolean(record.enabled, DEFAULT_INTERPOLATION.enabled),
		method: asInterpolationMethod(record.method),
		xGridResolution: clamp(
			Math.round(
				asNumber(
					record.xGridResolution,
					asNumber(record.gridResolution, DEFAULT_INTERPOLATION.xGridResolution)
				)
			),
			10,
			500
		),
		yGridResolution: clamp(
			Math.round(
				asNumber(
					record.yGridResolution,
					asNumber(record.gridResolution, DEFAULT_INTERPOLATION.yGridResolution)
				)
			),
			10,
			500
		),
		gaussianSigma: clamp(
			asNumber(record.gaussianSigma, DEFAULT_INTERPOLATION.gaussianSigma),
			0,
			20
		),
		percentileMin,
		percentileMax,
		bandCount: clamp(
			Math.round(asNumber(record.bandCount, DEFAULT_INTERPOLATION.bandCount)),
			2,
			100
		)
	};
}

function normaliseLine(raw: unknown): PlotLineConfig {
	const record = asRecord(raw);
	if (!record) return { ...DEFAULT_LINE };

	let sortBy: 'x' | 'y' = DEFAULT_LINE.sortBy;
	if (record.sortBy === 'x' || record.sortBy === 'y') sortBy = record.sortBy;

	return {
		groupColumn: asNullableString(record.groupColumn),
		sortBy,
		width: clamp(asNumber(record.width, DEFAULT_LINE.width), 0.25, 10),
		showPoints: asBoolean(record.showPoints, DEFAULT_LINE.showPoints)
	};
}

function normaliseHistogram(raw: unknown): PlotHistogramConfig {
	const record = asRecord(raw);
	if (!record) return { ...DEFAULT_HISTOGRAM };

	return {
		binCount: clamp(Math.round(asNumber(record.binCount, DEFAULT_HISTOGRAM.binCount)), 2, 200)
	};
}

function normaliseStyle(raw: unknown): PlotStyleConfig {
	const record = asRecord(raw);
	if (!record) return { ...DEFAULT_STYLE };

	let palette: PaletteId = DEFAULT_STYLE.palette;
	if (isPaletteId(record.palette)) palette = record.palette;

	return {
		palette,
		showPoints: asBoolean(record.showPoints, DEFAULT_STYLE.showPoints),
		pointRadius: clamp(asNumber(record.pointRadius, DEFAULT_STYLE.pointRadius), 0.5, 30),
		pointOpacity: clamp(asNumber(record.pointOpacity, DEFAULT_STYLE.pointOpacity), 0.05, 1),
		gridlines: asBoolean(record.gridlines, DEFAULT_STYLE.gridlines),
		xAxisTitleFontSize: clamp(
			asNumber(
				record.xAxisTitleFontSize,
				asNumber(record.axisTitleFontSize, DEFAULT_STYLE.xAxisTitleFontSize)
			),
			6,
			48
		),
		yAxisTitleFontSize: clamp(
			asNumber(
				record.yAxisTitleFontSize,
				asNumber(record.axisTitleFontSize, DEFAULT_STYLE.yAxisTitleFontSize)
			),
			6,
			48
		),
		legendTitle: asString(record.legendTitle, DEFAULT_STYLE.legendTitle),
		legendTitleFontSize: clamp(
			asNumber(record.legendTitleFontSize, DEFAULT_STYLE.legendTitleFontSize),
			6,
			48
		),
		tickFontSize: clamp(asNumber(record.tickFontSize, DEFAULT_STYLE.tickFontSize), 6, 48),
		titleFontSize: clamp(asNumber(record.titleFontSize, DEFAULT_STYLE.titleFontSize), 8, 72),
		backgroundColor: asString(record.backgroundColor, DEFAULT_STYLE.backgroundColor),
		gridlineColor: asString(record.gridlineColor, DEFAULT_STYLE.gridlineColor),
		gridlineOpacity: clamp(asNumber(record.gridlineOpacity, DEFAULT_STYLE.gridlineOpacity), 0, 1),
		textColor: asString(record.textColor, DEFAULT_STYLE.textColor)
	};
}

/** Repair one stored plot. Returns null when the value is not an object at all. */
export function normalisePlotConfig(raw: unknown): PlotConfig | null {
	const record = asRecord(raw);
	if (!record) return null;

	// An unknown type comes from a newer version of the app, or from a corrupt
	// record. A scatter needs the fewest settings, so it is the safe fallback.
	let type: PlotType = 'scatter';
	if (PLOT_TYPES.some((entry) => entry.id === record.type)) type = record.type as PlotType;

	let z: PlotAxisConfig | null = null;
	if (record.z) z = normaliseAxis(record.z);

	return {
		id: asString(record.id, '') || createId(),
		name: asString(record.name, 'Plot'),
		type,
		title: asString(record.title, ''),
		x: normaliseAxis(record.x),
		y: normaliseAxis(record.y),
		z,
		contour: normaliseContour(record.contour),
		interpolation: normaliseInterpolation(record.interpolation),
		line: normaliseLine(record.line),
		histogram: normaliseHistogram(record.histogram),
		style: normaliseStyle(record.style)
	};
}

/**
 * Repair the stored chart state of a query.
 *
 * Returns null when the query has no usable plot. The page then starts from a
 * fresh default, and it writes nothing back until the user configures a plot.
 *
 * The function also corrects `activePlotId`. A stored id can point at a plot
 * that a later version removed.
 */
export function normaliseChartView(raw: unknown): ChartViewState | null {
	const record = asRecord(raw);
	if (!record || !Array.isArray(record.plots)) return null;

	const plots: PlotConfig[] = [];
	const seenIds = new Set<string>();

	for (const entry of record.plots) {
		const plot = normalisePlotConfig(entry);
		if (!plot) continue;

		// A duplicate id would make the plot list ambiguous. Give the copy a new one.
		if (seenIds.has(plot.id)) plot.id = createId();
		seenIds.add(plot.id);

		plots.push(plot);
	}

	if (plots.length === 0) return null;

	let activePlotId = asNullableString(record.activePlotId);
	if (!activePlotId || !seenIds.has(activePlotId)) {
		activePlotId = plots[0].id;
	}

	return { plots, activePlotId };
}
