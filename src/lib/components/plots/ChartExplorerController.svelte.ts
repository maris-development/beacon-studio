/**
 * ChartExplorerController — everything the chart explorer does with the query
 * result and the plots. The page keeps only its markup, the query effect and the
 * bindings to this class. It follows {@link MapViewController}, so the two
 * visualisation pages read the same way.
 *
 * The class owns three things:
 *
 *   the result       the arrow table of the active block, and the columns that a
 *                    plot can put on an axis.
 *   the plots        the {@link ChartViewState} of the active block. Every edit
 *                    from the panel goes through a method here.
 *   the numbers      the {@link PlotSeries} of the active plot, derived from the
 *                    two above.
 *
 * The series is the expensive part: it walks every row. Therefore the derivation
 * keys on {@link seriesKey}, a string of the choices that decide the values. A
 * change of palette or of font size leaves that string alone, so the rows are
 * not walked again.
 *
 * The class runs no effects. A page owns its effects, and this class exposes
 * plain methods and runes for them to drive.
 */
import { untrack } from 'svelte';
import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
import type { CompiledQuery } from '@/beacon-api/types';
import { addToast } from '@/stores/toasts';
import type { SpatialSelection } from '@/geo/spatial-selection';
import {
	clonePlotConfig,
	makeChartViewState,
	makePlotConfig,
	nextPlotName,
	normaliseChartView,
	pruneMissingColumns,
	usesXColumn,
	usesYColumn,
	usesZColumn,
	type ChartViewState,
	type PlotConfig
} from '@/plots/plot-config';
import {
	buildPlotSeries,
	groupableColumns,
	plottableColumns,
	resolveRange,
	type PlotDataResult,
	type PlotSeries
} from '@/plots/plot-data';
import { buildContours, type ContourResult } from '@/plots/contour';

export class ChartExplorerController {
	/** The raw query result of the active block. */
	entry = $state.raw<DatasetEntry | null>(null);
	isLoading = $state(false);

	/**
	 * The block that {@link viewStateFor} reports on. The page restores the plots
	 * of a block, and writes the plots of a block back. Both must name the same
	 * block. Without this id the write of the old plots could reach the new
	 * block, because the two effects of the page can run in any order.
	 */
	private viewBlockId: string | null = $state(null);

	/** The plots of the active block. Null before the first block loads. */
	private view = $state<ChartViewState | null>(null);

	/** The area drawn on the map. A cross section plot reads its line. */
	private selection = $state.raw<SpatialSelection | null>(null);

	readonly table = $derived(this.entry?.table ?? null);
	readonly rowCount = $derived(this.entry?.rowCount ?? 0);
	readonly durationMs = $derived(this.entry?.duration ?? 0);

	/** The columns that a plot can put on an axis. */
	readonly columns = $derived(plottableColumns(this.table));

	/**
	 * The columns that can split a line plot into groups. Wider than
	 * {@link columns}: a station name is text, and it still labels a stroke.
	 */
	readonly groupColumns = $derived(groupableColumns(this.table));

	readonly plots = $derived<ReadonlyArray<PlotConfig>>(this.view?.plots ?? []);

	readonly activePlot = $derived<PlotConfig | null>(
		this.view?.plots.find((plot) => plot.id === this.view?.activePlotId) ?? null
	);

	/** True when the query carries a cross section line that a plot can use. */
	readonly hasCrossSection = $derived(
		this.selection?.mode === 'cross-section' && (this.selection?.line?.length ?? 0) >= 2
	);

	/**
	 * The choices that decide the values of the plot, as one string.
	 *
	 * A style edit replaces the plot object but leaves this string alone. A
	 * derived only wakes its readers when its value really changed, so
	 * {@link schedulePrepare} is not asked to rebuild for a new colour.
	 *
	 * The page reads this to know when a rebuild is due.
	 */
	readonly seriesKey = $derived.by(() => {
		const plot = this.activePlot;
		if (!plot) return null;

		return [
			plot.id,
			plot.type,
			plot.x.column,
			plot.y.column,
			plot.z?.column ?? null,
			// A line orders its rows here, so the group and the direction change the
			// values. A histogram counts them here, over the pinned X range, so the
			// bin count and both ends do. On every other type the X range only moves
			// the scale of the chart, and must not cost a walk of the rows.
			plot.line.groupColumn,
			plot.line.sortBy,
			this.binningKey(plot),
			JSON.stringify(this.selection?.line ?? null)
		].join('|');
	});

	private binningKey(plot: PlotConfig): string {
		if (plot.type !== 'histogram') return '';
		return `${plot.histogram.binCount}:${plot.x.min}:${plot.x.max}`;
	}

	/**
	 * The numbers of the active plot, or the reason it cannot draw.
	 *
	 * Plain state, not a derived. A derived would run inside the render pass, and
	 * for a result of several hundred thousand rows that walk costs long enough
	 * that the browser never paints the page. The user would sit on the previous
	 * page, with a frozen window, until the whole chart was ready.
	 *
	 * {@link schedulePrepare} fills this in after a paint instead.
	 */
	data = $state.raw<PlotDataResult | null>(null);

