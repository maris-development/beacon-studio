/**
 * The canvas drawing of the plot renderer, for uPlot.
 *
 * uPlot draws the axes, the grid, the ticks and the tick labels on one canvas.
 * These functions draw everything else on that same canvas: the background, the
 * points, the contour lines, the colour bar and the title. Nothing goes in the
 * DOM beside the canvas, so the PNG export writes one picture that matches the
 * screen.
 *
 * The functions take a `uPlot` instance and read its plotting area from
 * {@link uPlot.bbox}, in canvas pixels. A value becomes a pixel through the
 * scale of the chart, so a resize redraws the same picture without new numbers.
 *
 * uPlot scales its own axis fonts by the device pixel ratio. These functions
 * draw straight on the device-pixel canvas, so they scale the sizes that the
 * user set (radius, line width, font) by that ratio themselves.
 */
import type uPlot from 'uplot';
import { getColorTable, makePaletteScale, paletteIndex, samplePalette } from '@/colors/palettes';
import { colorScalePosition, colorScaleValue } from '@/colors/color-scale';
import type { ColorScale } from './plot-config';
import { resolveRange, type PlotSeries } from './plot-data';
import { DEFAULT_POINT_COLOR, type PlotConfig } from './plot-config';
import type { ContourResult } from './contour';
import type { InterpolationResult } from './interpolation';

const TAU = Math.PI * 2;

/** The device pixel ratio the instance draws at. */
function dprOf(u: uPlot): number {
	if (!u.width) return 1;
	return u.ctx.canvas.width / u.width;
}

/** Convert a CSS colour and opacity to an rgba string for gridlines. */
export function gridColor(color: string, opacity: number): string {
	const parsed = parseCssColor(color);
	if (!parsed) return `rgba(0, 0, 0, ${opacity})`;
	return `rgba(${parsed[0]}, ${parsed[1]}, ${parsed[2]}, ${opacity})`;
}

/** Parse `#rrggbb`, `#rgb` or `rgb()`/`rgba()` to an `[r, g, b]` triple. */
function parseCssColor(value: string): [number, number, number] | null {
	const text = value.trim();

	if (text.startsWith('#')) {
		let hex = text.slice(1);
		if (hex.length === 3) {
			hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
		}
		if (hex.length !== 6) return null;

		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
		return [r, g, b];
	}

	const match = text.match(/rgba?\(([^)]+)\)/i);
	if (!match) return null;

	const parts = match[1].split(',').map((part) => Number(part));
	if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
	return [parts[0], parts[1], parts[2]];
}

// -- background --------------------------------------------------------------

/**
 * Fill the whole canvas with the plot background.
 *
 * A canvas is transparent. On screen the page shows through, and in a PNG the
 * background is empty. Both must take the colour that the user set. This runs on
 * `drawClear`, so the axes, the grid and the points all land on top of it.
 */
export function drawBackground(u: uPlot, color: string): void {
	if (!color) return;

	const { ctx } = u;
	ctx.save();
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.restore();
}

// -- coordinates -------------------------------------------------------------

interface PixelMapper {
	pixelX: (value: number) => number;
	pixelY: (value: number) => number;
}

/**
 * Value to canvas pixel, for both axes.
 *
 * The maths is inlined from the scales rather than taken from `valToPos`: these
 * loops run once per row, and at a million rows one function call per point per
 * axis is felt. Returns null while a scale has no range yet.
 */
function pixelMapper(u: uPlot): PixelMapper | null {
	const { left, top, width, height } = u.bbox;

	const sx = u.scales.x;
	const sy = u.scales.y;
	if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return null;

	const xMin = sx.min;
	const xSpan = sx.max - sx.min || 1;
	const yMin = sy.min;
	const ySpan = sy.max - sy.min || 1;
	const xReverse = sx.dir === -1;
	const yReverse = sy.dir === -1;

	return {
		pixelX(value: number): number {
			let t = (value - xMin) / xSpan;
			if (xReverse) t = 1 - t;
			return left + t * width;
		},
		pixelY(value: number): number {
			let t = (value - yMin) / ySpan;
			if (yReverse) t = 1 - t;
			return top + (1 - t) * height;
		}
	};
}

/** Clip the following drawing to the plot rectangle. The caller saves and restores. */
function clipToPlot(u: uPlot): void {
	const { left, top, width, height } = u.bbox;
	u.ctx.beginPath();
	u.ctx.rect(left, top, width, height);
	u.ctx.clip();
}

