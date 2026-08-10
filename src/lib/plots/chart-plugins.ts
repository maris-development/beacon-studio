/**
 * The canvas plugins of the plot renderer.
 *
 * Both plugins draw on the chart canvas itself, and not in the DOM beside it.
 * That is deliberate: the PNG export writes this canvas out, so anything in the
 * DOM would be missing from the file the user downloads.
 */
import type { Chart, Plugin } from 'chart.js';
import { makePaletteScale, samplePalette } from '@/colors/palettes';
import type { ContourResult } from './contour';

/** The options that the plugins read from the chart config. */
export interface PlotPluginOptions {
	background: {
		color: string;
	};
	contours: {
		display: boolean;
		/** The lines to draw, in data coordinates. Null while none are built. */
		result: ContourResult | null;
		palette: string;
		reverse: boolean;
		lineWidth: number;
		showLabels: boolean;
		labelFontSize: number;
		/** The plot background. A label clears a gap in the line with it. */
		backgroundColor: string;
		textColor: string;
	};
	colorBar: {
		display: boolean;
		title: string;
		min: number;
		max: number;
		palette: string;
		reverse: boolean;
		textColor: string;
		fontSize: number;
	};
}

/** Width of the colour bar, and the gap on both sides of it, in pixels. */
const BAR_WIDTH = 14;
const BAR_GAP = 12;
const LABEL_GAP = 6;

/** How much right padding a chart with a colour bar needs. */
export function colorBarPadding(fontSize: number): number {
	// bar + labels + the rotated title. The label width is an estimate for six
	// digits at this font size, which is enough for the values this app shows.
	return BAR_GAP + BAR_WIDTH + LABEL_GAP + fontSize * 3.5 + fontSize * 1.6;
}

/**
 * Paint the background of the plot.
 *
 * A chart canvas is transparent. On screen the page shows through, and in a PNG
 * export the background is empty. Both must take the colour that the user set,
 * so the fill happens here and not in CSS.
 */
export const backgroundPlugin: Plugin = {
	id: 'plotBackground',

	beforeDraw(chart: Chart, _args, options: PlotPluginOptions['background']) {
		const { ctx } = chart;
		const color = options?.color;
		if (!color) return;

		ctx.save();
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, chart.width, chart.height);
		ctx.restore();
	}
};

/**
 * Draw the contour lines over the points.
 *
 * The lines arrive in data coordinates, so this plugin converts them with the
 * scales of the chart. Therefore a pan, a zoom or a resize redraws the same
 * lines without gridding the data again.
 *
 * Everything is clipped to the convex hull of the points. The gridding invents a
 * value for a cell far from any row, and drawing that would claim knowledge the
 * query does not have.
 */
export const contourPlugin: Plugin = {
	id: 'plotContours',

	afterDatasetsDraw(chart: Chart, _args, options: PlotPluginOptions['contours']) {
		if (!options?.display || !options.result) return;

		const { ctx, chartArea, scales } = chart;
		if (!chartArea || !scales.x || !scales.y) return;

		const { levels, hull, range } = options.result;
		const colorOf = makePaletteScale(options.palette, range.min, range.max, options.reverse);

		const toPixelX = (x: number): number => scales.x.getPixelForValue(x);
		const toPixelY = (y: number): number => scales.y.getPixelForValue(y);

		ctx.save();

		// Clip twice: to the plot area, so a line cannot run over the axes, and to
		// the hull, so it cannot run past the data.
		ctx.beginPath();
		ctx.rect(
			chartArea.left,
			chartArea.top,
			chartArea.right - chartArea.left,
			chartArea.bottom - chartArea.top
		);
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

		ctx.lineWidth = options.lineWidth;
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
			drawContourLabels(ctx, levels, options, toPixelX, toPixelY);
		}

		ctx.restore();
	}
};

/** A ring shorter than this, in pixels, gets no label. The text would not fit. */
const MIN_LABELLED_RING = 80;

function drawContourLabels(
	ctx: CanvasRenderingContext2D,
	levels: ContourResult['levels'],
	options: PlotPluginOptions['contours'],
	toPixelX: (x: number) => number,
	toPixelY: (y: number) => number
): void {
	ctx.font = `${options.labelFontSize}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	for (const level of levels) {
		const label = formatValue(level.value);
		const width = ctx.measureText(label).width;

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
			if (Math.hypot(x - start, y - startY) < MIN_LABELLED_RING) continue;

			// Clear a gap in the line, so the text does not sit on top of it.
			ctx.fillStyle = options.backgroundColor;
			ctx.fillRect(
				x - width / 2 - 2,
				y - options.labelFontSize / 2 - 1,
				width + 4,
				options.labelFontSize + 2
			);

			ctx.fillStyle = options.textColor;
			ctx.fillText(label, x, y);
		}
	}
}

/** How many colour stops the gradient of the bar uses. */
const GRADIENT_STOPS = 32;

/** How many labelled ticks the bar shows, the two ends included. */
const BAR_TICKS = 5;

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
export const colorBarPlugin: Plugin = {
	id: 'plotColorBar',

	afterDraw(chart: Chart, _args, options: PlotPluginOptions['colorBar']) {
		if (!options?.display) return;

		const { ctx, chartArea } = chart;
		if (!chartArea) return;

		const top = chartArea.top;
		const bottom = chartArea.bottom;
		const height = bottom - top;
		if (height <= 0) return;

		const x = chartArea.right + BAR_GAP;

		ctx.save();

		// The gradient runs bottom to top, so the maximum sits at the top of the
		// bar. That matches the Y axis and how a reader expects a scale to run.
		const gradient = ctx.createLinearGradient(0, bottom, 0, top);
		const colors = samplePalette(options.palette, GRADIENT_STOPS, options.reverse);

		for (let i = 0; i < colors.length; i++) {
			gradient.addColorStop(i / (colors.length - 1), colors[i]);
		}

		ctx.fillStyle = gradient;
		ctx.fillRect(x, top, BAR_WIDTH, height);

		ctx.strokeStyle = options.textColor;
		ctx.globalAlpha = 0.35;
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, top + 0.5, BAR_WIDTH - 1, height - 1);
		ctx.globalAlpha = 1;

		ctx.fillStyle = options.textColor;
		ctx.font = `${options.fontSize}px sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';

		let maxLabelWidth = 0;

		for (let i = 0; i < BAR_TICKS; i++) {
			const t = i / (BAR_TICKS - 1);
			const value = options.min + (options.max - options.min) * t;
			const label = formatValue(value);
			const y = bottom - t * height;

			ctx.fillText(label, x + BAR_WIDTH + LABEL_GAP, y);
			maxLabelWidth = Math.max(maxLabelWidth, ctx.measureText(label).width);
		}

		if (options.title) {
			// The title reads bottom to top beside the labels, like a Y axis title.
			const titleX = x + BAR_WIDTH + LABEL_GAP + maxLabelWidth + LABEL_GAP + options.fontSize;

			ctx.translate(titleX, (top + bottom) / 2);
			ctx.rotate(-Math.PI / 2);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(options.title, 0, 0);
		}

		ctx.restore();
	}
};