	readonly series = $derived.by(() => {
		const result = this.data;
		if (result?.ok) return result.series;
		return null;
	});

	/**
	 * The settings that decide the contour lines, as one string. Null while the
	 * plot draws none.
	 *
	 * The axis ranges are in the key: they set the extent of the grid, so a change
	 * to them moves every line. The palette and the line width are not: those
	 * change how a line looks, and the plugin reads them at draw time.
	 */
	readonly contourKey = $derived.by(() => {
		const plot = this.activePlot;
		if (!plot?.contour.enabled || !usesZColumn(plot.type)) return null;

		return [
			plot.id,
			plot.contour.levelCount,
			plot.contour.gridResolution,
			plot.x.min,
			plot.x.max,
			plot.y.min,
			plot.y.max,
			plot.z?.min,
			plot.z?.max,
			plot.z?.scale
		].join('|');
	});

	/**
	 * The contour lines of the active plot, in data coordinates. Built beside the
	 * series, and for the same reason not derived: the gridding walks every row.
	 */
	contours = $state.raw<ContourResult | null>(null);

	/** Why the plot cannot draw, or null. */
	readonly message = $derived.by(() => {
		if (!this.table) return 'Loading rows…';
		if (this.isPreparing) return null;

		const result = this.data;
		if (result?.ok === false) return result.message;
		return null;
	});

	// --------------------------------------------------------------- preparing

	/** True while the numbers are being built. */
	private isPreparing = $state(false);
	/** True while the canvas is building its points and drawing them. */
	private canvasBusy = $state(false);

	/**
	 * True while the plot is not ready to look at. The page shows a spinner over
	 * the canvas, so the user sees the page rather than a frozen window.
	 */
	readonly isBusy = $derived(this.isPreparing || this.canvasBusy);

	private prepareHandle: number | null = null;

	/**
	 * Rebuild the numbers of the plot, after the browser has painted.
	 *
	 * The page calls this from an effect on {@link seriesKey} and
	 * {@link contourKey}. The work walks every row, so it must not run inside the
	 * render pass that the navigation is waiting on.
	 *
	 * The deferral is a frame callback with a timeout inside it. The frame
	 * callback runs before the next paint, and the timeout runs after it.
	 * Therefore the spinner is on screen before the main thread is taken.
	 */
	schedulePrepare(): void {
		this.isPreparing = true;

		if (this.prepareHandle !== null) cancelAnimationFrame(this.prepareHandle);

		this.prepareHandle = requestAnimationFrame(() => {
			this.prepareHandle = null;
			setTimeout(() => this.runPrepare(), 0);
		});
	}

	/** Drop a scheduled rebuild. The page calls this when it goes away. */
	cancelPrepare(): void {
		if (this.prepareHandle === null) return;
		cancelAnimationFrame(this.prepareHandle);
		this.prepareHandle = null;
	}

	/** The canvas reports when it starts and finishes drawing. */
	setCanvasBusy(busy: boolean): void {
		this.canvasBusy = busy;
	}

	private runPrepare(): void {
		const table = this.table;
		const plot = this.activePlot;

		if (!table || !plot) {
			this.data = null;
			this.contours = null;
			this.isPreparing = false;
			return;
		}

		this.data = buildPlotSeries(table, plot, { selection: this.selection });

		let series: PlotSeries | null = null;
		if (this.data.ok) series = this.data.series;

		if (series && plot.contour.enabled && usesZColumn(plot.type)) {
			this.contours = buildContours(
				series,
				plot,
				resolveRange(series.xRange, plot.x.min, plot.x.max),
				resolveRange(series.yRange, plot.y.min, plot.y.max)
			);
		} else {
			this.contours = null;
		}

		this.isPreparing = false;
	}

	constructor(
		private markRunning: (running: boolean) => void = () => {},
		private markRun: (rows: number) => void = () => {}
	) {}

	// --------------------------------------------------------------- view state

	/**
	 * Restore the plots of a block, and the area that its query filters on.
	 *
	 * Call this method at every change of block, also for a block with no stored
	 * plots. That block gets one default plot, and does not keep the plots of the
	 * block before it.
	 */
	applyViewState(
		blockId: string | null,
		view: ChartViewState | null | undefined,
		selection: SpatialSelection | null
	): void {
		this.viewBlockId = blockId;
		this.selection = selection;
		this.view = normaliseChartView(view) ?? makeChartViewState([makePlotConfig()]);

		// A result may already be loaded, for example after a return to a block
		// that ran before. Its columns must reach the new plot at once.
		this.syncPlotToColumns();
	}

	/**
	 * Follow the area that the query filters on.
	 *
	 * The page calls this on every run, and not only on a change of block. A user
	 * can apply a new cross section to the same block, and the X values of a cross
	 * section plot come from that line.
	 */
	setSelection(selection: SpatialSelection | null): void {
		if (JSON.stringify(this.selection) === JSON.stringify(selection)) return;
		this.selection = selection;
	}