/** The colour of every group of a line plot, in group order. */
export function groupColors(palette: string, count: number, reverse: boolean): string[] {
	if (count <= 1) return [DEFAULT_POINT_COLOR];
	return samplePalette(palette, count, reverse);
}

// -- points ------------------------------------------------------------------

/**
 * Draw every point of the series.
 *
 * The colours come from a fixed table of at most 256 strings. A point takes the
 * index of its Z value in that table. The points are then grouped by index and
 * drawn one colour at a time, so the canvas sets its fill style a few hundred
 * times, not once per row. Without a Z axis the whole set is one fill.
 *
 * The opacity is one value for the set, so it is a single `globalAlpha` and the
 * palette strings stay opaque.
 */
export function drawPoints(u: uPlot, series: PlotSeries, plot: PlotConfig): void {
	const { ctx } = u;
	const dpr = dprOf(u);
	const radius = Math.max(plot.style.pointRadius * dpr, 0.5);

	const mapper = pixelMapper(u);
	if (!mapper) return;

	const { pixelX, pixelY } = mapper;

	const xs = series.x;
	const ys = series.y;
	const count = xs.length;

	ctx.save();
	clipToPlot(u);
	ctx.globalAlpha = plot.style.pointOpacity;

	if (!series.z || !series.zRange) {
		ctx.fillStyle = DEFAULT_POINT_COLOR;
		ctx.beginPath();

		for (let i = 0; i < count; i++) {
			const px = pixelX(xs[i]);
			const py = pixelY(ys[i]);
			ctx.moveTo(px + radius, py);
			ctx.arc(px, py, radius, 0, TAU);
		}

		ctx.fill();
		ctx.restore();
		return;
	}

	const range = resolveRange(series.zRange, plot.z?.min ?? null, plot.z?.max ?? null);
	const reverse = plot.z?.reverse ?? false;
	const scale = plot.z?.scale ?? 'linear';
	const table = getColorTable(plot.style.palette);

	// One bucket of point indices per palette step. A step with no point stays
	// empty, so a plot draws only the colours it uses.
	const buckets: number[][] = new Array(table.length);
	const z = series.z;

	for (let i = 0; i < count; i++) {
		const step = paletteIndex(z[i], range.min, range.max, reverse, scale);
		const bucket = buckets[step];
		if (bucket) bucket.push(i);
		else buckets[step] = [i];
	}

	for (let step = 0; step < buckets.length; step++) {
		const bucket = buckets[step];
		if (!bucket) continue;

		ctx.fillStyle = table[step];
		ctx.beginPath();

		for (let j = 0; j < bucket.length; j++) {
			const i = bucket[j];
			const px = pixelX(xs[i]);
			const py = pixelY(ys[i]);
			ctx.moveTo(px + radius, py);
			ctx.arc(px, py, radius, 0, TAU);
		}

		ctx.fill();
	}

	ctx.restore();
}

// -- lines -------------------------------------------------------------------

/**
 * Draw the strokes of a line plot.
 *
 * The rows arrive in stroke order, and `series.groups` names the run of rows of
 * each stroke. See `orderLineSeries` in `plot-data.ts`. Therefore this walks the
 * arrays once, from start to end, and never sorts.
 *
 * A group takes its colour from the palette by position, so the strokes of a
 * plot are as far apart in colour as the palette allows. Without a group column
 * the whole set is one stroke in the default colour.
 */
