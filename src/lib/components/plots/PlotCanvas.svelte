<!--
	PlotCanvas draws one plot with uPlot.

	The component owns the chart instance and nothing else. It reads a
	{@link PlotConfig} and a {@link PlotSeries}, and it never touches the query,
	the storage or the arrow table. Therefore the configuration panel and the
	export button can both work against the same component.

	uPlot draws the axes, the grid, the ticks and the tick labels. This component
	draws the rest on the same canvas through the draw hooks: the background, the
	points, the contour lines, the colour bar and the title. See `uplot-render.ts`.

	The instance is rebuilt, not patched, on every change of the plot or the data.
	Many uPlot options are read once at construction (the axis type, the reverse
	direction, the fonts, the padding), so a partial update cannot reach them. A
	rebuild is cheap: uPlot draws a chart of many points in a few milliseconds, and
	the panel commits its edits once, on Apply, not on every keystroke.

	The rebuild runs after the browser has painted. Drawing the points walks every
	row, so at several hundred thousand rows it must not run inside the render pass
	that a navigation is waiting on: the caller wants its spinner on screen first.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { axisTitle, usesZColumn, type PlotConfig } from '@/plots/plot-config';
	import {
		CROSS_SECTION_AXIS_LABEL,
		HISTOGRAM_AXIS_LABEL,
		resolveRange,
		type PlotSeries
	} from '@/plots/plot-data';
	import { colormapsReady, loadColormaps } from '@/colors/palettes';
	import {
		colorBarPadding,
		drawBackground,
		drawBars,
		drawColorBar,
		drawContours,
		drawGroupLegend,
		drawLines,
		drawPoints,
		drawTitle,
		gridColor,
		groupColors
	} from '@/plots/uplot-render';
	import type { ContourResult } from '@/plots/contour';

	let {
		plot,
		series,
		contours = null,
		message = null,
		onBusyChange = undefined
	}: {
		plot: PlotConfig;
		/** The numbers to draw. Null while the plot cannot draw. */
		series: PlotSeries | null;
		/** The contour lines, in data coordinates. Null while the plot draws none. */
		contours?: ContourResult | null;
		/** Why the plot cannot draw. Shown in place of the canvas. */
		message?: string | null;
		/**
		 * Reports the drawing state. Building the points and painting them is the
		 * slowest step of the page, so the caller shows a spinner over it.
		 */
		onBusyChange?: (busy: boolean) => void;
	} = $props();

	let container: HTMLDivElement | null = null;
	let chart: uPlot | null = null;

	/**
	 * Flips once the colormap file has loaded. The colours are read
	 * synchronously, so the chart must build again after the load. Until then a
	 * plot draws with the fallback palette.
	 */
	let palettesLoaded = $state(colormapsReady());

	onMount(() => {
		loadColormaps().then(() => {
			palettesLoaded = true;
		});

		// A resize keeps the same options, so it only resizes the instance. That
		// redraws every point, but a resize is rare and needs no rebuild.
		const observer = new ResizeObserver(() => onResize());
		if (container) observer.observe(container);

		return () => observer.disconnect();
	});

	onDestroy(() => {
		if (rebuildHandle !== null) cancelAnimationFrame(rebuildHandle);
		chart?.destroy();
		chart = null;
	});

	// Rebuild the chart when the plot, the data, the contours or the palette
	// change. The reads below are the dependencies of this effect.
	$effect(() => {
		void [plot, plot.z?.scale, series, contours, palettesLoaded];
		scheduleRebuild();
	});

	let rebuildHandle: number | null = null;

	/**
	 * Rebuild the chart after the browser has painted.
	 *
	 * The frame callback runs before the next paint and the timeout inside it
	 * after, which is what puts the work on the far side of that paint. Therefore
	 * the spinner is on screen before the main thread is taken.
	 */
	function scheduleRebuild() {
		onBusyChange?.(true);

		if (rebuildHandle !== null) cancelAnimationFrame(rebuildHandle);

		rebuildHandle = requestAnimationFrame(() => {
			rebuildHandle = null;
			setTimeout(rebuild, 0);
		});
	}

	function size(): { width: number; height: number } {
		if (!container) return { width: 0, height: 0 };
		return { width: container.clientWidth, height: container.clientHeight };
	}

	function rebuild() {
		chart?.destroy();
		chart = null;

		if (!container || !series) {
			onBusyChange?.(false);
			return;
		}

		const { width, height } = size();
		if (width === 0 || height === 0) {
			// Not laid out yet. The resize observer rebuilds once it is.
			onBusyChange?.(false);
			return;
		}

		chart = new uPlot(buildOptions(series, width, height), alignedData(series), container);
		attachWheelZoom(chart);

		// uPlot computes the plot rectangle during construction, before its deferred
		// initial range runs. At that point the scales have no min/max, so the axes
		// are hidden and reserve no gutter — their ticks, values and titles then draw
		// off-canvas. Once the range settles (a microtask later), force one relayout
		// so the shown axes get their space back.
		queueMicrotask(() => chart?.redraw(true, true));

		onBusyChange?.(false);
	}

	/**
	 * The data for uPlot, sorted by X.
	 *
	 * uPlot reads the first and last X of `data[0]` as the range of the X scale,
	 * because it assumes a time series in X order. A scatter is not in X order, so
	 * without this the X axis, its ticks and its labels take a meaningless range.
	 * The points do not need it: they draw from the series through the value of
	 * each axis, not through this array.
	 *
	 * The sort pairs X with Y, so the Y range that uPlot scans over a zoom window
	 * still belongs to the rows in that window. The result is cached by the series
	 * identity, so a style edit does not sort a million rows again.
	 */
	let sortedData: { source: PlotSeries; data: [Float64Array, Float64Array] } | null = null;

	function alignedData(current: PlotSeries): [Float64Array, Float64Array] {
		if (sortedData && sortedData.source === current) return sortedData.data;

		const count = current.x.length;
		const order = new Uint32Array(count);
		for (let i = 0; i < count; i++) order[i] = i;

		const xs = current.x;
		order.sort((a, b) => xs[a] - xs[b]);

		const x = new Float64Array(count);
		const y = new Float64Array(count);

		for (let i = 0; i < count; i++) {
			const source = order[i];
			x[i] = xs[source];
			y[i] = current.y[source];
		}

		sortedData = { source: current, data: [x, y] };
		return sortedData.data;
	}

	/**
	 * Zoom on the mouse wheel, around the pointer.
	 *
	 * uPlot draws no buttons and adds no wheel handler: its only built-in zoom is
	 * a drag to zoom in, and a double click to reset. A wheel that zooms both ways
	 * is the missing half, so this adds it. A scale set here is explicit, so uPlot
	 * applies it straight and the drag zoom and the reset keep working beside it.
	 */
	function attachWheelZoom(instance: uPlot) {
		instance.over.addEventListener(
			'wheel',
			(event) => {
				event.preventDefault();

				const sx = instance.scales.x;
				const sy = instance.scales.y;
				if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return;

				// A notch up zooms in, a notch down zooms out, around the pointer.
				const factor = event.deltaY < 0 ? 0.85 : 1 / 0.85;

				const atX = instance.posToVal(event.offsetX, 'x');
				const atY = instance.posToVal(event.offsetY, 'y');

				instance.batch(() => {
					instance.setScale('x', {
						min: atX - (atX - sx.min) * factor,
						max: atX + (sx.max - atX) * factor
					});
					instance.setScale('y', {
						min: atY - (atY - sy.min) * factor,
						max: atY + (sy.max - atY) * factor
					});
				});
			},
			{ passive: false }
		);
	}

	function onResize() {
		const { width, height } = size();
		if (width === 0 || height === 0) return;

		if (chart) {
			chart.setSize({ width, height });
			return;
		}

		// The first layout can arrive after the effect already tried to build.
		if (series) scheduleRebuild();
	}

	/** The title of the X axis. A cross section names its distance itself. */
	function xTitle(): string {
		if (plot.type === 'cross-section') {
			if (plot.x.label) return plot.x.label;
			return CROSS_SECTION_AXIS_LABEL;
		}

		return axisTitle(plot.x);
	}

	/** The title of the Y axis. A histogram counts rows, so it names the count. */
	function yTitle(): string {
		if (plot.type === 'histogram') {
			if (plot.y.label) return plot.y.label;
			return HISTOGRAM_AXIS_LABEL;
		}

		return axisTitle(plot.y);
	}

	/** Use a custom legend title when set, otherwise retain the chart-specific label. */
	function legendTitle(fallback: string): string {
		const customTitle = plot.style.legendTitle.trim();
		if (customTitle) return customTitle;
		return fallback;
	}

	/**
	 * Build the scale of one axis.
	 *
	 * uPlot auto-ranges the data and rounds the ends to readable tick values. That
	 * default also drives the drag-to-zoom: a zoom sets the scale min and max, and
	 * the next redraw reads them. A `range` that returned fixed ends would undo the
	 * zoom on every frame and leave the ticks at raw, unrounded values.
	 *
	 * Therefore a `range` function is attached only when the user pinned an end.
	 * It honours that end and leaves the other to the incoming value, which is the
	 * data extent at first draw and the zoom window after a drag.
	 */
	function scaleFor(axis: 'x' | 'y', time: boolean): uPlot.Scale {
		const config = plot[axis];
		const scale: uPlot.Scale = { time, dir: config.reverse ? -1 : 1 };

		// A bar grows from zero, so the count axis must reach it. uPlot would
		// otherwise fit the range to the counts and cut the foot off every bar.
		const floorAtZero = plot.type === 'histogram' && axis === 'y';

		if (config.min !== null || config.max !== null || floorAtZero) {
			scale.range = (_u, dataMin, dataMax) => {
				let min = config.min ?? dataMin;
				if (floorAtZero && config.min === null) min = 0;
				return [min, config.max ?? dataMax];
			};
		}

		return scale;
	}

	/**
	 * Build the options of one axis.
	 *
	 * uPlot merges an axis over its defaults with a plain key copy. A key that
	 * holds `undefined` still wins, so it replaces the default instead of keeping
	 * it. A `labelSize` of `undefined` then makes the reserved gutter `NaN`, and
	 * the axis title lands off the canvas. Therefore the title keys are only set
	 * when there is a title.
	 */
	function axisOptions(
		axis: 'x' | 'y',
		title: string,
		style: PlotConfig['style'],
		grid: string
	): uPlot.Axis {
		const options: uPlot.Axis = {
			scale: axis,
			stroke: style.textColor,
			font: `${style.tickFontSize}px sans-serif`,
			grid: { show: style.gridlines, stroke: grid, width: 1 },
			ticks: { show: true, stroke: grid, width: 1 }
		};

		if (axis === 'y') options.side = 3;

		if (title) {
			let titleFontSize = style.xAxisTitleFontSize;
			if (axis === 'y') titleFontSize = style.yAxisTitleFontSize;

			options.label = title;
			options.labelFont = `${titleFontSize}px sans-serif`;
			options.labelSize = titleFontSize + 8;
		}

		return options;
	}

	function buildOptions(current: PlotSeries, width: number, height: number): uPlot.Options {
		const style = plot.style;
		const grid = gridColor(style.textColor);

		const showColorBar = !!current.z && !!current.zRange && usesZColumn(plot.type);

		let rightPad = 8;
		if (showColorBar) rightPad = colorBarPadding(style.tickFontSize, style.legendTitleFontSize);

		let topPad = 6;
		if (plot.title) topPad = style.titleFontSize + 10;

		let colorBarRange = { min: 0, max: 1 };
		if (current.zRange) {
			colorBarRange = resolveRange(current.zRange, plot.z?.min ?? null, plot.z?.max ?? null);
		}

		return {
			width,
			height,
			ms: 1,
			padding: [topPad, rightPad, 6, 6],
			legend: { show: false },
			// Default uPlot interaction: drag a box to zoom, click to reset. The
			// crosshair helps read a position off the axes. There is no tooltip.
			cursor: { drag: { x: true, y: true } },
			scales: {
				x: scaleFor('x', current.xKind === 'timestamp'),
				y: scaleFor('y', current.yKind === 'timestamp')
			},
			axes: [axisOptions('x', xTitle(), style, grid), axisOptions('y', yTitle(), style, grid)],
			series: [{}, { scale: 'y', paths: () => null, points: { show: false } }],
			hooks: {
				drawClear: [(u) => drawBackground(u, style.backgroundColor)],
				draw: [
					(u) => {
						// One branch per plot type. Each one owns the whole of the data
						// area, so they never draw over each other.
						if (plot.type === 'histogram') {
							drawBars(u, current, plot);
						} else if (plot.type === 'line') {
							drawLines(u, current, plot);

							if (current.groups) {
								drawGroupLegend(u, {
									groups: current.groups,
									colors: groupColors(
										style.palette,
										current.groups.length,
										plot.z?.reverse ?? false
									),
									textColor: style.textColor,
									backgroundColor: style.backgroundColor,
									title: legendTitle(plot.line.groupColumn ?? ''),
									titleFontSize: style.legendTitleFontSize,
									fontSize: style.tickFontSize,
									droppedGroups: current.droppedGroups
								});
							}
						} else {
							drawPoints(u, current, plot);
						}

						if (contours && plot.contour.enabled && usesZColumn(plot.type)) {
							drawContours(u, {
								result: contours,
								palette: style.palette,
								reverse: plot.z?.reverse ?? false,
								scale: plot.z?.scale ?? 'linear',
								lineWidth: plot.contour.lineWidth,
								showLabels: plot.contour.showLabels,
								labelFontSize: plot.contour.labelFontSize,
								backgroundColor: style.backgroundColor,
								textColor: style.textColor
							});
						}

						if (showColorBar) {
							drawColorBar(u, {
								title: legendTitle(axisTitle(plot.z)),
								min: colorBarRange.min,
								max: colorBarRange.max,
								palette: style.palette,
								reverse: plot.z?.reverse ?? false,
								scale: plot.z?.scale ?? 'linear',
								textColor: style.textColor,
								fontSize: style.tickFontSize,
								titleFontSize: style.legendTitleFontSize
							});
						}

						drawTitle(u, plot.title, style.textColor, style.titleFontSize);
					}
				]
			}
		};
	}

	/**
	 * Write the plot to a PNG file.
	 *
	 * The canvas is the whole picture: the background, the contours and the colour
	 * bar are all drawn on it, and not in the DOM beside it. Therefore the export
	 * is the canvas itself, and it matches the screen exactly.
	 *
	 * uPlot renders at the device pixel ratio, so the file comes out at the
	 * resolution of the screen, not at CSS size.
	 *
	 * Returns false when there is nothing to export.
	 */
	export function exportPng(fileName: string): boolean {
		if (!chart || !series) return false;

		const url = chart.ctx.canvas.toDataURL('image/png');

		const link = document.createElement('a');
		link.href = url;
		link.download = `${safeFileName(fileName)}.png`;
		link.click();

		return true;
	}

	/** Strip the characters that a file system refuses. */
	function safeFileName(name: string): string {
		const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim();
		return cleaned || 'plot';
	}
</script>

<div class="plot-canvas" style="--plot-background: {plot.style.backgroundColor};">
	<div class="plot-host" bind:this={container} aria-label={plot.title || plot.name}></div>

	{#if message}
		<div class="plot-message">
			<p>{message}</p>
		</div>
	{/if}
</div>

<style lang="scss">
	.plot-canvas {
		position: relative;
		flex-grow: 1;
		min-height: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		background-color: var(--plot-background, #ffffff);

		.plot-host {
			width: 100%;
			height: 100%;

			// uPlot sizes its own canvas to the host. Let it fill the box.
			:global(.uplot),
			:global(.u-wrap) {
				width: 100%;
				height: 100%;
			}
		}

		.plot-message {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 2rem;
			text-align: center;
			background-color: var(--plot-background, #ffffff);

			p {
				max-width: 34rem;
				color: var(--muted-foreground, #6b7280);
			}
		}
	}
</style>
