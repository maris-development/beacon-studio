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
import type uPlot from "uplot";
import {
    getColormap,
    getColorTable,
    makePaletteScale,
    paletteIndex,
    samplePalette,
    type PaletteId
} from "@/colors/palettes";
import { colorScalePosition, colorScaleValue } from "@/colors/color-scale";
import type { ColorScale } from "./plot-config";
import { categoryKeyOf, type PlotCategories, type PlotRange, type PlotSeries } from "./plot-data";
import {
    DEFAULT_POINT_COLOR,
    OTHER_GROUP,
    type BasemapColors,
    type PlotConfig
} from "./plot-config";
import { translate } from "@/i18n";
import type { ContourResult } from "./contour";
import type { InterpolationResult } from "./interpolation";
import { isCutEdge, type Geography, type Land } from "@/geo/land";
import type { ContourRing } from "./grid";

const TAU = Math.PI * 2;

/** Arcs per canvas path. Chrome drops the fill of a path above about 150,000 arcs. */
const POINTS_PER_PATH = 10_000;

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

    if (text.startsWith("#")) {
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

    const parts = match[1].split(",").map((part) => Number(part));
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

// -- basemap -----------------------------------------------------------------

/** A point closer than this to the last drawn point, in CSS pixels, drops out of a basemap path. */
const BASEMAP_MIN_STEP = 0.6;

/** Fill the land of a map plot. This runs below the surface and the points. */
export function drawLand(u: uPlot, geography: Geography, colors: BasemapColors): void {
    const mapper = pixelMapper(u);
    if (!mapper) return;

    const { ctx } = u;
    ctx.save();
    clipToPlot(u);
    ctx.fillStyle = colors.land;
    ctx.beginPath();
    traceRings(u, mapper, geography.land, true);
    // The rings of lakes are holes in the land.
    ctx.fill("evenodd");
    ctx.restore();
}

/**
 * Stroke the coastlines, and the country borders when asked. This runs above the surface and the
 * points.
 */
export function drawCoastlines(
    u: uPlot,
    geography: Geography,
    borders: boolean,
    colors: BasemapColors
): void {
    const mapper = pixelMapper(u);
    if (!mapper) return;

    const { ctx } = u;
    const dpr = dprOf(u);
    ctx.save();
    clipToPlot(u);
    ctx.lineJoin = "round";

    if (borders && geography.borders.length > 0) {
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 0.8 * dpr;
        ctx.beginPath();
        traceRings(u, mapper, geography.borders, false);
        ctx.stroke();
    }

    ctx.strokeStyle = colors.coast;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    traceRings(u, mapper, geography.land, false);
    ctx.stroke();
    ctx.restore();
}

/**
 * Clip the canvas to the domain of a field: the land for `land`, and the plot area without the land
 * for `sea`. Lakes count as sea. The clip follows the coastline, not the grid cells.
 */
export function clipToDomain(u: uPlot, land: Land, domain: "sea" | "land"): void {
    const mapper = pixelMapper(u);
    if (!mapper) return;

    const { ctx } = u;
    const { left, top, width, height } = u.bbox;
    ctx.beginPath();
    if (domain === "sea") ctx.rect(left, top, width, height);
    traceRings(u, mapper, land, true);
    ctx.clip("evenodd");
}

/** Clip the canvas to rings in data units, such as the hull of the points. Holes use even-odd. */
export function clipToRings(u: uPlot, rings: ReadonlyArray<ContourRing>): void {
    const mapper = pixelMapper(u);
    if (!mapper) return;

    const { ctx } = u;
    ctx.beginPath();

    for (const ring of rings) {
        if (ring.length < 3) continue;
        ctx.moveTo(mapper.pixelX(ring[0][0]), mapper.pixelY(ring[0][1]));

        for (let i = 1; i < ring.length; i++) {
            ctx.lineTo(mapper.pixelX(ring[i][0]), mapper.pixelY(ring[i][1]));
        }

        ctx.closePath();
    }

    ctx.clip("evenodd");
}

/**
 * Add the rings that reach the view to the current path, also one turn east and west. A fill
 * closes each ring. A stroke leaves out the cut edges along 180° and along a pole.
 */
function traceRings(u: uPlot, mapper: PixelMapper, rings: Land, fill: boolean): void {
    const sx = u.scales.x;
    const sy = u.scales.y;
    if (sx.min == null || sx.max == null || sy.min == null || sy.max == null) return;

    const { ctx } = u;
    const minStep = BASEMAP_MIN_STEP * dprOf(u);
    const x0 = Math.min(sx.min, sx.max);
    const x1 = Math.max(sx.min, sx.max);
    const y0 = Math.min(sy.min, sy.max);
    const y1 = Math.max(sy.min, sy.max);

    for (const ring of rings) {
        if (ring.maxY < y0 || ring.minY > y1) continue;

        for (const shift of [-360, 0, 360]) {
            if (ring.maxX + shift < x0 || ring.minX + shift > x1) continue;

            const points = ring.points;
            let lastX = mapper.pixelX(points[0] + shift);
            let lastY = mapper.pixelY(points[1]);
            ctx.moveTo(lastX, lastY);

            for (let i = 2; i < points.length; i += 2) {
                const x = mapper.pixelX(points[i] + shift);
                const y = mapper.pixelY(points[i + 1]);
                const last = i === points.length - 2;

                if (!fill && isCutEdge(points[i - 2], points[i - 1], points[i], points[i + 1])) {
                    ctx.moveTo(x, y);
                } else if (Math.abs(x - lastX) + Math.abs(y - lastY) < minStep && !last) {
                    continue;
                } else {
                    ctx.lineTo(x, y);
                }

                lastX = x;
                lastY = y;
            }

            if (fill) ctx.closePath();
        }
    }
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

/** The colour of every point when the plot has no Z axis. */
function pointColor(palette: PaletteId): string {
    const colormap = getColormap(palette);
    if (colormap.solid) return getColorTable(colormap.id)[0];
    return DEFAULT_POINT_COLOR;
}

/**
 * Draw a set of rows as circles, as several paths.
 *
 * Above about 150,000 arcs in one path the canvas drops the fill, and it reports
 * no error. Therefore the path is flushed every {@link POINTS_PER_PATH} arcs. A
 * set below that size still draws as one path, and the flush also runs faster.
 *
 * The caller sets the fill style and the alpha. `rows` lists the rows to draw;
 * null draws `count` rows from `offset`.
 */
function fillPointChunks(
    ctx: CanvasRenderingContext2D,
    series: PlotSeries,
    mapper: PixelMapper,
    radius: number,
    count: number,
    rows: ArrayLike<number> | null,
    offset = 0
): void {
    const { pixelX, pixelY } = mapper;
    const xs = series.x;
    const ys = series.y;

    let inPath = 0;
    ctx.beginPath();

    for (let i = 0; i < count; i++) {
        let row = offset + i;
        if (rows) row = rows[i];

        const px = pixelX(xs[row]);
        const py = pixelY(ys[row]);
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, TAU);

        inPath++;
        if (inPath < POINTS_PER_PATH) continue;

        ctx.fill();
        ctx.beginPath();
        inPath = 0;
    }

    ctx.fill();
}

/**
 * Draw every point of the series.
 *
 * The colours come from a fixed table of at most 256 strings. A point takes the
 * index of its Z value in that table. The points are then grouped by index and
 * drawn one colour at a time, so the canvas sets its fill style a few hundred
 * times, not once per row. Without a Z axis the whole set takes one colour.
 *
 * The opacity is one value for the set, so it is a single `globalAlpha` and the
 * palette strings stay opaque.
 *
 * `range` is the colour range of the plot (`colourRangeOf`), so a point has the
 * colour of the surface and of the colour bar at its value.
 */
export function drawPoints(
    u: uPlot,
    series: PlotSeries,
    plot: PlotConfig,
    range: PlotRange | null,
    seriesColors: SeriesColors = DEFAULT_SERIES_COLORS
): void {
    const { ctx } = u;
    const dpr = dprOf(u);
    const radius = Math.max(plot.style.pointRadius * dpr, 0.5);

    const mapper = pixelMapper(u);
    if (!mapper) return;

    const count = series.x.length;

    ctx.save();
    clipToPlot(u);
    ctx.globalAlpha = plot.style.pointOpacity;

    if (series.categories) {
        drawCategoryPoints(ctx, series, series.categories, plot, mapper, radius, seriesColors);
        ctx.restore();
        return;
    }

    if (!series.z || !range) {
        ctx.fillStyle = pointColor(plot.style.palette);
        fillPointChunks(ctx, series, mapper, radius, count, null);
        ctx.restore();
        return;
    }

    const reverse = plot.z?.reverse ?? false;
    const scale = plot.z?.scale ?? "linear";
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

    // A palette step can hold most of the rows, because the buckets divide the Z
    // range and not the row count. Therefore a bucket chunks like the whole set.
    for (let step = 0; step < buckets.length; step++) {
        const bucket = buckets[step];
        if (!bucket) continue;

        ctx.fillStyle = table[step];
        fillPointChunks(ctx, series, mapper, radius, bucket.length, bucket);
    }

    ctx.restore();
}

// -- groups of a text colour column ------------------------------------------

/** The colours of the groups of a text colour column: one per slot, and grey for "Other". */
export interface SeriesColors {
    slots: string[];
    other: string;
}

/** The colours that the canvas uses when the page gives none. See `--plot-series-*` in `tailwind.css`. */
export const DEFAULT_SERIES_COLORS: SeriesColors = {
    slots: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
    other: "#a3a3a3"
};

/** The colour of one group. */
export function categoryColor(
    categories: PlotCategories,
    group: number,
    colors: SeriesColors
): string {
    const slot = categories.slotOf[group];
    if (slot < 0) return colors.other;
    return colors.slots[slot % colors.slots.length];
}

/**
 * Draw the points of a text colour column, one colour per group. "Other" lies
 * below. The largest group comes next, so a small group stays on top. A hidden
 * group draws nothing.
 */
function drawCategoryPoints(
    ctx: CanvasRenderingContext2D,
    series: PlotSeries,
    categories: PlotCategories,
    plot: PlotConfig,
    mapper: PixelMapper,
    radius: number,
    colors: SeriesColors
): void {
    const hidden = new Set(plot.categories.hidden);
    const slots = categories.legend.length;
    const buckets: number[][] = Array.from({ length: slots + 1 }, () => []);

    for (let i = 0; i < series.x.length; i++) {
        const group = categories.index[i];
        if (hidden.has(categoryKeyOf(categories, group))) continue;

        const slot = categories.slotOf[group];
        if (slot < 0) buckets[slots].push(i);
        else buckets[slot].push(i);
    }

    // The legend lists the groups by size, so slot 0 is the largest.
    const order = [slots];
    for (let slot = 0; slot < slots; slot++) order.push(slot);

    for (const slot of order) {
        const bucket = buckets[slot];
        if (bucket.length === 0) continue;

        if (slot === slots) ctx.fillStyle = colors.other;
        else ctx.fillStyle = colors.slots[slot % colors.slots.length];

        fillPointChunks(ctx, series, mapper, radius, bucket.length, bucket);
    }
}

/** One row of the legend of a text colour column. */
export interface CategoryLegendEntry {
    /** The hidden key of the group: its text, or {@link OTHER_GROUP}. */
    key: string;
    label: string;
    rows: number;
    color: string;
}

/** The rows of the legend: the groups with a colour, then "Other". */
export function categoryLegendEntries(
    categories: PlotCategories,
    colors: SeriesColors,
    otherLabel: string
): CategoryLegendEntry[] {
    const entries = categories.legend.map((group) => ({
        key: categories.list[group].name,
        label: categories.list[group].name,
        rows: categories.list[group].rows,
        color: categoryColor(categories, group, colors)
    }));

    if (categories.otherGroups > 0) {
        entries.push({
            key: OTHER_GROUP,
            label: otherLabel,
            rows: categories.otherRows,
            color: colors.other
        });
    }

    return entries;
}

/** A clickable row of the legend, in CSS pixels of the canvas. */
export interface LegendHit {
    key: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface CategoryLegendOptions {
    entries: ReadonlyArray<CategoryLegendEntry>;
    hidden: ReadonlySet<string>;
    title: string;
    textColor: string;
    fontSize: number;
    titleFontSize: number;
    /** The width of the right margin that holds the legend, in CSS pixels. */
    width: number;
    formatCount: (count: number) => string;
}

/** The space between the plot and the legend, and the size of one swatch, in CSS pixels. */
const CATEGORY_LEGEND_GAP = 14;
const CATEGORY_SWATCH = 9;

let measureContext: CanvasRenderingContext2D | null = null;

/** The width of a text in CSS pixels. */
function textWidth(text: string, font: string): number {
    measureContext ??= document.createElement("canvas").getContext("2d");
    if (!measureContext) return text.length * 7;

    measureContext.font = font;
    return measureContext.measureText(text).width;
}

/** The width of the right margin for a legend: its longest row, from 130 to 240 CSS pixels. */
export function categoryLegendWidth(
    entries: ReadonlyArray<CategoryLegendEntry>,
    title: string,
    fontSize: number,
    titleFontSize: number,
    formatCount: (count: number) => string
): number {
    let widest = textWidth(title, `bold ${titleFontSize}px sans-serif`) + 24;

    for (const entry of entries) {
        const text = `${entry.label} ${formatCount(entry.rows)}`;
        widest = Math.max(widest, textWidth(text, `${fontSize}px sans-serif`) + 40);
    }

    return Math.min(240, Math.max(130, widest));
}

/**
 * Draw the legend of a text colour column in the right margin. A hidden group
 * shows faded. Returns the row boxes, so a click on a row can hide its group.
 */
export function drawCategoryLegend(u: uPlot, options: CategoryLegendOptions): LegendHit[] {
    const { ctx } = u;
    const dpr = dprOf(u);
    const { left, top, width, height } = u.bbox;

    const fontSize = options.fontSize * dpr;
    const rowHeight = fontSize * 1.75;
    const swatch = CATEGORY_SWATCH * dpr;
    const x0 = left + width + CATEGORY_LEGEND_GAP * dpr;
    const x1 = x0 + (options.width - CATEGORY_LEGEND_GAP - 4) * dpr;
    const hits: LegendHit[] = [];

    const fit = (text: string, room: number): string => {
        if (ctx.measureText(text).width <= room) return text;

        let cut = text;
        while (cut.length > 1 && ctx.measureText(`${cut}…`).width > room) cut = cut.slice(0, -1);
        return `${cut}…`;
    };

    ctx.save();
    ctx.textBaseline = "middle";

    let y = top + fontSize * 0.7;

    if (options.title) {
        ctx.font = `bold ${options.titleFontSize * dpr}px sans-serif`;
        ctx.fillStyle = options.textColor;
        ctx.textAlign = "left";
        ctx.fillText(fit(options.title, x1 - x0), x0, y);
        y += options.titleFontSize * dpr * 1.7;
    }

    ctx.font = `${fontSize}px sans-serif`;

    for (const entry of options.entries) {
        if (y + rowHeight / 2 > top + height) break;

        const off = options.hidden.has(entry.key);
        const count = options.formatCount(entry.rows);
        const countWidth = ctx.measureText(count).width;
        let swatchAlpha = 1;
        let countAlpha = 0.6;
        if (off) {
            swatchAlpha = 0.3;
            countAlpha = 0.25;
        }

        ctx.globalAlpha = swatchAlpha;
        ctx.fillStyle = entry.color;
        ctx.beginPath();
        ctx.arc(x0 + swatch / 2, y, swatch / 2, 0, TAU);
        ctx.fill();

        ctx.fillStyle = options.textColor;
        ctx.textAlign = "left";
        ctx.fillText(
            fit(entry.label, x1 - x0 - swatch - countWidth - 14 * dpr),
            x0 + swatch + 6 * dpr,
            y
        );

        ctx.globalAlpha = countAlpha;
        ctx.textAlign = "right";
        ctx.fillText(count, x1, y);

        hits.push({
            key: entry.key,
            left: x0 / dpr,
            right: x1 / dpr,
            top: (y - rowHeight / 2) / dpr,
            bottom: (y + rowHeight / 2) / dpr
        });

        y += rowHeight;
    }

    ctx.restore();
    return hits;
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

    const groups = series.groups ?? [{ key: "", start: 0, end: xs.length }];
    const colors = groupColors(plot.style.palette, groups.length, plot.z?.reverse ?? false);

    ctx.save();
    clipToPlot(u);

    ctx.globalAlpha = plot.style.pointOpacity;
    ctx.lineWidth = Math.max(plot.line.width * dpr, 0.5);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

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
            fillPointChunks(ctx, series, mapper, radius, end - start, null, start);
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
 *
 * A solid palette gives every bar the same colour. A range palette instead
 * shades each bar by its count, from zero up to the tallest bar.
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

    let colorOf: (count: number) => string;

    if (getColormap(plot.style.palette).solid) {
        // `groupColors` returns the default point colour below a count of two,
        // which is right for an ungrouped line but wrong here: a histogram bar
        // takes the palette's own colour, not that fallback. Read the table
        // directly instead.
        const flatColor = getColorTable(plot.style.palette)[0];
        colorOf = () => flatColor;
    } else {
        let maxCount = 0;
        for (const count of ys) if (count > maxCount) maxCount = count;
        colorOf = makePaletteScale(plot.style.palette, 0, maxCount);
    }

    ctx.save();
    clipToPlot(u);

    ctx.globalAlpha = plot.style.pointOpacity;

    for (let i = 0; i < xs.length; i++) {
        if (ys[i] === 0) continue;

        const leftEdge = pixelX(xs[i] - half);
        const rightEdge = pixelX(xs[i] + half);
        const barTop = pixelY(ys[i]);

        const x = Math.min(leftEdge, rightEdge) + gap / 2;
        const barWidth = Math.max(Math.abs(rightEdge - leftEdge) - gap, 0.5);

        ctx.fillStyle = colorOf(ys[i]);
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
        rows.push({
            label: options.groups[i].key,
            color: options.colors[i % options.colors.length]
        });
    }

    if (overflow > 0) {
        rows.push({ label: translate("plot.legend.moreGroups", { count: overflow }), color: null });
    }

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

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    if (options.title) {
        ctx.fillStyle = options.textColor;
        ctx.font = `bold ${titleFontSize}px sans-serif`;
        ctx.fillText(options.title, boxX + padding, boxY + padding + titleFontSize / 2);
        ctx.font = `${fontSize}px sans-serif`;
    }

    for (let i = 0; i < rows.length; i++) {
        const centre =
            boxY +
            padding +
            titleHeight +
            rowHeight * i +
            rowHeight / 2 -
            (LEGEND_ROW_GAP * dpr) / 2;

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
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, left + width / 2, Math.round(4 * dpr));
    ctx.restore();
}

// -- caption -----------------------------------------------------------------

export interface CaptionOptions {
    text: string;
    fontSize: number;
    textColor: string;
    /**
     * The distance from the bottom of the canvas to the middle of the line, in
     * CSS pixels. The caller decides it: it owns the padding and the size of the
     * X axis title, and the caption shares that band.
     */
    bottomInset: number;
}

/**
 * Draw the caption, under the plot and against the left edge of the plot area.
 *
 * It names the numbers behind the picture, for example the point counts. It
 * shares its line with the X axis title, which draws centred, so the two sit
 * beside each other on the same band of empty canvas.
 *
 * Nothing is drawn behind the text. The band holds no data, and no clip applies
 * here: the caption is outside the plotting area on purpose.
 */
export function drawCaption(u: uPlot, options: CaptionOptions): void {
    if (!options.text) return;

    const { ctx } = u;
    const { left } = u.bbox;
    const dpr = dprOf(u);

    ctx.save();
    ctx.fillStyle = options.textColor;
    ctx.font = `${options.fontSize * dpr}px sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(options.text, left, ctx.canvas.height - options.bottomInset * dpr);
    ctx.restore();
}

// -- contours ----------------------------------------------------------------

export interface ContourDrawOptions {
    result: ContourResult;
    lineWidth: number;
    showLabels: boolean;
    labelFontSize: number;
    /** The plot background. It gives the halo of each line and the box of each label. */
    backgroundColor: string;
    textColor: string;
    /** Clips the canvas to the land or sea domain. Null for everywhere. */
    clip: (() => void) | null;
}

/** A line shorter than this, in pixels, gets no label. The text would not fit. */
const MIN_LABELLED_RING = 80;

/** The extra width of the halo around a contour line, in CSS pixels. */
const CONTOUR_HALO = 2;

/** One pass of a contour line: a colour and a width in canvas pixels. */
export interface ContourStroke {
    color: string;
    width: number;
}

/**
 * The passes that draw a contour line: a halo in the background colour, then the line in the text
 * colour. A line in the palette colour has the colour of the surface at its level, and disappears.
 */
export function contourStrokes(
    lineWidth: number,
    dpr: number,
    colors: { backgroundColor: string; textColor: string }
): ContourStroke[] {
    return [
        { color: colors.backgroundColor, width: (lineWidth + CONTOUR_HALO) * dpr },
        { color: colors.textColor, width: lineWidth * dpr }
    ];
}

/**
 * Draw the contour lines over the points.
 *
 * The lines arrive in data coordinates, so this converts them with the scales. They stop at the
 * plot area, the domain, the outline of the field and the outline of the cells with a value.
 */
export function drawContours(u: uPlot, options: ContourDrawOptions): void {
    const { ctx } = u;
    const dpr = dprOf(u);

    const { levels, outline, valid } = options.result;

    const toPixelX = (x: number): number => u.valToPos(x, "x", true);
    const toPixelY = (y: number): number => u.valToPos(y, "y", true);

    ctx.save();
    clipToPlot(u);
    options.clip?.();
    if (outline.length >= 3) clipToRings(u, [outline]);
    if (valid) clipToRings(u, valid);

    ctx.lineJoin = "round";

    const paths = levels.map((level) => {
        const path = new Path2D();

        for (const line of level.lines) {
            const points = line.points;
            path.moveTo(toPixelX(points[0][0]), toPixelY(points[0][1]));

            for (let i = 1; i < points.length; i++) {
                path.lineTo(toPixelX(points[i][0]), toPixelY(points[i][1]));
            }

            if (line.closed) path.closePath();
        }

        return path;
    });

    // All halos go first, so a halo never covers a line where two lines meet.
    for (const stroke of contourStrokes(options.lineWidth, dpr, options)) {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        for (const path of paths) ctx.stroke(path);
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
    /** Clips the canvas to the domain, the hull and the valid cells. Null when nothing clips. */
    clip: (() => void) | null;
    /**
     * Give a pixel next to an empty cell the mean of the corners with a value. The clip then cuts
     * the edge along the coastline or the outline, and not along the grid cells.
     */
    fillEdges: boolean;
    /** Draw nothing past the edge of the grid. Without it the edge cells stretch to the plot edge. */
    bounded: boolean;
}

export function drawInterpolationSurface(u: uPlot, options: InterpolationDrawOptions): void {
    const { ctx } = u;
    const { left, top, width, height } = u.bbox;
    const { result } = options;
    const { range, bandCount } = result;
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
    let colourCount = bandCount;
    if (result.renderMode === "continuous") colourCount = 256;
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

            const value = sampleGrid(result, xValue, yValue, options);
            // colorScalePosition gives 0 for NaN, which would paint an empty cell in the lowest colour.
            if (!Number.isFinite(value)) continue;

            const position = colorScalePosition(value, range.min, range.max, options.scale);
            const band = Math.min(Math.floor(position * colourCount), colourCount - 1);
            const colour = colours[band];
            const offset = (pixelRow * imageWidth + pixelColumn) * 4;

            image.data[offset] = colour[0];
            image.data[offset + 1] = colour[1];
            image.data[offset + 2] = colour[2];
            image.data[offset + 3] = colour[3];
        }
    }

    // putImageData replaces the canvas pixels and ignores a clip. drawImage blends the image over
    // the background and the gridlines, inside the clip.
    const layer = document.createElement("canvas");
    layer.width = imageWidth;
    layer.height = imageHeight;
    layer.getContext("2d")?.putImageData(image, 0, 0);

    ctx.save();
    clipToPlot(u);
    options.clip?.();
    ctx.drawImage(layer, Math.round(left), Math.round(top));
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

/** The value of the field at a point: bilinear between the four cell centres around it. */
export function sampleGrid(
    field: InterpolationResult,
    xValue: number,
    yValue: number,
    options: { fillEdges: boolean; bounded: boolean }
): number {
    const { values, xResolution, yResolution, xRange, yRange } = field;
    const u = (xValue - xRange.min) / (xRange.max - xRange.min || 1);
    const v = (yValue - yRange.min) / (yRange.max - yRange.min || 1);
    if (options.bounded && !(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return Number.NaN;

    const gridX = clampNumber(u * xResolution - 0.5, 0, xResolution - 1);
    const gridY = clampNumber(v * yResolution - 0.5, 0, yResolution - 1);
    const leftColumn = Math.floor(gridX);
    const rightColumn = Math.min(leftColumn + 1, xResolution - 1);
    const topRow = Math.floor(gridY);
    const bottomRow = Math.min(topRow + 1, yResolution - 1);
    const xWeight = gridX - leftColumn;
    const yWeight = gridY - topRow;

    const a = values[topRow * xResolution + leftColumn];
    const b = values[topRow * xResolution + rightColumn];
    const c = values[bottomRow * xResolution + leftColumn];
    const d = values[bottomRow * xResolution + rightColumn];

    if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d)) {
        return (
            (a * (1 - xWeight) + b * xWeight) * (1 - yWeight) +
            (c * (1 - xWeight) + d * xWeight) * yWeight
        );
    }

    if (!options.fillEdges) return Number.NaN;

    // At the edge of the domain the corners with a value give the value, and the clip cuts the edge.
    let total = 0;
    let count = 0;
    for (const corner of [a, b, c, d]) {
        if (!Number.isFinite(corner)) continue;
        total += corner;
        count++;
    }

    if (count === 0) return Number.NaN;
    return total / count;
}

function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function drawContourLabels(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    levels: ContourResult["levels"],
    options: ContourDrawOptions,
    toPixelX: (x: number) => number,
    toPixelY: (y: number) => number
): void {
    const fontSize = options.labelFontSize * dpr;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const level of levels) {
        const label = formatValue(level.value);
        const textWidth = ctx.measureText(label).width;

        for (const line of level.lines) {
            const points = line.points;
            if (points.length < 8) continue;

            // The label sits at the middle vertex of the line. That is far from both
            // ends, so it rarely lands on a corner.
            const middle = Math.floor(points.length / 2);
            const x = toPixelX(points[middle][0]);
            const y = toPixelY(points[middle][1]);

            const start = toPixelX(points[0][0]);
            const startY = toPixelY(points[0][1]);

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
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

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
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(options.title, 0, 0);
    }

    ctx.restore();
}