export function drawLines(u: uPlot, series: PlotSeries, plot: PlotConfig): void {
	const { ctx } = u;
	const dpr = dprOf(u);

	const mapper = pixelMapper(u);
	if (!mapper) return;

	const { pixelX, pixelY } = mapper;
	const xs = series.x;
	const ys = series.y;

	const groups = series.groups ?? [{ key: '', start: 0, end: xs.length }];
	const colors = groupColors(plot.style.palette, groups.length, plot.z?.reverse ?? false);

	ctx.save();
	clipToPlot(u);

	ctx.globalAlpha = plot.style.pointOpacity;
	ctx.lineWidth = Math.max(plot.line.width * dpr, 0.5);
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';

	for (let g = 0; g < groups.length; g++) {
		const { start, end } = groups[g];
		if (end - start < 2) continue;

		ctx.strokeStyle = colors[g % colors.length];
		ctx.beginPath();
		ctx.moveTo(pixelX(xs[start]), pixelY(ys[start]));

		for (let i = start + 1; i < end; i++) {
			ctx.lineTo(pixelX(xs[i]), pixelY(ys[i]));
		}

		ctx.stroke();
	}

	if (plot.line.showPoints) {
		const radius = Math.max(plot.style.pointRadius * dpr, 0.5);

		for (let g = 0; g < groups.length; g++) {
			const { start, end } = groups[g];

			ctx.fillStyle = colors[g % colors.length];
			ctx.beginPath();

			for (let i = start; i < end; i++) {
				const px = pixelX(xs[i]);
				const py = pixelY(ys[i]);
				ctx.moveTo(px + radius, py);
				ctx.arc(px, py, radius, 0, TAU);
			}

			ctx.fill();
		}
	}

	ctx.restore();
}

// -- bars --------------------------------------------------------------------

/**
 * Draw the bars of a histogram.
 *
 * X holds the centre of a bin and Y holds its count, so a bar spans `binWidth`
 * around its X and runs from the zero of the Y axis up to its count. The zero
 * is taken through the scale, not from the bottom of the plot, so a zoom moves
 * the baseline with the data.
 */
export function drawBars(u: uPlot, series: PlotSeries, plot: PlotConfig): void {
	if (!series.binWidth) return;

	const { ctx } = u;
	const { top, height } = u.bbox;

	const mapper = pixelMapper(u);
	if (!mapper) return;

	const { pixelX, pixelY } = mapper;
	const xs = series.x;
	const ys = series.y;

	// A one pixel gap separates the bars. It disappears once the bars are thinner
	// than three pixels, where a gap would eat most of the bar.
	const half = series.binWidth / 2;
	const full = Math.abs(pixelX(xs[0] + half) - pixelX(xs[0] - half));

	let gap = 1;
	if (full < 3) gap = 0;

	const baseline = Math.min(Math.max(pixelY(0), top), top + height);

	ctx.save();
	clipToPlot(u);

	ctx.globalAlpha = plot.style.pointOpacity;
	ctx.fillStyle = groupColors(plot.style.palette, 1, false)[0];

	for (let i = 0; i < xs.length; i++) {
		if (ys[i] === 0) continue;

		const leftEdge = pixelX(xs[i] - half);
		const rightEdge = pixelX(xs[i] + half);
		const barTop = pixelY(ys[i]);

		const x = Math.min(leftEdge, rightEdge) + gap / 2;
		const barWidth = Math.max(Math.abs(rightEdge - leftEdge) - gap, 0.5);

		ctx.fillRect(x, Math.min(barTop, baseline), barWidth, Math.abs(baseline - barTop));
	}

	ctx.restore();
}

// -- group legend ------------------------------------------------------------

/** The gap around the legend box, and the size of one swatch, in CSS pixels. */
const LEGEND_MARGIN = 8;
const LEGEND_SWATCH = 9;
const LEGEND_ROW_GAP = 4;

export interface GroupLegendOptions {
	groups: ReadonlyArray<{ key: string }>;
	colors: ReadonlyArray<string>;
	textColor: string;
	backgroundColor: string;
	title: string;
	titleFontSize: number;
	fontSize: number;
	/** Groups that the plot does not draw. Named in a last row. */
	droppedGroups: number;
}

/**
 * Draw the legend of a line plot, inside the top right of the plot area.
 *
 * A stroke has no meaning without its name, and the colour bar of the Z axis
 * does not apply here. It goes on the canvas like everything else, so the PNG
 * export keeps it.
 *
 * The box holds as many rows as the plot is tall. The rest become one "+n more"
 * row, so a long list cannot run off the bottom.
 */
