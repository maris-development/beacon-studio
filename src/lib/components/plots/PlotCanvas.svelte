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
	the panel commits its edits once, on Apply, not on every keystroke. Two edits
	need no rebuild: the figure size only resizes the chart, and a hidden group of
	the legend only draws again.

	The rebuild runs after the browser has painted. Drawing the points walks every
	row, so at several hundred thousand rows it must not run inside the render pass
	that a navigation is waiting on: the caller wants its spinner on screen first.

	The mouse works as in a desktop plot window: on the plot, on its axes and on
	its edges. See `PlotMouse.svelte.ts`. The view that the user sets stays with
	the plot after a rebuild, until the columns, the axis limits or the data change.
-->
<script module lang="ts">
    import type { PlotView } from "@/plots/plot-view";

    /**
     * The view that the user left on each plot, by plot id. It lives for the
     * session, so a rebuild, a plot switch and a page switch keep it. The key holds
     * what makes a view stale: the columns, the axis limits and the data range.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- the views are not view state
    const SAVED_VIEWS = new Map<string, { key: string; view: PlotView }>();
</script>

<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import uPlot from "uplot";
    import "uplot/dist/uPlot.min.css";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import Button from "@/components/buttons/Button.svelte";
    import CheckIcon from "@lucide/svelte/icons/check";
    import {
        axisTitle,
        BASEMAP_THEME_COLORS,
        basemapLayerOf,
        resolvePlotColors,
        usesZColumn,
        type PlotConfig
    } from "@/plots/plot-config";
    import { resolvedTheme } from "@/services/theme";
    import {
        categoryKeyOf,
        CROSS_SECTION_AXIS_LABEL,
        HISTOGRAM_AXIS_LABEL,
        resolveRange,
        type PlotRowCell,
        type PlotSeries
    } from "@/plots/plot-data";
    import { colormapsReady, loadColormaps, makePaletteScale } from "@/colors/palettes";
    import { formatNumber, t, type Message } from "@/i18n";
    import { addToast } from "@/stores/toasts";
    import {
        categoryColor,
        categoryLegendEntries,
        categoryLegendWidth,
        clipToDomain,
        clipToRings,
        colorBarPadding,
        DEFAULT_SERIES_COLORS,
        drawBackground,
        drawBars,
        drawCategoryLegend,
        drawColorBar,
        drawContours,
        drawGroupLegend,
        drawLines,
        drawPoints,
        drawCaption,
        drawCoastlines,
        drawInterpolationSurface,
        drawLand,
        drawTitle,
        gridColor,
        groupColors,
        sampleGrid,
        type CategoryLegendEntry,
        type LegendHit,
        type SeriesColors
    } from "@/plots/uplot-render";
    import {
        fitMapShape,
        figureForAspect,
        formatAxisLimit,
        isUsableView,
        mapDataAspect,
        mapShapeView,
        parseAxisLimit,
        type ViewAxis,
        type ViewKeep
    } from "@/plots/plot-view";
    import {
        buildPointIndex,
        forEachPointNear,
        insideRing,
        nearestPoint,
        type PixelTransform,
        type PointIndex
    } from "@/plots/plot-hover";
    import type { ContourResult } from "@/plots/contour";
    import { colourRangeOf, type InterpolationResult } from "@/plots/interpolation";
    import {
        LAND_DETAILS,
        landDetailForSpan,
        loadGeography,
        readyGeography,
        type Geography
    } from "@/geo/land";
    import { PlotMouse } from "./PlotMouse.svelte";

    let {
        plot,
        series,
        caption = null,
        contours = null,
        interpolation = null,
        geography = null,
        map = false,
        message = null,
        rowCells = null,
        onPlotChange = null,
        onBusyChange = undefined
    }: {
        plot: PlotConfig;
        /** The numbers to draw. Null while the plot cannot draw. */
        series: PlotSeries | null;
        /**
         * One line under the plot, at the left, for example the point counts. Null
         * draws none, and so does `style.showCaption` when the user cleared it.
         */
        caption?: Message | null;
        /** The contour lines, in data coordinates. Null while the plot draws none. */
        contours?: ContourResult | null;
        /** The interpolated field, in data coordinates. Null while the plot draws none. */
        interpolation?: InterpolationResult | null;
        /**
         * The land and borders of a map plot, in degrees. The basemap draws from it,
         * and the surface clips to the land or sea domain with it. Null for none.
         */
        geography?: Geography | null;
        /** True when X is the longitude and Y the latitude. */
        map?: boolean;
        /** Why the plot cannot draw. Shown in place of the canvas. */
        message?: Message | null;
        /**
         * The cells of a row of the result, for the hover tooltip. Without it the
         * tooltip shows the plotted values only.
         */
        rowCells?:
            | ((row: number, skip: ReadonlyArray<string>, limit: number) => PlotRowCell[])
            | null;
        /**
         * Stores an edit that the mouse makes on the canvas: the figure size and
         * the hidden groups. These have no Apply step.
         */
        onPlotChange?: ((plot: PlotConfig) => void) | null;
        /**
         * Reports the drawing state. Building the points and painting them is the
         * slowest step of the page, so the caller shows a spinner over it.
         */
        onBusyChange?: (busy: boolean) => void;
    } = $props();

    /** The most extra columns of a row that the tooltip shows. */
    const TIP_EXTRA_COLUMNS = 8;

    /** Text cells in the tooltip stop at this length. */
    const TIP_TEXT_LENGTH = 40;

    let room: HTMLDivElement | null = null;
    let container: HTMLDivElement | null = null;
    let chart: uPlot | null = null;

    const mouse = new PlotMouse();

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
        mouse.destroy();
        chart?.destroy();
        chart = null;
    });

    // A colour that the user did not pick follows the theme.
    const colors = $derived(resolvePlotColors(plot.style, $resolvedTheme));
    const basemapColors = $derived(BASEMAP_THEME_COLORS[$resolvedTheme]);

    /**
     * The plot without the two edits that need no rebuild: the figure size and the
     * hidden groups. The rebuild effect reads this string, so those two edits do not
     * build the chart again.
     */
    const rebuildKey = $derived(
        JSON.stringify({
            ...plot,
            style: { ...plot.style, figureWidth: null, figureHeight: null },
            categories: null
        })
    );

    // Rebuild the chart when the plot, the data, the contours, the palette or the
    // theme change. The reads below are the dependencies of this effect.
    $effect(() => {
        void [
            rebuildKey,
            series,
            caption,
            contours,
            interpolation,
            geography,
            map,
            palettesLoaded,
            $t,
            // Strings, not the object, so a figure size or a hidden group does not rebuild.
            colors.backgroundColor,
            colors.gridlineColor,
            colors.textColor,
            basemapColors
        ];
        scheduleRebuild();
    });

    // A hidden group only draws again. The draw reads the hidden groups of the plot.
    $effect(() => {
        void plot.categories.hidden.join("\u0000");
        untrack(() => chart?.redraw(false, false));
    });

    // The figure size goes to the host. The resize observer then resizes the chart.
    $effect(() => {
        void [plot.style.figureWidth, plot.style.figureHeight, container];
        untrack(() => applyFigure());
    });

    const figureSized = $derived(
        plot.style.figureWidth !== null || plot.style.figureHeight !== null
    );

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
        mouse.destroy();
        chart?.destroy();
        chart = null;
        hideTip();
        editor = null;

        // A new chart starts at the range of its data. The ready hook then puts the
        // view of the user back.
        view = null;
        home = null;

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

        seriesColors = readSeriesColors();
        viewKey = viewKeyOf(series);

        chart = new uPlot(buildOptions(series, width, height), alignedData(series), container);
        attachMouse(chart);

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

    // -- the view -------------------------------------------------------------

    /** The view that the user set on this chart. Null follows the data. */
    let view: PlotView | null = null;
    /** The view of the data, from the first layout. Reset view goes back to it. */
    let home: PlotView | null = null;
    /** True while {@link setView} sets the scales. The range functions then pass the values through. */
    let explicit = false;
    /** The key of the saved view of the current chart. See {@link SAVED_VIEWS}. */
    let viewKey = "";

    function viewKeyOf(current: PlotSeries): string {
        return JSON.stringify([
            plot.type,
            plot.x.column,
            plot.y.column,
            plot.x.min,
            plot.x.max,
            plot.y.min,
            plot.y.max,
            fixesMapShape(),
            current.xRange,
            current.yRange
        ]);
    }

    /**
     * Set the view. Both scales change in one batch, else uPlot fits the other
     * axis to the data again. A map keeps its shape around the axis in `keep`.
     */
    function setView(
        u: uPlot,
        next: Partial<PlotView>,
        keep: ViewKeep,
        remember = true
    ): PlotView | null {
        const sx = u.scales.x;
        const sy = u.scales.y;
        if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return null;

        let candidate: PlotView = {
            x: next.x ?? { min: sx.min, max: sx.max },
            y: next.y ?? { min: sy.min, max: sy.max }
        };
        if (!isUsableView(candidate)) return null;

        if (fixesMapShape() && u.bbox.width > 0 && u.bbox.height > 0) {
            candidate = fitMapShape(candidate, keep, u.bbox.width / u.bbox.height);
        }

        explicit = true;
        try {
            u.batch(() => {
                u.setScale("x", { ...candidate.x });
                u.setScale("y", { ...candidate.y });
            });
        } finally {
            explicit = false;
        }

        view = candidate;
        if (remember) SAVED_VIEWS.set(plot.id, { key: viewKey, view: candidate });
        syncEditor();
        return candidate;
    }

    /** Back to the view of the data. With an axis, only that axis goes back. */
    function resetToHome(axis: ViewAxis | null) {
        const u = chart;
        if (!u || !home) return;

        if (axis) {
            setView(u, { [axis]: home[axis] }, axis);
            return;
        }

        SAVED_VIEWS.delete(plot.id);
        setView(u, home, "both", false);
    }

    /** The view that the user left on this plot, while the data still fits it. */
    function savedView(): PlotView | null {
        const saved = SAVED_VIEWS.get(plot.id);
        if (!saved || saved.key !== viewKey) return null;
        return saved.view;
    }

    /**
     * The range of one scale: the values of {@link setView} pass through, then the
     * view of the user, then `base`, then the default of uPlot. uPlot calls this on
     * every auto range, so a resize and a redraw keep the view.
     */
    function rangeFor(
        axis: ViewAxis,
        time: boolean,
        base: ((u: uPlot, min: number, max: number) => uPlot.Range.MinMax) | null
    ): uPlot.Range.Function {
        return (u, dataMin, dataMax) => {
            if (explicit) return [dataMin, dataMax];

            const current = view?.[axis];
            if (current) return [current.min, current.max];
            if (base) return base(u, dataMin, dataMax);
            if (dataMin == null || dataMax == null) return [dataMin, dataMax];
            if (axis === "x" || time) return [dataMin, dataMax];
            return uPlot.rangeNum(dataMin, dataMax, 0.1, true);
        };
    }

    // -- map ------------------------------------------------------------------

    /** True when the plot keeps the shape of the map: one km as long on both axes. */
    function fixesMapShape(): boolean {
        return map && plot.basemap.fixAspect;
    }

    /** The first view of a map: the data, 4% wider, in the shape of the plot box. */
    function homeMapView(u: uPlot, current: PlotSeries): PlotView {
        return mapShapeView(
            resolveRange(current.xRange, plot.x.min, plot.x.max),
            resolveRange(current.yRange, plot.y.min, plot.y.max),
            u.bbox,
            1.04
        );
    }

    let refitting = false;

    /** A new size keeps the map shape: the saved view or the home view fits the new box. */
    function refitMap(u: uPlot, current: PlotSeries) {
        // The batch inside fires the setSize hook again, before uPlot clears its flag.
        if (refitting || !(u.bbox.width > 0 && u.bbox.height > 0)) return;

        refitting = true;
        try {
            home = homeMapView(u, current);
            setView(u, savedView() ?? home, "both", false);
        } finally {
            refitting = false;
        }
    }

    /**
     * The geography to draw for the view. With the automatic detail, a zoom in loads a
     * finer level in the background and draws again. The analysis keeps its own level.
     */
    function viewGeography(u: uPlot): Geography | null {
        if (!geography || plot.basemap.detail !== "auto") return geography;

        const sx = u.scales.x;
        const sy = u.scales.y;
        if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return geography;

        const want = landDetailForSpan(Math.max(sx.max - sx.min, sy.max - sy.min));
        if (LAND_DETAILS.indexOf(want) <= LAND_DETAILS.indexOf(geography.detail)) {
            return geography;
        }

        const borders = geography.borders.length > 0;
        const finer = readyGeography(want, borders);
        if (finer) return finer;

        loadGeography(want, borders)
            .then(() => {
                if (chart === u) u.redraw(false, false);
            })
            // A failed load keeps the coarser detail on screen.
            .catch(() => {});
        return geography;
    }

    /** The basemap layer that this plot draws: none without a map or a geography. */
    function mapLayer(geo: Geography | null) {
        if (!map || !geo) return "none";
        return basemapLayerOf(plot);
    }

    /** The clip to the land or sea domain of a field, along the coastline. Null for none. */
    function domainClip(
        u: uPlot,
        geo: Geography | null,
        domain: "sea" | "land" | null
    ): (() => void) | null {
        if (!map || !geo || !domain) return null;
        return () => clipToDomain(u, geo.land, domain);
    }

    /**
     * The clips of the surface: the domain, the hull of the points without extrapolation,
     * and the outline of the cells with a value. Null when none applies.
     */
    function surfaceClip(
        u: uPlot,
        geo: Geography | null,
        field: InterpolationResult
    ): (() => void) | null {
        const clips: Array<() => void> = [];

        const domain = domainClip(u, geo, field.domain);
        if (domain) clips.push(domain);
        if (field.outline.length >= 3) clips.push(() => clipToRings(u, [field.outline]));

        const valid = field.valid;
        if (valid) clips.push(() => clipToRings(u, valid));

        if (clips.length === 0) return null;
        return () => clips.forEach((clip) => clip());
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

    // -- figure size ----------------------------------------------------------

    /** Give the host the figure size of the plot. A figure larger than the panel shrinks to fit it. */
    function applyFigure() {
        if (!container) return;

        const { figureWidth, figureHeight } = plot.style;

        container.style.width = "";
        if (figureWidth) container.style.width = `min(${figureWidth}px, 100%)`;

        container.style.height = "";
        if (figureHeight) container.style.height = `min(${figureHeight}px, 100%)`;
    }

    /** Resize the host and the chart during an edge drag. The plot keeps its stored size. */
    function resizeFigure(width: number, height: number) {
        if (!container) return;

        container.style.width = `${Math.round(width)}px`;
        container.style.height = `${Math.round(height)}px`;
        chart?.setSize({ width: Math.round(width), height: Math.round(height) });
    }

    /** Store a figure size. A side that the call leaves out keeps its value. */
    function commitFigure(next: { width?: number | null; height?: number | null }) {
        const style = { ...plot.style };
        if (next.width !== undefined) style.figureWidth = next.width;
        if (next.height !== undefined) style.figureHeight = next.height;

        onPlotChange?.({ ...plot, style });
        applyFigure();
    }

    function restoreFigure() {
        applyFigure();
        onResize();
    }

    // -- the mouse ------------------------------------------------------------

    function attachMouse(u: uPlot) {
        if (!container) return;

        mouse.attach(
            u,
            {
                figure: container,
                setView: (next, keep) => void setView(u, next, keep),
                resetView: (axis) => resetToHome(axis),
                resizeFigure,
                commitFigure,
                restoreFigure,
                openAxisEditor,
                legendAt,
                toggleGroup
            },
            { x: $t("plot.mouse.xAxisTitle"), y: $t("plot.mouse.yAxisTitle") }
        );
    }

    // -- groups of a text colour column ---------------------------------------

    /** The colours of the groups, from the theme tokens. Read on each rebuild. */
    let seriesColors: SeriesColors = DEFAULT_SERIES_COLORS;
    /** The rows of the legend of the current chart. */
    let legendEntries: CategoryLegendEntry[] = [];
    /** The clickable rows of the legend, from the last draw. */
    let legendHits: LegendHit[] = [];

    function readSeriesColors(): SeriesColors {
        if (!container) return DEFAULT_SERIES_COLORS;

        const css = getComputedStyle(container);
        const read = (name: string, fallback: string) =>
            css.getPropertyValue(name).trim() || fallback;

        return {
            slots: DEFAULT_SERIES_COLORS.slots.map((color, i) =>
                read(`--plot-series-${i + 1}`, color)
            ),
            other: read("--plot-series-other", DEFAULT_SERIES_COLORS.other)
        };
    }

    function legendAt(x: number, y: number): string | null {
        const hit = legendHits.find(
            (entry) => x >= entry.left && x <= entry.right && y >= entry.top && y <= entry.bottom
        );
        return hit?.key ?? null;
    }

    /** A click hides or shows a group. A double click shows the group alone, a second one shows all. */
    function toggleGroup(key: string, alone: boolean) {
        const keys = legendEntries.map((entry) => entry.key);
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a copy that goes to the plot as an array
        let hidden = new Set(plot.categories.hidden);

        if (alone) {
            const rest = keys.filter((other) => other !== key);
            const isAlone = !hidden.has(key) && rest.every((other) => hidden.has(other));
            if (isAlone) hidden = new Set();
            else hidden = new Set(rest);
        } else if (hidden.has(key)) {
            hidden.delete(key);
        } else {
            hidden.add(key);
        }

        onPlotChange?.({ ...plot, categories: { hidden: [...hidden] } });
    }

    // -- the tooltip ----------------------------------------------------------

    interface TipRow {
        label: string;
        value: string;
        color: string | null;
    }

    interface TipSection {
        head: string | null;
        rows: TipRow[];
    }

    let tip = $state<{
        sections: TipSection[];
        x: number;
        y: number;
        flipX: boolean;
        flipY: boolean;
    } | null>(null);

    /** The ring around the point under the mouse, in pixels of the figure. */
    let ring = $state<{ left: number; top: number } | null>(null);

    let pointIndex: { source: PlotSeries; index: PointIndex } | null = null;

    function hideTip() {
        tip = null;
        ring = null;
    }

    function indexOf(current: PlotSeries): PointIndex {
        if (pointIndex && pointIndex.source === current) return pointIndex.index;

        pointIndex = { source: current, index: buildPointIndex(current.x, current.y) };
        return pointIndex.index;
    }

    function formatValue(value: number, kind: PlotRowCell["kind"] | null): string {
        if (!Number.isFinite(value)) return String(value);
        if (kind === "timestamp")
            return new Date(value).toISOString().slice(0, 19).replace("T", " ");
        return $formatNumber(value, { maximumSignificantDigits: 6 });
    }

    function formatCell(cell: PlotRowCell): string {
        if (typeof cell.value === "number") return formatValue(cell.value, cell.kind);
        if (cell.value.length <= TIP_TEXT_LENGTH) return cell.value;
        return `${cell.value.slice(0, TIP_TEXT_LENGTH - 1)}…`;
    }

    /** Value to pixel of the plot area, per axis. The scales are linear, so two numbers per axis do it. */
    function pixelTransform(u: uPlot): PixelTransform | null {
        const sx = u.scales.x;
        const sy = u.scales.y;
        if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return null;

        const x0 = u.valToPos(sx.min, "x");
        const ax = (u.valToPos(sx.max, "x") - x0) / (sx.max - sx.min || 1);
        const y0 = u.valToPos(sy.min, "y");
        const ay = (u.valToPos(sy.max, "y") - y0) / (sy.max - sy.min || 1);

        return { ax, bx: x0 - ax * sx.min, ay, by: y0 - ay * sy.min };
    }

    /** Put the tooltip next to the cursor, on the side with room. */
    function placeTip(u: uPlot, sections: TipSection[], left: number, top: number) {
        if (!room) return;

        const box = room.getBoundingClientRect();
        const plotArea = u.over.getBoundingClientRect();
        const x = plotArea.left - box.left + left;
        const y = plotArea.top - box.top + top;

        tip = { sections, x, y, flipX: x > box.width * 0.6, flipY: y > box.height * 0.6 };
    }

    /** The values under the mouse: the nearest point and its row, else the value of the surface. */
    function updateTip(u: uPlot, current: PlotSeries) {
        const { left, top } = u.cursor;
        if (!usesZColumn(plot.type) || mouse.dragging) {
            hideTip();
            return;
        }
        if (left == null || top == null || left < 0 || top < 0) {
            hideTip();
            return;
        }

        const transform = pixelTransform(u);
        if (!transform) {
            hideTip();
            return;
        }

        const zTitle = axisTitle(plot.z);
        const zRange = colourRangeOf(current, plot, interpolation);

        let colorOf: ((value: number) => string) | null = null;
        if (zRange) {
            colorOf = makePaletteScale(
                plot.style.palette,
                zRange.min,
                zRange.max,
                plot.z?.reverse ?? false,
                plot.z?.scale ?? "linear"
            );
        }

        // A hidden group has no hover.
        const categories = current.categories;
        const hidden = new Set(plot.categories.hidden);
        const shown = (point: number): boolean => {
            if (!categories) return true;
            return !hidden.has(categoryKeyOf(categories, categories.index[point]));
        };

        let best = -1;
        if (plot.style.showPoints) {
            const radius = Math.max(8, plot.style.pointRadius + 5);
            best = nearestPoint(indexOf(current), transform, left, top, radius, shown);
        }

        if (best >= 0) {
            const point: TipSection = {
                head: $t("plot.tip.dataPoint"),
                rows: [
                    {
                        label: xTitle(),
                        value: formatValue(current.x[best], current.xKind),
                        color: null
                    },
                    {
                        label: yTitle(),
                        value: formatValue(current.y[best], current.yKind),
                        color: null
                    }
                ]
            };

            if (current.z) {
                const value = current.z[best];
                point.rows.push({
                    label: zTitle,
                    value: formatValue(value, current.zKind),
                    color: colorOf?.(value) ?? null
                });
            }

            if (categories) {
                const group = categories.index[best];
                point.rows.push({
                    label: zTitle,
                    value: categories.list[group].name,
                    color: categoryColor(categories, group, seriesColors)
                });
            }

            const sections = [point];

            const row = current.rowIndex?.[best];
            if (rowCells && row !== undefined) {
                const skip = [plot.x.column, plot.y.column, plot.z?.column].filter(
                    (name): name is string => !!name
                );
                const cells = rowCells(row, skip, TIP_EXTRA_COLUMNS);

                if (cells.length > 0) {
                    sections.push({
                        head: null,
                        rows: cells.map((cell) => ({
                            label: cell.name,
                            value: formatCell(cell),
                            color: null
                        }))
                    });
                }
            }

            const px = transform.ax * current.x[best] + transform.bx;
            const py = transform.ay * current.y[best] + transform.by;

            // A station often holds many groups at one place. Count the points under this point, per group.
            if (categories) {
                // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a count inside one hover
                const here = new Map<number, number>();
                let total = 0;

                forEachPointNear(
                    indexOf(current),
                    transform,
                    px,
                    py,
                    1.5,
                    (other) => {
                        const group = categories.index[other];
                        here.set(group, (here.get(group) ?? 0) + 1);
                        total++;
                    },
                    shown
                );

                if (here.size > 1) {
                    const top5 = [...here.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
                    let head = $t("plot.tip.pointsHere", { count: total });
                    if (current.sampledFrom !== null)
                        head = $t("plot.tip.pointsHereSample", { count: total });

                    const rows = top5.map(([group, count]) => ({
                        label: categories.list[group].name,
                        value: $formatNumber(count),
                        color: categoryColor(categories, group, seriesColors)
                    }));

                    if (here.size > 5) {
                        rows.push({
                            label: $t("plot.tip.moreGroups", { count: here.size - 5 }),
                            value: "",
                            color: null
                        });
                    }

                    sections.push({ head, rows });
                }
            }

            ring = { left: u.over.offsetLeft + px, top: u.over.offsetTop + py };
            placeTip(u, sections, left, top);
            return;
        }

        ring = null;

        const field = interpolation;
        if (!field || !plot.interpolation.enabled) {
            tip = null;
            return;
        }

        const xValue = u.posToVal(left, "x");
        const yValue = u.posToVal(top, "y");
        let value = sampleGrid(field, xValue, yValue, { fillEdges: false, bounded: true });
        if (field.outline.length >= 3 && !insideRing(field.outline, xValue, yValue))
            value = Number.NaN;

        if (!Number.isFinite(value)) {
            tip = null;
            return;
        }

        placeTip(
            u,
            [
                {
                    head: $t("plot.tip.surface"),
                    rows: [
                        { label: xTitle(), value: formatValue(xValue, current.xKind), color: null },
                        { label: yTitle(), value: formatValue(yValue, current.yKind), color: null },
                        {
                            label: zTitle,
                            value: $t("plot.tip.approx", { value: formatValue(value, null) }),
                            color: colorOf?.(value) ?? null
                        }
                    ]
                }
            ],
            left,
            top
        );
    }

    // -- the axis editor ------------------------------------------------------

    /** The open axis editor: the axis and the element it hangs from. */
    let editor = $state<{ axis: ViewAxis; anchor: HTMLElement; time: boolean } | null>(null);

    // The texts stay apart from `editor`: a new `editor` object makes the popover focus and select the field again.
    let fromText = $state("");
    let toText = $state("");

    let fromInput = $state<HTMLInputElement | null>(null);

    function openAxisEditor(axis: ViewAxis, anchor: HTMLElement) {
        const u = chart;
        if (!u || !anchor.isConnected) return;

        const scale = u.scales[axis];
        const time = !!scale.time;

        fromText = formatAxisLimit(scale.min ?? 0, time);
        toText = formatAxisLimit(scale.max ?? 1, time);
        editor = { axis, anchor, time };
    }

    /** The fields follow the view while the editor is open, for example after Apply on a map. */
    function syncEditor() {
        const u = chart;
        if (!u || !editor) return;

        const scale = u.scales[editor.axis];
        fromText = formatAxisLimit(scale.min ?? 0, editor.time);
        toText = formatAxisLimit(scale.max ?? 1, editor.time);
    }

    function applyEditor() {
        const u = chart;
        if (!u || !editor) return;

        const a = parseAxisLimit(fromText, editor.time);
        const b = parseAxisLimit(toText, editor.time);

        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
            let key: "plot.axisEditor.invalidNumbers" | "plot.axisEditor.invalidTimes" =
                "plot.axisEditor.invalidNumbers";
            if (editor.time) key = "plot.axisEditor.invalidTimes";
            addToast({ key, type: "warning" });
            return;
        }

        const axis = editor.axis;
        setView(u, { [axis]: { min: Math.min(a, b), max: Math.max(a, b) } }, axis);
    }

    function onEditorKey(event: KeyboardEvent) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        applyEditor();
    }

    /** The title of the axis in the editor: the axis title of the plot. */
    function editorTitle(axis: ViewAxis): string {
        if (axis === "x") return xTitle();
        return yTitle();
    }

    // -- titles ---------------------------------------------------------------

    /** The title of the X axis. A cross section names its distance itself. */
    function xTitle(): string {
        if (plot.type === "cross-section") {
            if (plot.x.label) return plot.x.label;
            return $t(CROSS_SECTION_AXIS_LABEL);
        }

        return axisTitle(plot.x);
    }

    /** The title of the Y axis. A histogram counts rows, so it names the count. */
    function yTitle(): string {
        if (plot.type === "histogram") {
            if (plot.y.label) return plot.y.label;
            return $t(HISTOGRAM_AXIS_LABEL);
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
     * uPlot auto-ranges the data and rounds the ends to readable tick values. The
     * range function of {@link rangeFor} keeps the view of the user over that
     * default. Its `base` holds the ends that the user pinned, which set the first
     * view: the pinned end, and the data extent for the other end.
     */
    function scaleFor(axis: "x" | "y", time: boolean, current: PlotSeries): uPlot.Scale {
        const config = plot[axis];
        const scale: uPlot.Scale = { time, dir: config.reverse ? -1 : 1 };

        // A map starts at the data, in the shape of the plot box. Before the first
        // layout the box has no size, and the ready hook sets the view.
        if (fixesMapShape()) {
            scale.range = rangeFor(axis, time, (u, dataMin, dataMax) => {
                if (!(u.bbox.width > 0 && u.bbox.height > 0)) return [dataMin, dataMax];
                const range = homeMapView(u, current)[axis];
                return [range.min, range.max];
            });
            return scale;
        }

        // A bar grows from zero, so the count axis must reach it. uPlot would
        // otherwise fit the range to the counts and cut the foot off every bar.
        const floorAtZero = plot.type === "histogram" && axis === "y";

        let base: ((u: uPlot, min: number, max: number) => uPlot.Range.MinMax) | null = null;
        if (config.min !== null || config.max !== null || floorAtZero) {
            base = (_u, dataMin, dataMax) => {
                let min = config.min ?? dataMin;
                if (floorAtZero && config.min === null) min = 0;
                return [min, config.max ?? dataMax];
            };
        }

        scale.range = rangeFor(axis, time, base);
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
        axis: "x" | "y",
        title: string,
        style: PlotConfig["style"],
        grid: string
    ): uPlot.Axis {
        const options: uPlot.Axis = {
            scale: axis,
            stroke: style.textColor,
            font: `${style.tickFontSize}px sans-serif`,
            grid: { show: style.gridlines, stroke: grid, width: 1 },
            ticks: { show: true, stroke: grid, width: 1 }
        };

        if (axis === "y") {
            options.side = 3;
            options.size = yAxisSize;
        }

        if (title) {
            let titleFontSize = style.xAxisTitleFontSize;
            if (axis === "y") titleFontSize = style.yAxisTitleFontSize;

            options.label = title;
            options.labelFont = `${titleFontSize}px sans-serif`;
            options.labelSize = titleFontSize + 8;
        }

        return options;
    }

    /**
     * The width of the Y axis gutter, sized to the widest tick label.
     *
     * uPlot's own default is a fixed 50px, so a large value (formatted with
     * thousands separators) draws wider than the gutter and overlaps the axis
     * title next to it. `values` is null on the first sizing pass, before uPlot
     * has computed real ticks, so this falls back to a fixed default then.
     */
    function yAxisSize(self: uPlot, values: string[] | null, axisIdx: number): number {
        const axis = self.axes[axisIdx];
        const reserve = (axis.ticks?.size ?? 0) + (axis.gap ?? 0);

        if (!values || values.length === 0) return reserve + 40;

        const { ctx } = self;
        ctx.save();
        ctx.font = axis.font[0];

        let maxWidth = 0;
        for (const value of values) maxWidth = Math.max(maxWidth, ctx.measureText(value).width);

        ctx.restore();

        return Math.ceil(reserve + maxWidth / uPlot.pxRatio + 2);
    }

    function buildOptions(current: PlotSeries, width: number, height: number): uPlot.Options {
        const style = { ...plot.style, ...colors };
        const grid = gridColor(style.gridlineColor, style.gridlineOpacity);

        const showColorBar = !!current.z && !!current.zRange && usesZColumn(plot.type);
        const categories = current.categories;
        const formatCount = (count: number) => $formatNumber(count);

        legendEntries = [];
        legendHits = [];
        if (categories) {
            legendEntries = categoryLegendEntries(
                categories,
                seriesColors,
                $t("plot.legend.otherGroups", { count: categories.otherGroups })
            );
        }

        const categoryTitle = legendTitle(axisTitle(plot.z));

        let rightPad = 8;
        if (showColorBar) {
            rightPad = colorBarPadding(style.tickFontSize, style.legendTitleFontSize);
        } else if (categories) {
            rightPad = categoryLegendWidth(
                legendEntries,
                categoryTitle,
                style.tickFontSize,
                style.legendTitleFontSize,
                formatCount
            );
        }

        let topPad = 6;
        if (plot.title) topPad = style.titleFontSize + 10;

        // The caption goes under the plot, on the line of the X axis title. That
        // title draws centred in the band that `labelSize` reserves at the foot of
        // the axis, so the caption shares the band and costs no extra room. A plot
        // with no X axis title has no such band, so the caption reserves its own in
        // the bottom padding.
        const showCaption = !!caption && style.showCaption;
        const captionFontSize = style.tickFontSize;

        let captionBand = 0;
        if (xTitle()) captionBand = style.xAxisTitleFontSize + 8;

        let bottomPad = 6;
        if (showCaption && !captionBand) {
            captionBand = captionFontSize + 6;
            bottomPad += captionBand;
        }

        const captionInset = 6 + captionBand / 2;

        const colourRange = colourRangeOf(current, plot, interpolation);
        const colorBarRange = colourRange ?? { min: 0, max: 1 };

        return {
            width,
            height,
            ms: 1,
            padding: [topPad, rightPad, bottomPad, 6],
            legend: { show: false },
            // The mouse layer handles every drag, so uPlot draws no selection. The
            // crosshair helps read a position off the axes.
            cursor: { drag: { x: false, y: false, setScale: false } },
            scales: {
                x: scaleFor("x", current.xKind === "timestamp", current),
                y: scaleFor("y", current.yKind === "timestamp", current)
            },
            axes: [
                axisOptions("x", xTitle(), style, grid),
                axisOptions("y", yTitle(), style, grid)
            ],
            series: [{}, { scale: "y", paths: () => null, points: { show: false } }],
            hooks: {
                // The first layout gives the true plot size, so the home view follows it.
                // Then the view that the user left on this plot comes back.
                ready: [
                    (u) => {
                        if (fixesMapShape()) {
                            home = homeMapView(u, current);
                        } else {
                            const sx = u.scales.x;
                            const sy = u.scales.y;
                            home = {
                                x: { min: sx.min ?? 0, max: sx.max ?? 1 },
                                y: { min: sy.min ?? 0, max: sy.max ?? 1 }
                            };
                        }

                        const saved = savedView();
                        if (saved) setView(u, saved, "both", false);
                        else if (fixesMapShape()) setView(u, home, "both", false);
                    }
                ],
                // A map keeps its shape after a resize.
                setSize: [
                    (u) => {
                        if (fixesMapShape()) refitMap(u, current);
                    }
                ],
                setCursor: [(u) => updateTip(u, current)],
                drawClear: [(u) => drawBackground(u, style.backgroundColor)],
                draw: [
                    (u) => {
                        // One branch per plot type. Each one owns the whole of the data
                        // area, so they never draw over each other.
                        if (plot.type === "histogram") {
                            drawBars(u, current, plot);
                        } else if (plot.type === "line") {
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
                                    title: legendTitle(plot.line.groupColumn ?? ""),
                                    titleFontSize: style.legendTitleFontSize,
                                    fontSize: style.tickFontSize,
                                    droppedGroups: current.droppedGroups
                                });
                            }
                        } else {
                            // A map draws the land below the surface, and the coastlines
                            // above the surface and the points.
                            const geo = viewGeography(u);
                            const layer = mapLayer(geo);
                            if (geo && (layer === "land" || layer === "borders")) {
                                drawLand(u, geo, basemapColors);
                            }

                            if (
                                interpolation &&
                                plot.interpolation.enabled &&
                                usesZColumn(plot.type)
                            ) {
                                const clip = surfaceClip(u, geo, interpolation);
                                drawInterpolationSurface(u, {
                                    result: interpolation,
                                    palette: style.palette,
                                    reverse: plot.z?.reverse ?? false,
                                    scale: plot.z?.scale ?? "linear",
                                    clip,
                                    fillEdges: clip !== null,
                                    bounded: map || interpolation.outline.length >= 3
                                });
                            }

                            if (style.showPoints) {
                                drawPoints(u, current, plot, colourRange, seriesColors);
                            }
                            if (geo && layer !== "none") {
                                drawCoastlines(u, geo, layer === "borders", basemapColors);
                            }
                        }

                        if (contours && plot.contour.enabled && usesZColumn(plot.type)) {
                            drawContours(u, {
                                result: contours,
                                lineWidth: plot.contour.lineWidth,
                                showLabels: plot.contour.showLabels,
                                labelFontSize: plot.contour.labelFontSize,
                                backgroundColor: style.backgroundColor,
                                textColor: style.textColor,
                                clip: domainClip(u, viewGeography(u), contours.domain)
                            });
                        }

                        if (showColorBar) {
                            drawColorBar(u, {
                                title: legendTitle(axisTitle(plot.z)),
                                min: colorBarRange.min,
                                max: colorBarRange.max,
                                palette: style.palette,
                                reverse: plot.z?.reverse ?? false,
                                scale: plot.z?.scale ?? "linear",
                                textColor: style.textColor,
                                fontSize: style.tickFontSize,
                                titleFontSize: style.legendTitleFontSize
                            });
                        }

                        if (categories) {
                            legendHits = drawCategoryLegend(u, {
                                entries: legendEntries,
                                hidden: new Set(plot.categories.hidden),
                                title: categoryTitle,
                                textColor: style.textColor,
                                fontSize: style.tickFontSize,
                                titleFontSize: style.legendTitleFontSize,
                                width: rightPad,
                                formatCount
                            });
                        }

                        if (showCaption && caption) {
                            drawCaption(u, {
                                text: $t(caption),
                                fontSize: captionFontSize,
                                textColor: style.textColor,
                                bottomInset: captionInset
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
     * is the canvas itself, and it matches the screen exactly. A figure size sets
     * the size of the canvas, so it sets the size of the file too.
     *
     * uPlot renders at the device pixel ratio, so the file comes out at the
     * resolution of the screen, not at CSS size.
     *
     * Returns false when there is nothing to export.
     */
    export function exportPng(fileName: string): boolean {
        if (!chart || !series) return false;

        const url = chart.ctx.canvas.toDataURL("image/png");

        const link = document.createElement("a");
        link.href = url;
        link.download = `${safeFileName(fileName)}.png`;
        link.click();

        return true;
    }

    /** Reset the view to show all data. Returns false while the chart is not ready. */
    export function resetView(): boolean {
        if (!chart) return false;

        resetToHome(null);
        return true;
    }

    /**
     * Give the figure the shape of the data on a map, as large as the panel allows,
     * so the map has no empty sides. The view goes back to the data.
     *
     * Returns false when the chart is no map that keeps its shape.
     */
    export function fitFigureToData(): boolean {
        const u = chart;
        const room = container?.parentElement;
        if (!u || !series || !container || !room || !fixesMapShape()) return false;

        const aspect = mapDataAspect(
            resolveRange(series.xRange, plot.x.min, plot.x.max),
            resolveRange(series.yRange, plot.y.min, plot.y.max)
        );
        const margin = {
            width: container.offsetWidth - u.over.offsetWidth,
            height: container.offsetHeight - u.over.offsetHeight
        };
        const space = { width: room.clientWidth, height: room.clientHeight };
        const figure = figureForAspect(aspect, space, margin);

        SAVED_VIEWS.delete(plot.id);
        view = null;

        let width: number | null = Math.round(figure.width);
        if (figure.width >= space.width - 1) width = null;

        let height: number | null = Math.round(figure.height);
        if (figure.height >= space.height - 1) height = null;

        commitFigure({ width, height });
        resetToHome(null);
        return true;
    }

    /** Strip the characters that a file system refuses. */
    function safeFileName(name: string): string {
        const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
        return cleaned || $t("plot.fileName");
    }
</script>

<div
    class="plot-canvas"
    class:figure-sized={figureSized}
    bind:this={room}
    style="--plot-background: {colors.backgroundColor};"
>
    <div class="plot-host" bind:this={container} aria-label={plot.title || plot.name}>
        <div class="mouse-layer" aria-hidden="true">
            {#if mouse.hover}
                <div
                    class="zone-hover {mouse.hover.kind}"
                    style:left="{mouse.hover.rect.left}px"
                    style:top="{mouse.hover.rect.top}px"
                    style:width="{mouse.hover.rect.width}px"
                    style:height="{mouse.hover.rect.height}px"
                ></div>
            {/if}
            {#if mouse.zoomBox}
                <div
                    class="zoom-box"
                    style:left="{mouse.zoomBox.left}px"
                    style:top="{mouse.zoomBox.top}px"
                    style:width="{mouse.zoomBox.width}px"
                    style:height="{mouse.zoomBox.height}px"
                ></div>
            {/if}
            {#if mouse.figureLabel}
                <div
                    class="figure-label"
                    style:left="{mouse.figureLabel.x}px"
                    style:top="{mouse.figureLabel.y}px"
                >
                    {$t("plot.mouse.figureSize", {
                        width: mouse.figureLabel.width,
                        height: mouse.figureLabel.height
                    })}
                </div>
            {/if}
            {#if ring}
                <div class="point-ring" style:left="{ring.left}px" style:top="{ring.top}px"></div>
            {/if}
        </div>
    </div>

    {#if tip}
        <div
            class="plot-tip"
            class:flip-x={tip.flipX}
            class:flip-y={tip.flipY}
            style:left="{tip.x}px"
            style:top="{tip.y}px"
        >
            {#each tip.sections as section, sectionIndex (sectionIndex)}
                {#if sectionIndex > 0}<div class="tip-separator"></div>{/if}
                {#if section.head}<div class="tip-head">{section.head}</div>{/if}
                {#each section.rows as row, rowIndex (rowIndex)}
                    <div class="tip-row">
                        {#if row.color}<span class="swatch" style:background-color={row.color}
                            ></span>{/if}
                        <span class="tip-label">{row.label}</span>
                        <b>{row.value}</b>
                    </div>
                {/each}
            {/each}
        </div>
    {/if}

    {#if message}
        <div class="plot-message">
            <p>{$t(message)}</p>
        </div>
    {/if}
</div>

<Popover.Root
    open={editor !== null}
    onOpenChange={(open) => {
        if (!open) editor = null;
    }}
>
    {#if editor}
        <Popover.Content
            customAnchor={editor.anchor}
            side={editor.axis === "x" ? "bottom" : "right"}
            class="axis-editor"
            onOpenAutoFocus={(event) => {
                event.preventDefault();
                fromInput?.focus();
                fromInput?.select();
            }}
        >
            <div class="axis-editor-head">
                <b>{$t("plot.axisEditor.title", { axis: editor.axis.toUpperCase() })}</b>
                {#if editorTitle(editor.axis)}<span>{editorTitle(editor.axis)}</span>{/if}
            </div>

            <div class="pair">
                <label class="range-field">
                    <span>{$t("plot.axisEditor.from")}</span>
                    <Input
                        bind:ref={fromInput}
                        bind:value={fromText}
                        placeholder={editor.time ? $t("plot.axisEditor.timePlaceholder") : ""}
                        inputmode={editor.time ? "text" : "decimal"}
                        spellcheck={false}
                        onkeydown={onEditorKey}
                    />
                </label>
                <label class="range-field">
                    <span>{$t("plot.axisEditor.to")}</span>
                    <Input
                        bind:value={toText}
                        placeholder={editor.time ? $t("plot.axisEditor.timePlaceholder") : ""}
                        inputmode={editor.time ? "text" : "decimal"}
                        spellcheck={false}
                        onkeydown={onEditorKey}
                    />
                </label>
            </div>

            {#if editor.time}<p class="hint">{$t("plot.axisEditor.timesUtc")}</p>{/if}

            <div class="axis-editor-foot">
                <Button size="sm" onclick={applyEditor}>
                    <CheckIcon size={14} />{$t("plot.axisEditor.apply")}
                </Button>
            </div>
        </Popover.Content>
    {/if}
</Popover.Root>

<style lang="scss">
    .plot-canvas {
        position: relative;
        flex-grow: 1;
        min-height: 0;
        border-radius: 0.5rem;
        overflow: hidden;
        background-color: var(--plot-background, var(--card));
        // A figure with a size of its own sits in the centre of the panel.
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        place-items: center;

        &.figure-sized {
            background-color: var(--secondary);

            .plot-host {
                background-color: var(--plot-background, var(--card));
                box-shadow: 0 0 0 1px var(--border);
            }
        }

        .plot-host {
            position: relative;
            width: 100%;
            height: 100%;
            min-width: 0;
            min-height: 0;

            // uPlot sizes its own canvas to the host. Let it fill the box.
            :global(.uplot),
            :global(.u-wrap) {
                width: 100%;
                height: 100%;
            }
        }

        .mouse-layer {
            position: absolute;
            inset: 0;
            z-index: 3;
            pointer-events: none;

            > div {
                position: absolute;
            }

            .zone-hover {
                &.axis {
                    border-radius: 0.25rem;
                    background-color: color-mix(in srgb, var(--primary) 10%, transparent);
                }

                &.edge {
                    border-radius: 0.125rem;
                    background-color: var(--primary);
                }
            }

            .zoom-box {
                border: 1.5px dashed var(--primary);
                background-color: color-mix(in srgb, var(--primary) 10%, transparent);
            }

            .figure-label {
                transform: translate(-50%, -50%);
                padding: 0.125rem 0.4375rem;
                border-radius: 0.25rem;
                background-color: var(--primary);
                color: var(--primary-foreground);
                font-size: var(--font-size-xs);
                font-weight: 600;
                white-space: nowrap;
            }

            .point-ring {
                width: 14px;
                height: 14px;
                margin: -7px 0 0 -7px;
                border: 2px solid var(--foreground);
                border-radius: 50%;
                box-shadow: 0 0 0 2px var(--background);
            }
        }

        .plot-tip {
            position: absolute;
            z-index: 4;
            max-width: 22rem;
            padding: 0.375rem 0.5rem;
            margin: 14px 0 0 14px;
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            background-color: var(--popover);
            color: var(--popover-foreground);
            box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
            font-size: var(--font-size-xs);
            pointer-events: none;

            &.flip-x {
                margin-left: -14px;
                transform: translateX(-100%);
            }

            &.flip-y {
                margin-top: -14px;
                translate: 0 -100%;
            }

            .tip-head {
                font-weight: 600;
                margin-bottom: 0.125rem;
            }

            .tip-row {
                display: flex;
                align-items: center;
                gap: 0.375rem;
                line-height: 1.5;

                .tip-label {
                    flex-grow: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--muted-foreground);
                }

                b {
                    font-weight: 600;
                    white-space: nowrap;
                }
            }

            .swatch {
                flex-shrink: 0;
                width: 0.5625rem;
                height: 0.5625rem;
                border-radius: 50%;
            }

            .tip-separator {
                height: 1px;
                margin: 0.25rem 0;
                background-color: var(--border);
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
            background-color: var(--plot-background, var(--card));

            p {
                max-width: 34rem;
                color: var(--muted-foreground);
            }
        }
    }

    :global(.axis-editor) {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 18rem;

        .axis-editor-head {
            display: flex;
            align-items: baseline;
            gap: 0.5rem;
            min-width: 0;

            span {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--muted-foreground);
                font-size: var(--font-size-xs);
            }
        }

        .pair {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.5rem;
        }

        .range-field {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;

            > span {
                font-size: var(--font-size-xs);
                color: var(--muted-foreground);
            }
        }

        .axis-editor-foot {
            display: flex;
            justify-content: flex-end;
        }

        .hint {
            margin: 0;
            font-size: var(--font-size-xs);
            color: var(--muted-foreground);
        }
    }
</style>
