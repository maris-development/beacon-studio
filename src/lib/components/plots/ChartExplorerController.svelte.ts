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
import { untrack } from "svelte";
import type { BeaconNode } from "@/beacon-api/types";
import type { RunQuery } from "@/query/run-query";
import { isAbortError, queryStore, type DatasetEntry } from "@/stores/query-store.svelte";
import { addToast } from "@/stores/toasts";
import type { CoordinatePair, SpatialSelection } from "@/geo/spatial-selection";
import {
    clonePlotConfig,
    makeChartViewState,
    makePlotConfig,
    needsSampling,
    nextPlotName,
    normaliseChartView,
    pruneMissingColumns,
    usesXColumn,
    usesYColumn,
    basemapLayerOf,
    usesZColumn,
    type ChartViewState,
    type PlotConfig
} from "@/plots/plot-config";
import {
    buildPlotSeries,
    formatSeriesCaption,
    groupableColumns,
    isMapPlot,
    plottableColumns,
    readRowCells,
    resolveRange,
    textColumns,
    type PlotDataResult,
    type PlotRange,
    type PlotRowCell,
    type PlotSeries
} from "@/plots/plot-data";
import { buildContours, type ContourResult } from "@/plots/contour";
import {
    buildInterpolationField,
    autoGridCells,
    dataSpacing,
    scaleLengthsOf,
    buildInterpolationSurface,
    colourRangeOf,
    type AxisLengths,
    type InterpolationResult
} from "@/plots/interpolation";
import {
    landDetailForSpan,
    loadGeography,
    loadLand,
    type Geography,
    type Land,
    type LandDetail
} from "@/geo/land";
import { samplePlotSeries } from "@/plots/sampling";
import { getSettings } from "@/stores/settings";
import { describeQuery, track } from "@/telemetry";
import { message, type Message } from "@/i18n";

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
    /** The stored coordinate pair of the block. A cross section plot reads it. */
    private coordinateColumns = $state.raw<CoordinatePair | null>(null);

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

    /** The columns of text that can colour a scatter, one colour per value. */
    readonly textColumns = $derived(textColumns(this.table));

    /** True when the column holds text, so it colours by group and not by a colour scale. */
    isTextColumn(name: string | null | undefined): boolean {
        return !!name && this.textColumns.includes(name);
    }

    /**
     * The cells of one row of the result, for the hover tooltip. `skip` holds the
     * columns that the tooltip shows already.
     */
    rowCells(row: number, skip: ReadonlyArray<string>, limit: number): PlotRowCell[] {
        const table = this.table;
        if (!table) return [];
        return readRowCells(table, row, skip, limit);
    }

    readonly plots = $derived<ReadonlyArray<PlotConfig>>(this.view?.plots ?? []);

    readonly activePlot = $derived<PlotConfig | null>(
        this.view?.plots.find((plot) => plot.id === this.view?.activePlotId) ?? null
    );

    /** True when the query carries a cross section line that a plot can use. */
    readonly hasCrossSection = $derived(
        this.selection?.mode === "cross-section" && (this.selection?.line?.length ?? 0) >= 2
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
            JSON.stringify(this.selection?.line ?? null),
            JSON.stringify(this.coordinateColumns)
        ].join("|");
    });

    private binningKey(plot: PlotConfig): string {
        if (plot.type !== "histogram") return "";
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
     * The numbers that the canvas draws: {@link series}, or a sample of it.
     *
     * A scatter draws one mark per row, so a result of millions of rows must not
     * reach the canvas whole. The contours and the interpolation surface still
     * read the full series: they grid the data, so a sample there would cost
     * accuracy and save nothing.
     */
    displaySeries = $state.raw<PlotSeries | null>(null);

    /**
     * The counts in the caption of the plot. Null while the plot has no numbers.
     *
     * The canvas draws this, so the PNG export carries it as well.
     */
    readonly caption = $derived.by((): Message | null => {
        const series = this.series;
        const display = this.displaySeries;
        if (!series || !display) return null;

        return formatSeriesCaption(this.rowCount, series, display);
    });

    /**
     * True when the plot is a map: longitude on X and latitude on Y. Only a map
     * plot draws a basemap, and keeps its interpolation on the land or the sea side.
     *
     * The panel passes its draft and no series, so the choice shows before Apply.
     * With a series, the values must also fit the globe.
     */
    isMapPlot(plot: PlotConfig, series: PlotSeries | null = null): boolean {
        return isMapPlot(
            plot,
            this.coordinateColumns,
            this.columns.map((column) => column.name),
            series
        );
    }

    /** True when the active plot is a map, checked on its values too. */
    readonly mapPlot = $derived.by(() => {
        const plot = this.activePlot;
        const series = this.series;
        return !!plot && !!series && this.isMapPlot(plot, series);
    });

    /** The axis ranges of a plot over the active series, or null before the series. */
    private rangesOf(plot: PlotConfig): { x: PlotRange; y: PlotRange } | null {
        const series = this.series;
        if (!series) return null;

        return {
            x: resolveRange(series.xRange, plot.x.min, plot.x.max),
            y: resolveRange(series.yRange, plot.y.min, plot.y.max)
        };
    }

    /**
     * The radius from the spacing of the points, by the axes it came from. The
     * rebuild finds it, and the panel reads it for its automatic values.
     */
    private spacing = $state.raw<{ key: string; lengths: AxisLengths } | null>(null);
    /** The result and the series choices that {@link spacing} came from. */
    private spacingSource: { table: DatasetEntry["table"]; seriesKey: string | null } | null = null;

    /** The axes that decide the spacing of the points, as one string. */
    private spacingKey(plot: PlotConfig): string {
        return [
            plot.x.column,
            plot.y.column,
            plot.x.min,
            plot.x.max,
            plot.y.min,
            plot.y.max,
            this.isMapPlot(plot)
        ].join("|");
    }

    /**
     * The automatic radius of a plot: in km on a map, in axis units otherwise.
     * Null until a rebuild with these axes found it.
     */
    autoLengthsOf(plot: PlotConfig): AxisLengths | null {
        const spacing = this.spacing;
        if (!spacing || spacing.key !== this.spacingKey(plot)) return null;
        return spacing.lengths;
    }

    /** The automatic grid size of a plot. Null until the automatic radius is known. */
    autoGridCellsOf(plot: PlotConfig): { x: number; y: number } | null {
        const auto = this.autoLengthsOf(plot);
        const ranges = this.rangesOf(plot);
        if (!auto || !ranges) return null;

        const map = this.isMapPlot(plot);
        let base = auto;
        if (plot.interpolation.method === "barnes") {
            base = scaleLengthsOf(plot.interpolation, auto, map).radius;
        }
        return autoGridCells(base, ranges.x, ranges.y, map);
    }

    /** The Natural Earth detail of a map plot: the chosen one, or one from the size of the map. */
    private landDetailOf(plot: PlotConfig, xRange: PlotRange, yRange: PlotRange): LandDetail {
        if (plot.basemap.detail !== "auto") return plot.basemap.detail;
        return landDetailForSpan(Math.max(xRange.max - xRange.min, yRange.max - yRange.min));
    }

    /**
     * The settings that decide the interpolated field, as one string. The
     * surface and the contour lines both trace this field.
     *
     * The axis ranges are in the key: they set the extent of the grid. The
     * basemap detail is in it too, because the land or sea domain uses its coast.
     */
    private fieldKey(plot: PlotConfig): string {
        const settings = plot.interpolation;
        let domain = "all";
        if (this.isMapPlot(plot)) domain = `${settings.domain}:${plot.basemap.detail}`;

        return [
            plot.id,
            settings.method,
            settings.xGridCells,
            settings.yGridCells,
            settings.smoothness,
            settings.scaleLength,
            settings.scaleLengthY,
            settings.extent,
            settings.maxDistance,
            settings.maxDistanceY,
            domain,
            plot.x.min,
            plot.x.max,
            plot.y.min,
            plot.y.max
        ].join("|");
    }

    /**
     * The settings that decide the contour lines, as one string. Null while the
     * plot draws none.
     *
     * The palette and the line width are not in the key: those change how a line
     * looks, and the plugin reads them at draw time.
     */
    readonly contourKey = $derived.by(() => {
        const plot = this.activePlot;
        if (!plot?.contour.enabled || !usesZColumn(plot.type)) return null;

        return [
            this.fieldKey(plot),
            plot.contour.levelCount,
            plot.z?.min,
            plot.z?.max,
            plot.z?.scale
        ].join("|");
    });

    readonly interpolationKey = $derived.by(() => {
        const plot = this.activePlot;
        if (!plot?.interpolation.enabled || !usesZColumn(plot.type)) return null;

        return [
            this.fieldKey(plot),
            plot.interpolation.percentileMin,
            plot.interpolation.percentileMax,
            plot.interpolation.colourMode,
            plot.interpolation.bandCount,
            plot.z?.min,
            plot.z?.max,
            plot.z?.scale
        ].join("|");
    });

    /**
     * The contour lines of the active plot, in data coordinates. Built beside the
     * series, and for the same reason not derived: the gridding walks every row.
     */
    contours = $state.raw<ContourResult | null>(null);

    /** The interpolated value field of the active plot, in data coordinates. */
    interpolation = $state.raw<InterpolationResult | null>(null);

    /**
     * The land and borders of a map plot. The canvas draws the basemap from it,
     * and clips to the land or sea domain with it. Null while the plot needs none.
     */
    geography = $state.raw<Geography | null>(null);

    /**
     * The geography that the active plot needs, as `detail` or `detail+borders`,
     * or null. A map loads it for its basemap, and for a land or sea domain.
     *
     * The page loads it with {@link applyGeography}, apart from the rebuild: a
     * basemap switch must not walk the rows again.
     */
    readonly geographyRequest = $derived.by((): string | null => {
        const plot = this.activePlot;
        const ranges = plot ? this.rangesOf(plot) : null;
        if (!plot || !ranges || !this.mapPlot) return null;

        const analysis =
            usesZColumn(plot.type) && (plot.interpolation.enabled || plot.contour.enabled);
        const layer = basemapLayerOf(plot);
        if (layer === "none" && !(analysis && plot.interpolation.domain !== "all")) return null;

        const detail = this.landDetailOf(plot, ranges.x, ranges.y);
        if (layer === "borders") return `${detail}+borders`;
        return detail;
    });

    private geographyToken = 0;

    /** Load the geography of {@link geographyRequest}, or clear it for null. A newer call wins. */
    async applyGeography(request: string | null): Promise<void> {
        const token = ++this.geographyToken;

        if (!request) {
            this.geography = null;
            return;
        }

        const [detail, borders] = request.split("+");

        try {
            const geography = await loadGeography(detail as LandDetail, borders === "borders");
            if (token === this.geographyToken) this.geography = geography;
        } catch (error) {
            if (token !== this.geographyToken) return;
            this.geography = null;
            addToast({ key: "plot.error.basemapFailed", message: String(error), type: "error" });
        }
    }

    /** Why the plot cannot draw, or null. */
    readonly message = $derived.by((): Message | null => {
        if (!this.table) return message("visualisation.loadingRows");
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

    /** The number of the newest rebuild. A rebuild that waits for the coastlines checks it. */
    private prepareToken = 0;

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
            setTimeout(() => void this.runPrepare(), 0);
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

    private async runPrepare(): Promise<void> {
        const token = ++this.prepareToken;
        const table = this.table;
        const plot = this.activePlot;
        const seriesKey = this.seriesKey;

        if (!table || !plot) {
            this.data = null;
            this.displaySeries = null;
            this.contours = null;
            this.interpolation = null;
            this.isPreparing = false;
            return;
        }

        const data = buildPlotSeries(table, plot, {
            selection: this.selection,
            coordinateColumns: this.coordinateColumns
        });

        let series: PlotSeries | null = null;
        if (data.ok) series = data.series;

        let interpolation: InterpolationResult | null = null;
        let contours: ContourResult | null = null;
        const needsField =
            usesZColumn(plot.type) && (plot.interpolation.enabled || plot.contour.enabled);

        // A text colour column has groups, not values, so nothing can grid it.
        if (series && !series.categories && needsField) {
            const xRange = resolveRange(series.xRange, plot.x.min, plot.x.max);
            const yRange = resolveRange(series.yRange, plot.y.min, plot.y.max);
            const map = this.isMapPlot(plot, series);
            let land: Land | null = null;
            if (map) land = await this.landFor(plot, xRange, yRange);
            if (token !== this.prepareToken) return;

            // The spacing walks the points, so it runs one time per result, series and axes.
            const key = this.spacingKey(plot);
            const source = this.spacingSource;
            let auto: AxisLengths | null = null;
            if (
                this.spacing?.key === key &&
                source?.table === table &&
                source.seriesKey === seriesKey
            ) {
                auto = this.spacing.lengths;
            }
            if (!auto) {
                auto = dataSpacing(series, xRange, yRange, map);
                this.spacingSource = { table, seriesKey };
                this.spacing = { key, lengths: auto };
            }

            const field = buildInterpolationField(series, plot.interpolation, xRange, yRange, {
                land,
                map,
                auto
            });

            if (field && plot.interpolation.enabled) {
                interpolation = buildInterpolationSurface(field, series, plot);
            }

            const colours = colourRangeOf(series, plot, interpolation);
            if (field && colours && plot.contour.enabled) {
                contours = buildContours(field, series, plot, colours);
            }
        }

        this.data = data;
        this.interpolation = interpolation;
        this.contours = contours;

        // Last, so the steps above still read every row. The setting is read
        // here and not at module load, so a change to it reaches the next rebuild.
        if (series && needsSampling(plot.type)) {
            this.displaySeries = samplePlotSeries(series, getSettings().sampleAfterRows);
        } else {
            this.displaySeries = series;
        }

        this.isPreparing = false;
    }

    /**
     * The land polygons for a map plot that keeps to the land or the sea, or
     * null. The domain takes the coast of the basemap detail.
     */
    private async landFor(
        plot: PlotConfig,
        xRange: PlotRange,
        yRange: PlotRange
    ): Promise<Land | null> {
        if (plot.interpolation.domain === "all") return null;

        try {
            return await loadLand(this.landDetailOf(plot, xRange, yRange));
        } catch (error) {
            addToast({
                key: "plot.error.coastlinesFailed",
                message: String(error),
                type: "error"
            });
            return null;
        }
    }

    /**
     * The number of the newest run of this controller. The store runs one query at
     * a time, so a new run stops the run in flight. That older run rejects after
     * the newer one set the spinner, and must therefore reset nothing.
     */
    private latestRun = 0;

    constructor(
        private beginRun: (blockId: string) => number = () => 0,
        private endRun: (blockId: string, token: number) => void = () => {},
        private markRun: (blockId: string, rows: number) => void = () => {}
    ) {}

    // --------------------------------------------------------------- view state

    /**
     * Restore the plots of a block, the area that its query filters on, and its
     * coordinate pair.
     *
     * Call this method at every change of block, also for a block with no stored
     * plots. That block gets one default plot, and does not keep the plots of the
     * block before it.
     */
    applyViewState(
        blockId: string | null,
        view: ChartViewState | null | undefined,
        selection: SpatialSelection | null,
        coordinateColumns: CoordinatePair | null
    ): void {
        this.viewBlockId = blockId;
        this.selection = selection;
        this.coordinateColumns = coordinateColumns;
        this.view = normaliseChartView(view) ?? makeChartViewState([makePlotConfig()]);

        // Do not sync against columns here: `entry` still holds the previous
        // block's result at this point. `showQueryFromCache`/`runAndShowQuery`
        // sync the plot once the new block's own result is in.
    }

    /**
     * Follow the area that the query filters on.
     *
     * The page calls this on every run, and not only on a change of block. A user
     * can apply a new cross section to the same block, and the X values of a cross
     * section plot come from that line.
     */
    setSelection(
        selection: SpatialSelection | null,
        coordinateColumns: CoordinatePair | null
    ): void {
        if (JSON.stringify(this.coordinateColumns) !== JSON.stringify(coordinateColumns)) {
            this.coordinateColumns = coordinateColumns;
        }

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
    /**
     * Reports one chart view. The call comes after the plot setup, so `renderMs`
     * holds the time that the chart itself took.
     */
    private reportVisualise(query: RunQuery, node: BeaconNode, readyAt: number): void {
        track("query.visualise", {
            nodeHost: node.url,
            rowCount: this.entry?.rowCount,
            queryId: this.entry?.queryId,
            props: {
                ...describeQuery(query),
                kind: "chart",
                tier: this.entry?.stats?.tier,
                renderMs: Math.round(performance.now() - readyAt)
            }
        });
    }

    async runAndShowQuery(query: RunQuery, node: BeaconNode, blockId: string): Promise<void> {
        const token = this.beginRun(blockId);
        this.latestRun = token;
        this.isLoading = true;

        try {
            this.entry = await queryStore.ensure(query, node, blockId);
            this.markRun(blockId, this.entry.rowCount);
            this.isLoading = false;

            const readyAt = performance.now();

            if (this.entry.rowCount === 0) {
                this.reportVisualise(query, node, readyAt);
                addToast({ type: "info", key: "visualisation.toast.noData" });
                return;
            }

            this.syncPlotToColumns();
            this.reportVisualise(query, node, readyAt);
        } catch (error) {
            this.endRun(blockId, token);
            if (this.latestRun === token) this.isLoading = false;

            // The app runs one query at a time. A newer run stopped this one. The
            // user asked for that, so it is no error.
            if (isAbortError(error)) return;

            console.error("Failed to execute query:", error);
            addToast({
                type: "error",
                key: "visualisation.toast.queryFailed",
                message: (error as Error).message
            });
        }
    }

    /**
     * Show the cached result of a query at once, before the run starts. The page
     * stays empty when the cache has no result for this key.
     */
    showQueryFromCache(datasetKey: string | null): void {
        this.entry = queryStore.peekByKey(datasetKey) ?? null;
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