export function drawGroupLegend(u: uPlot, options: GroupLegendOptions): void {
	if (options.groups.length < 2) return;

	const { ctx } = u;
	const { left, top, width, height } = u.bbox;
	const dpr = dprOf(u);

	const fontSize = options.fontSize * dpr;
	const titleFontSize = options.titleFontSize * dpr;
	const margin = LEGEND_MARGIN * dpr;
	const swatch = LEGEND_SWATCH * dpr;
	const rowHeight = Math.max(fontSize, swatch) + LEGEND_ROW_GAP * dpr;
	let titleHeight = 0;
	if (options.title) titleHeight = titleFontSize + LEGEND_ROW_GAP * dpr;

	ctx.save();
	clipToPlot(u);
	ctx.font = `${fontSize}px sans-serif`;

	// How many rows fit in half the plot height. A legend that filled the plot
	// would hide the lines it explains.
	const room = Math.max(Math.floor((height / 2 - margin * 2 - titleHeight) / rowHeight), 1);

	let shown = options.groups.length;
	let overflow = options.droppedGroups;

	if (shown > room) {
		overflow += shown - (room - 1);
		shown = room - 1;
	}

	const rows: Array<{ label: string; color: string | null }> = [];

	for (let i = 0; i < shown; i++) {
		rows.push({ label: options.groups[i].key, color: options.colors[i % options.colors.length] });
	}

	if (overflow > 0) rows.push({ label: `+${overflow} more`, color: null });

	let textWidth = 0;
	for (const row of rows) {
		textWidth = Math.max(textWidth, ctx.measureText(row.label).width);
	}

	if (options.title) {
		ctx.font = `bold ${titleFontSize}px sans-serif`;
		textWidth = Math.max(textWidth, ctx.measureText(options.title).width);
		ctx.font = `${fontSize}px sans-serif`;
	}

	const padding = 6 * dpr;
	const boxWidth = padding * 2 + swatch + padding + textWidth;
	const boxHeight = padding * 2 + titleHeight + rows.length * rowHeight - LEGEND_ROW_GAP * dpr;

	const boxX = left + width - margin - boxWidth;
	const boxY = top + margin;

	ctx.globalAlpha = 0.85;
	ctx.fillStyle = options.backgroundColor;
	ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
	ctx.globalAlpha = 1;

	ctx.strokeStyle = options.textColor;
	ctx.globalAlpha = 0.25;
	ctx.lineWidth = dpr;
	ctx.strokeRect(boxX + 0.5 * dpr, boxY + 0.5 * dpr, boxWidth - dpr, boxHeight - dpr);
	ctx.globalAlpha = 1;

	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';

	if (options.title) {
		ctx.fillStyle = options.textColor;
		ctx.font = `bold ${titleFontSize}px sans-serif`;
		ctx.fillText(options.title, boxX + padding, boxY + padding + titleFontSize / 2);
		ctx.font = `${fontSize}px sans-serif`;
	}

	for (let i = 0; i < rows.length; i++) {
		const centre =
			boxY + padding + titleHeight + rowHeight * i + rowHeight / 2 - (LEGEND_ROW_GAP * dpr) / 2;

		if (rows[i].color) {
			ctx.fillStyle = rows[i].color as string;
			ctx.fillRect(boxX + padding, centre - swatch / 2, swatch, swatch);
		}

		ctx.fillStyle = options.textColor;
		ctx.fillText(rows[i].label, boxX + padding + swatch + padding, centre);
	}

	ctx.restore();
}

// -- title -------------------------------------------------------------------

/**
 * Draw the plot title, centred over the plotting area.
 *
 * uPlot's own title is a DOM element, so it would be missing from the PNG. This
 * draws it on the canvas instead, in the top padding that the caller reserved.
 */
export function drawTitle(u: uPlot, text: string, color: string, fontSize: number): void {
	if (!text) return;

	const { ctx } = u;
	const { left, width } = u.bbox;
	const dpr = dprOf(u);

	ctx.save();
	ctx.fillStyle = color;
	ctx.font = `bold ${fontSize * dpr}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillText(text, left + width / 2, Math.round(4 * dpr));
	ctx.restore();
}

/**
 * Draw the subtitle, on the line under the title.
 *
 * `titleFontSize` is the height of the line above. Pass 0 when the plot has no
 * title: the subtitle then takes the top slot itself.
 *
 * The text is secondary to the title, so it draws lighter and without the bold
 * weight. The caller reserves the room in the top padding.
 */
export function drawSubtitle(
	u: uPlot,
	text: string,
	color: string,
	fontSize: number,
	titleFontSize: number
): void {
	if (!text) return;

	const { ctx } = u;
	const { left, width } = u.bbox;
	const dpr = dprOf(u);

	let top = 4;
	if (titleFontSize) top += titleFontSize + 2;

	ctx.save();
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.75;
	ctx.font = `${fontSize * dpr}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillText(text, left + width / 2, Math.round(top * dpr));
	ctx.restore();
}