	/**
	 * The plots of a block, for the page to persist. Returns null when this
	 * controller does not hold the plots of that block now.
	 *
	 * The page reads this method from an effect. The two effects of the page can
	 * run in any order, so without the id test a read before
	 * {@link applyViewState} would write the plots of the block before this one
	 * onto the new block.
	 */
	viewStateFor(blockId: string | null): ChartViewState | null {
		// Read the rune first. Therefore the effect of the caller depends on it,
		// also on a call that returns null.
		const state = this.view;

		if (!blockId || blockId !== this.viewBlockId) return null;
		return state;
	}

	// ------------------------------------------------------------- query cycle

	/** Run a query and show it. */
	async runAndShowQuery(query: CompiledQuery, blockId: string): Promise<void> {
		this.isLoading = true;
		this.markRunning(true);

		try {
			this.entry = await BeaconClient.ensureQuery(query, blockId);
			this.markRun(this.entry.rowCount);
			this.isLoading = false;

			if (this.entry.rowCount === 0) {
				addToast({ type: 'info', message: 'Query executed successfully but returned no data.' });
				return;
			}

			this.syncPlotToColumns();
		} catch (error) {
			console.error('Failed to execute query:', error);
			this.isLoading = false;
			this.markRunning(false);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${(error as Error).message}`
			});
		}
	}

	/**
	 * Show the cached result of a query at once, before the run starts. The page
	 * stays empty when the cache has no result for this key.
	 */
	showQueryFromCache(datasetKey: string | null): void {
		this.entry = (datasetKey && BeaconClient.peekQueryByKey(datasetKey)) || null;
		if (this.entry) this.syncPlotToColumns();
	}

	/** Remove the current result. */
	clearQueryResult(): void {
		this.entry = null;
		this.isLoading = false;
	}

	/**
	 * Fit the active plot to the columns of the current result: drop a column that
	 * the result no longer holds, and fill an empty axis.
	 *
	 * The seed makes the page show a plot at once, instead of an empty canvas
	 * beside three empty selectors.
	 */
	private syncPlotToColumns(): void {
		const plot = untrack(() => this.activePlot);
		const available = untrack(() => this.columns);

		if (!plot || available.length === 0) return;

		const names = available.map((column) => column.name);
		const groupNames = untrack(() => this.groupColumns).map((column) => column.name);

		let next = pruneMissingColumns(plot, names, groupNames);

		if (!next.x.column && usesXColumn(next.type)) {
			next = { ...next, x: { ...next.x, column: names[0] } };
		}

		if (!next.y.column && usesYColumn(next.type)) {
			next = { ...next, y: { ...next.y, column: names[1] ?? names[0] } };
		}

		if (next !== plot) this.updatePlot(next);
	}

	// ------------------------------------------------------- the list of plots

	selectPlot(id: string): void {
		const view = this.view;
		if (!view || view.activePlotId === id) return;

		this.view = { ...view, activePlotId: id };

		// The new plot may be older than the current result, or never configured.
		this.syncPlotToColumns();
	}

	/** Add an empty plot after the others, and select it. */
	addPlot(): void {
		const view = this.view;
		if (!view) return;

		const plot = makePlotConfig({ name: nextPlotName(view.plots) });

		this.view = { ...view, plots: [...view.plots, plot], activePlotId: plot.id };
		this.syncPlotToColumns();
	}

	/** Put an independent copy of the active plot after it, and select the copy. */
	duplicateActivePlot(): void {
		const view = this.view;
		const source = this.activePlot;
		if (!view || !source) return;

		const copy = clonePlotConfig(source, { name: nextPlotName(view.plots) });
		const plots = [...view.plots];
		plots.splice(view.plots.indexOf(source) + 1, 0, copy);

		this.view = { ...view, plots, activePlotId: copy.id };
	}

	/**
	 * Remove a plot. The last plot stays: the page has nothing to show without
	 * one, and the user can empty it instead.
	 */
	removePlot(id: string): void {
		const view = this.view;
		if (!view || view.plots.length <= 1) return;

		const index = view.plots.findIndex((plot) => plot.id === id);
		if (index === -1) return;

		const plots = view.plots.filter((plot) => plot.id !== id);
		let activePlotId = view.activePlotId;

		// The plot that took its place, or the one before it.
		if (activePlotId === id) {
			activePlotId = (plots[index] ?? plots[index - 1] ?? plots[0]).id;
		}

		this.view = { ...view, plots, activePlotId };
	}

	// ------------------------------------------------------------------- edits

	/**
	 * Replace one plot in the list.
	 *
	 * This is the only way a plot changes. The configuration panel edits a draft
	 * of its own and calls this once, from its Apply button: every redraw walks
	 * every point, so the app must not spend one on each nudge of a slider.
	 */
	updatePlot(next: PlotConfig): void {
		const view = this.view;
		if (!view) return;

		this.view = {
			...view,
			plots: view.plots.map((plot) => {
				if (plot.id === next.id) return next;
				return plot;
			})
		};
	}
}