// -- contours ----------------------------------------------------------------

export interface ContourDrawOptions {
	result: ContourResult;
	palette: string;
	reverse: boolean;
	scale: ColorScale;
	lineWidth: number;
	showLabels: boolean;
	labelFontSize: number;
	/** The plot background. A label clears a gap in the line with it. */
	backgroundColor: string;
	textColor: string;
}

/** A ring shorter than this, in pixels, gets no label. The text would not fit. */
const MIN_LABELLED_RING = 80;

/**
 * Draw the contour lines over the points.
 *
 * The lines arrive in data coordinates, so this converts them with the scales.
 * Everything is clipped to the convex hull of the points, because the gridding
 * invents a value for a cell far from any row.
 */
export function drawContours(u: uPlot, options: ContourDrawOptions): void {
	const { ctx } = u;
	const { left, top, width, height } = u.bbox;
	const dpr = dprOf(u);

	const { levels, hull, range } = options.result;
	const colorOf = makePaletteScale(
		options.palette,
		range.min,
		range.max,
		options.reverse,
		options.scale
	);

	const toPixelX = (x: number): number => u.valToPos(x, 'x', true);
	const toPixelY = (y: number): number => u.valToPos(y, 'y', true);

	ctx.save();

	// Clip twice: to the plot area, so a line cannot run over the axes, and to
	// the hull, so it cannot run past the data.
	ctx.beginPath();
	ctx.rect(left, top, width, height);
	ctx.clip();

	if (hull.length >= 3) {
		ctx.beginPath();
		ctx.moveTo(toPixelX(hull[0][0]), toPixelY(hull[0][1]));

		for (let i = 1; i < hull.length; i++) {
			ctx.lineTo(toPixelX(hull[i][0]), toPixelY(hull[i][1]));
		}

		ctx.closePath();
		ctx.clip();
	}

	ctx.lineWidth = options.lineWidth * dpr;
	ctx.lineJoin = 'round';

	for (const level of levels) {
		ctx.strokeStyle = colorOf(level.value);
		ctx.beginPath();

		for (const ring of level.rings) {
			ctx.moveTo(toPixelX(ring[0][0]), toPixelY(ring[0][1]));

			for (let i = 1; i < ring.length; i++) {
				ctx.lineTo(toPixelX(ring[i][0]), toPixelY(ring[i][1]));
			}
		}

		ctx.stroke();
	}

	if (options.showLabels) {
		drawContourLabels(ctx, dpr, levels, options, toPixelX, toPixelY);
	}

	ctx.restore();
}

export interface InterpolationDrawOptions {
	result: InterpolationResult;
	palette: string;
	reverse: boolean;
	scale: ColorScale;
}

export function drawInterpolationSurface(u: uPlot, options: InterpolationDrawOptions): void {
	const { ctx } = u;
	const { left, top, width, height } = u.bbox;
	const { result } = options;
	const { values, xResolution, yResolution, xRange, yRange, range, bandCount } = result;
	const colorOf = makePaletteScale(
		options.palette,
		range.min,
		range.max,
		options.reverse,
		options.scale
	);
	const sx = u.scales.x;
	const sy = u.scales.y;
	if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return;

	const imageWidth = Math.max(Math.round(width), 1);
	const imageHeight = Math.max(Math.round(height), 1);
	const image = ctx.createImageData(imageWidth, imageHeight);
	const colourCount = result.renderMode === 'continuous' ? 256 : bandCount;
	const colours = interpolationColours(colorOf, range, options.scale, colourCount);
	const xSpan = sx.max - sx.min || 1;
	const ySpan = sy.max - sy.min || 1;
	const xReverse = sx.dir === -1;
	const yReverse = sy.dir === -1;

	for (let pixelRow = 0; pixelRow < imageHeight; pixelRow++) {
		let yPosition = 1 - (pixelRow + 0.5) / imageHeight;
		if (yReverse) yPosition = 1 - yPosition;
		const yValue = sy.min + yPosition * ySpan;

		for (let pixelColumn = 0; pixelColumn < imageWidth; pixelColumn++) {
			let xPosition = (pixelColumn + 0.5) / imageWidth;
			if (xReverse) xPosition = 1 - xPosition;
			const xValue = sx.min + xPosition * xSpan;

			const value = sampleGrid(values, xResolution, yResolution, xRange, yRange, xValue, yValue);
			let position = colorScalePosition(value, range.min, range.max, options.scale);
			if (!Number.isFinite(position)) continue;

			position = Math.min(Math.max(position, 0), 1);
			const band = Math.min(Math.floor(position * colourCount), colourCount - 1);
			const colour = colours[band];
			const offset = (pixelRow * imageWidth + pixelColumn) * 4;

			image.data[offset] = colour[0];
			image.data[offset + 1] = colour[1];
			image.data[offset + 2] = colour[2];
			image.data[offset + 3] = colour[3];
		}
	}

	ctx.save();
	ctx.beginPath();
	ctx.rect(left, top, width, height);
	ctx.clip();
	ctx.putImageData(image, Math.round(left), Math.round(top));
	ctx.restore();
}

function interpolationColours(
	colorOf: (value: number) => string,
	range: { min: number; max: number },
	scale: ColorScale,
	bandCount: number
): Array<[number, number, number, number]> {
	const colours: Array<[number, number, number, number]> = [];

	for (let band = 0; band < bandCount; band++) {
		const bandPosition = (band + 0.5) / bandCount;
		const colorValue = colorScaleValue(bandPosition, range.min, range.max, scale);
		const parsed = parseCssColor(colorOf(colorValue)) ?? [0, 0, 0];
		colours.push([parsed[0], parsed[1], parsed[2], 204]);
	}

	return colours;
}

function sampleGrid(
	values: Float64Array,
	xResolution: number,
	yResolution: number,
	xRange: { min: number; max: number },
	yRange: { min: number; max: number },
	xValue: number,
	yValue: number
): number {
	const gridX = clampNumber(
		((xValue - xRange.min) / (xRange.max - xRange.min || 1)) * xResolution - 0.5,
		0,
		xResolution - 1
	);
	const gridY = clampNumber(
		((yValue - yRange.min) / (yRange.max - yRange.min || 1)) * yResolution - 0.5,
		0,
		yResolution - 1
	);

	const leftColumn = Math.floor(gridX);
	const rightColumn = Math.min(leftColumn + 1, xResolution - 1);
	const topRow = Math.floor(gridY);
	const bottomRow = Math.min(topRow + 1, yResolution - 1);
	const xWeight = gridX - leftColumn;
	const yWeight = gridY - topRow;

	const topLeft = values[topRow * xResolution + leftColumn];
	const topRight = values[topRow * xResolution + rightColumn];
	const bottomLeft = values[bottomRow * xResolution + leftColumn];
	const bottomRight = values[bottomRow * xResolution + rightColumn];
	if (
		!Number.isFinite(topLeft) ||
		!Number.isFinite(topRight) ||
		!Number.isFinite(bottomLeft) ||
		!Number.isFinite(bottomRight)
	) {
		return Number.NaN;
	}

	const topValue = topLeft * (1 - xWeight) + topRight * xWeight;
	const bottomValue = bottomLeft * (1 - xWeight) + bottomRight * xWeight;

	return topValue * (1 - yWeight) + bottomValue * yWeight;
}

function clampNumber(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

function drawContourLabels(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	levels: ContourResult['levels'],
	options: ContourDrawOptions,
	toPixelX: (x: number) => number,
	toPixelY: (y: number) => number
): void {
	const fontSize = options.labelFontSize * dpr;
	ctx.font = `${fontSize}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	for (const level of levels) {
		const label = formatValue(level.value);
		const textWidth = ctx.measureText(label).width;

		for (const ring of level.rings) {
			if (ring.length < 8) continue;

			// The label sits at the middle vertex of the ring. That is far from both
			// ends, so it rarely lands on a corner.
			const middle = Math.floor(ring.length / 2);
			const x = toPixelX(ring[middle][0]);
			const y = toPixelY(ring[middle][1]);

			const start = toPixelX(ring[0][0]);
			const startY = toPixelY(ring[0][1]);

			// A rough size test: the span from the first to the middle vertex.
			if (Math.hypot(x - start, y - startY) < MIN_LABELLED_RING * dpr) continue;

			// Clear a gap in the line, so the text does not sit on top of it.
			ctx.fillStyle = options.backgroundColor;
			ctx.fillRect(
				x - textWidth / 2 - 2 * dpr,
				y - fontSize / 2 - dpr,
				textWidth + 4 * dpr,
				fontSize + 2 * dpr
			);

			ctx.fillStyle = options.textColor;
			ctx.fillText(label, x, y);
		}
	}
}

// -- colour bar --------------------------------------------------------------

/** Width of the colour bar, and the gap on both sides of it, in CSS pixels. */
const BAR_WIDTH = 14;
const BAR_GAP = 12;
const LABEL_GAP = 6;

/** How many colour stops the gradient of the bar uses. */
const GRADIENT_STOPS = 32;

/** How many labelled ticks the bar shows, the two ends included. */
const BAR_TICKS = 5;

/** How much right padding, in CSS pixels, a chart with a colour bar needs. */
export function colorBarPadding(fontSize: number, titleFontSize: number): number {
	// bar + labels + the rotated title. The label width is an estimate for six
	// digits at this font size, which is enough for the values this app shows.
	return BAR_GAP + BAR_WIDTH + LABEL_GAP + fontSize * 3.5 + titleFontSize * 1.6;
}

export interface ColorBarDrawOptions {
	title: string;
	min: number;
	max: number;
	palette: string;
	reverse: boolean;
	scale: ColorScale;
	textColor: string;
	fontSize: number;
	titleFontSize: number;
}

function formatValue(value: number): string {
	const magnitude = Math.abs(value);

	if (magnitude !== 0 && (magnitude < 0.01 || magnitude >= 1e6)) {
		return value.toExponential(1);
	}

	return Number(value.toPrecision(4)).toString();
}

/**
 * Draw the colour bar of the Z axis.
 *
 * Without it a colour on the plot has no meaning. The bar sits in the right
 * padding of the chart, which {@link colorBarPadding} reserves.
 */
export function drawColorBar(u: uPlot, options: ColorBarDrawOptions): void {
	const { ctx } = u;
	const { top, left, width, height } = u.bbox;
	const dpr = dprOf(u);

	if (height <= 0) return;

	const barWidth = BAR_WIDTH * dpr;
	const barGap = BAR_GAP * dpr;
	const labelGap = LABEL_GAP * dpr;
	const fontSize = options.fontSize * dpr;
	const titleFontSize = options.titleFontSize * dpr;

	const bottom = top + height;
	const x = left + width + barGap;

	ctx.save();

	// The gradient runs bottom to top, so the maximum sits at the top of the bar.
	// That matches the Y axis and how a reader expects a scale to run.
	const gradient = ctx.createLinearGradient(0, bottom, 0, top);
	const colors = samplePalette(options.palette, GRADIENT_STOPS, options.reverse);

	for (let i = 0; i < colors.length; i++) {
		const valuePosition = i / (colors.length - 1);
		const value = colorScaleValue(valuePosition, options.min, options.max, options.scale);
		const colorPosition = colorScalePosition(value, options.min, options.max, options.scale);
		gradient.addColorStop(colorPosition, colors[i]);
	}

	ctx.fillStyle = gradient;
	ctx.fillRect(x, top, barWidth, height);

	ctx.strokeStyle = options.textColor;
	ctx.globalAlpha = 0.35;
	ctx.lineWidth = dpr;
	ctx.strokeRect(x + 0.5 * dpr, top + 0.5 * dpr, barWidth - dpr, height - dpr);
	ctx.globalAlpha = 1;

	ctx.fillStyle = options.textColor;
	ctx.font = `${fontSize}px sans-serif`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';

	let maxLabelWidth = 0;

	for (let i = 0; i < BAR_TICKS; i++) {
		const valuePosition = i / (BAR_TICKS - 1);
		const value = options.min + (options.max - options.min) * valuePosition;
		const barPosition = colorScalePosition(value, options.min, options.max, options.scale);
		const label = formatValue(value);
		const y = bottom - barPosition * height;

		ctx.fillText(label, x + barWidth + labelGap, y);
		maxLabelWidth = Math.max(maxLabelWidth, ctx.measureText(label).width);
	}

	if (options.title) {
		// The title reads bottom to top beside the labels, like a Y axis title.
		const titleX = x + barWidth + labelGap + maxLabelWidth + labelGap + titleFontSize;

		ctx.translate(titleX, (top + bottom) / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.font = `bold ${titleFontSize}px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(options.title, 0, 0);
	}

	ctx.restore();
}
