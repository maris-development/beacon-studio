/**
 * The interpolated field of a plot, and the surface that colours it.
 *
 * One field serves the colours and the contour lines, so both show the same values. A cell has no
 * value outside the land or sea domain, outside the Delaunay hull, and farther from the data than
 * the maximum distance. The renderer then clips to the coastline, to the hull and to the smooth
 * outline of the valid cells, so the edges follow the data and not the grid cells.
 */
import { Delaunay } from "d3-delaunay";
import { colorScalePosition } from "@/colors/color-scale";
import { landMask, type Land } from "@/geo/land";
import { barnesAnalysis } from "./barnes";
import { delaunayField } from "./delaunay";
import {
    binSeries,
    distanceToData,
    hullOf,
    validOutline,
    type ContourRing,
    type GridField,
    type GridSpec
} from "./grid";
import {
    extentOf,
    MAX_GRID_CELLS,
    usesColourBands,
    type PlotConfig,
    type PlotInterpolationConfig
} from "./plot-config";
import { resolveRange, type PlotRange, type PlotSeries } from "./plot-data";

/** Kilometres in one degree of latitude. */
export const KM_PER_DEGREE = 111.32;

/** A length along each axis: in km on a map, where X and Y are equal, else in axis units. */
export interface AxisLengths {
    x: number;
    y: number;
}

export interface InterpolationLengths {
    /** The radius from the spacing of the points. */
    auto: AxisLengths;
    /** The Barnes radius that ran. Null for Delaunay. */
    radius: AxisLengths | null;
    /** How far from the data the surface shows. Null when the extent is not `near`. */
    maxDistance: AxisLengths | null;
}

export interface InterpolationField extends GridField {
    /** The side of the coastline that has values. Null for everywhere. */
    domain: "sea" | "land" | null;
    /** The convex hull of the points for the `hull` extent, else empty. The surface stops at it. */
    outline: ContourRing;
    /** The smooth rings around the cells with a value. Null when each domain cell has one. */
    valid: ContourRing[] | null;
    lengths: InterpolationLengths;
}

export interface InterpolationResult extends InterpolationField {
    /** The Z range that maps the field to colours. */
    range: PlotRange;
    bandCount: number;
    renderMode: "banded" | "continuous";
}

/** The grid cells per radius of an automatic grid, and the limits of that grid. */
const CELLS_PER_RADIUS = 3;
const MIN_AUTO_CELLS = 100;

/** The bins per axis that find the spacing of the points. A finer spacing does not show on the grid. */
const SPACING_BINS = 256;

/** A round step that cuts a span into about `count` parts: 1, 2 or 5 times a power of ten. */
export function niceStep(span: number, count: number): number {
    const raw = span / Math.max(count, 1);
    const power = 10 ** Math.floor(Math.log10(raw || 1));
    const fraction = raw / power;

    if (fraction <= 1) return power;
    if (fraction <= 2) return 2 * power;
    if (fraction <= 5) return 5 * power;
    return 10 * power;
}

/**
 * The typical distance between neighbour points, which is the automatic Barnes radius.
 *
 * Koch, DesJardins and Kocin (1983) tie the Barnes weight to the mean data spacing Δn, with
 * κ = 5.052 (2Δn/π)². A Gaussian with that κ has a sigma of about Δn.
 *
 * The points go into bins, and the bin centres get a Delaunay triangulation. Each edge counts for
 * the axis that it runs along most, so a section of profiles gets the station spacing along X and
 * the level spacing along Y. A map gives one length, the median edge in km. Without a triangulation
 * the radius is a twelfth of the view.
 */
export function dataSpacing(
    series: PlotSeries,
    xRange: PlotRange,
    yRange: PlotRange,
    map: boolean
): AxisLengths {
    const xSpan = xRange.max - xRange.min;
    const ySpan = yRange.max - yRange.min;
    const middle = (((yRange.min + yRange.max) / 2) * Math.PI) / 180;
    const kmX = xSpan * KM_PER_DEGREE * Math.cos(middle);
    const kmY = ySpan * KM_PER_DEGREE;

    let fallback = { x: niceStep(xSpan, 12), y: niceStep(ySpan, 12) };
    if (map) {
        const km = niceStep((kmX + kmY) / 2, 12);
        fallback = { x: km, y: km };
    }

    const points = binCentres(series, xRange, yRange);
    if (points.length < 6) return fallback;

    const { triangles, halfedges } = new Delaunay(points);
    if (triangles.length === 0) return fallback;

    const alongX: number[] = [];
    const alongY: number[] = [];
    const lengths: number[] = [];

    for (let e = 0; e < triangles.length; e++) {
        // Each inner edge has two half-edges. Count it one time.
        if (halfedges[e] > e) continue;

        const a = triangles[e];
        const b = triangles[nextHalfedge(e)];
        const du = Math.abs(points[2 * a] - points[2 * b]);
        const dv = Math.abs(points[2 * a + 1] - points[2 * b + 1]);

        if (map) {
            lengths.push(Math.hypot(du * kmX, dv * kmY));
        } else if (du >= dv) {
            alongX.push(du);
        } else {
            alongY.push(dv);
        }
    }

    if (map) {
        const km = significant(median(lengths));
        return { x: km, y: km };
    }

    let x = median(alongX);
    let y = median(alongY);
    if (!(x > 0)) x = y;
    if (!(y > 0)) y = x;
    if (!(x > 0)) return fallback;

    return { x: significant(x * xSpan), y: significant(y * ySpan) };
}

/** The radius and the maximum distance of the settings, from the automatic radius. */
export function scaleLengthsOf(
    settings: PlotInterpolationConfig,
    auto: AxisLengths,
    map: boolean
): { radius: AxisLengths; maxDistance: AxisLengths } {
    const factor = 2 ** settings.smoothness;
    let radius = {
        x: settings.scaleLength ?? auto.x * factor,
        y: settings.scaleLengthY ?? auto.y * factor
    };
    if (map) radius = { x: radius.x, y: radius.x };

    // Delaunay does not smooth, so its distance follows the spacing of the points.
    let base = radius;
    if (settings.method === "delaunay-barycentric") base = auto;

    let maxDistance = {
        x: settings.maxDistance ?? 2 * base.x,
        y: settings.maxDistanceY ?? 2 * base.y
    };
    if (map) maxDistance = { x: maxDistance.x, y: maxDistance.x };

    return { radius, maxDistance };
}

/** The grid size that gives a few cells per radius, inside its limits. */
export function autoGridCells(
    radius: AxisLengths,
    xRange: PlotRange,
    yRange: PlotRange,
    map: boolean
): { x: number; y: number } {
    let xSpan = xRange.max - xRange.min;
    let ySpan = yRange.max - yRange.min;
    if (map) {
        const middle = (((yRange.min + yRange.max) / 2) * Math.PI) / 180;
        xSpan *= KM_PER_DEGREE * Math.max(Math.cos(middle), 0.05);
        ySpan *= KM_PER_DEGREE;
    }

    const cells = (span: number, length: number): number =>
        Math.min(
            Math.max(Math.ceil((CELLS_PER_RADIUS * span) / length), MIN_AUTO_CELLS),
            MAX_GRID_CELLS
        );
    return { x: cells(xSpan, radius.x), y: cells(ySpan, radius.y) };
}

/**
 * The interpolated field of a series over the axis ranges.
 *
 * `land` applies the land or sea domain of the settings, and `map` says that X and Y are longitude
 * and latitude. `auto` is the radius from the spacing of the points, when the caller has it.
 * Returns null when the series cannot fill a grid.
 */
export function buildInterpolationField(
    series: PlotSeries,
    settings: PlotInterpolationConfig,
    xRange: PlotRange,
    yRange: PlotRange,
    { land, map, auto }: { land: Land | null; map: boolean; auto?: AxisLengths }
): InterpolationField | null {
    if (!series.z || series.x.length < 3) return null;

    const extent = extentOf(settings);
    const barnes = settings.method === "barnes";

    // Inside the hull: the grid covers the data only, and the surface stops at the hull.
    let xr = xRange;
    let yr = yRange;
    let outline: ContourRing = [];
    if (extent === "hull") {
        xr = {
            min: Math.max(xRange.min, series.xRange.min),
            max: Math.min(xRange.max, series.xRange.max)
        };
        yr = {
            min: Math.max(yRange.min, series.yRange.min),
            max: Math.min(yRange.max, series.yRange.max)
        };
        outline = hullOf(series);
    }
    if (!(xr.max > xr.min) || !(yr.max > yr.min)) return null;

    const autoLengths = auto ?? dataSpacing(series, xRange, yRange, map);
    const { radius, maxDistance } = scaleLengthsOf(settings, autoLengths, map);
    let base = autoLengths;
    if (barnes) base = radius;
    const cells = autoGridCells(base, xr, yr, map);

    const grid: GridSpec = {
        xRange: xr,
        yRange: yr,
        xResolution: settings.xGridCells ?? cells.x,
        yResolution: settings.yGridCells ?? cells.y
    };

    let domain: "sea" | "land" | null = null;
    let mask: Uint8Array | null = null;
    if (map && land && settings.domain !== "all") {
        domain = settings.domain;
        mask = landMask(land, grid);
        if (domain === "sea") mask = mask.map((onLand) => 1 - onLand);
    }

    const binned = binSeries(series, grid, mask);
    if (!binned) return null;

    let values: Float64Array | null = null;
    if (barnes) {
        const { sigmaX, sigmaY } = sigmasInCells(grid, radius, map);
        values = barnesAnalysis(binned, grid, sigmaX, sigmaY, mask);
    } else {
        values = delaunayField(series, grid, mask);
    }
    if (!values) return null;

    // Near the data: a cell farther than the maximum distance from a point has no value.
    let score: Float64Array | null = null;
    let threshold = 0.5;
    if (extent === "near") {
        const { xWeight, yWeight } = distanceWeights(grid, maxDistance, map);
        const distance = distanceToData(binned.count, grid, xWeight, yWeight);
        const field = values;
        for (let i = 0; i < field.length; i++) {
            if (distance[i] > 1) field[i] = Number.NaN;
        }

        score = distance.map((value, i) => {
            if (!Number.isFinite(field[i])) return -1e20;
            return -value;
        });
        threshold = -1;
    }

    const field = { ...grid, values };
    let ran: AxisLengths | null = null;
    if (barnes) ran = radius;
    let shownDistance: AxisLengths | null = null;
    if (extent === "near") shownDistance = maxDistance;

    return {
        ...field,
        domain,
        outline,
        valid: validOutline(field, mask, score, threshold),
        lengths: { auto: autoLengths, radius: ran, maxDistance: shownDistance }
    };
}

/** The coloured surface of a field. Returns null when the Z values give no colour range. */
export function buildInterpolationSurface(
    field: InterpolationField,
    series: PlotSeries,
    plot: PlotConfig
): InterpolationResult | null {
    if (!series.z) return null;

    const clipRange = percentileRange(
        series.z,
        plot.interpolation.percentileMin,
        plot.interpolation.percentileMax
    );
    if (!clipRange) return null;

    const range = resolveRange(clipRange, plot.z?.min ?? null, plot.z?.max ?? null);
    if (!(range.max > range.min)) return null;

    const scale = plot.z?.scale ?? "linear";
    if (scale !== "linear") {
        const minPosition = colorScalePosition(range.min, range.min, range.max, scale);
        const maxPosition = colorScalePosition(range.max, range.min, range.max, scale);
        if (!Number.isFinite(minPosition) || !Number.isFinite(maxPosition)) return null;
    }

    let renderMode: InterpolationResult["renderMode"] = "continuous";
    if (usesColourBands(plot.interpolation)) renderMode = "banded";

    return {
        ...field,
        range,
        bandCount: Math.min(Math.max(Math.round(plot.interpolation.bandCount), 2), 100),
        renderMode
    };
}

/** The centres of the bins with a point, as interleaved 0..1 coordinates. */
function binCentres(series: PlotSeries, xRange: PlotRange, yRange: PlotRange): Float64Array {
    const xSpan = xRange.max - xRange.min;
    const ySpan = yRange.max - yRange.min;
    const seen = new Uint8Array(SPACING_BINS * SPACING_BINS);
    const centres: number[] = [];

    for (let i = 0; i < series.x.length; i++) {
        const u = (series.x[i] - xRange.min) / xSpan;
        const v = (series.y[i] - yRange.min) / ySpan;
        if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) continue;

        const column = Math.min(Math.floor(u * SPACING_BINS), SPACING_BINS - 1);
        const row = Math.min(Math.floor(v * SPACING_BINS), SPACING_BINS - 1);
        const bin = row * SPACING_BINS + column;
        if (seen[bin]) continue;

        seen[bin] = 1;
        centres.push((column + 0.5) / SPACING_BINS, (row + 0.5) / SPACING_BINS);
    }

    return Float64Array.from(centres);
}

/** The next half-edge of the same triangle. */
function nextHalfedge(edge: number): number {
    if (edge % 3 === 2) return edge - 2;
    return edge + 1;
}

function median(values: number[]): number {
    if (values.length === 0) return Number.NaN;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/** Two significant digits, so an automatic length reads well. */
function significant(value: number): number {
    return Number(value.toPrecision(2));
}

/**
 * The Gaussian sigmas in cells. On a map the radius is in km, and one degree of longitude
 * shrinks with the latitude, so each row gets its own X sigma.
 */
function sigmasInCells(
    grid: GridSpec,
    radius: AxisLengths,
    map: boolean
): { sigmaX: Float64Array; sigmaY: number } {
    const { xRange, yRange, xResolution, yResolution } = grid;
    const dx = (xRange.max - xRange.min) / xResolution;
    const dy = (yRange.max - yRange.min) / yResolution;
    const sigmaX = new Float64Array(yResolution);

    if (!map) {
        sigmaX.fill(radius.x / dx);
        return { sigmaX, sigmaY: radius.y / dy };
    }

    for (let row = 0; row < yResolution; row++) {
        sigmaX[row] = radius.x / Math.max(dx * kmPerDegreeX(grid, row), 1e-9);
    }

    return { sigmaX, sigmaY: radius.y / (dy * KM_PER_DEGREE) };
}

/** The squared size of one cell, in units of the maximum distance: per row along X, and along Y. */
function distanceWeights(
    grid: GridSpec,
    maxDistance: AxisLengths,
    map: boolean
): { xWeight: Float64Array; yWeight: number } {
    const { xRange, yRange, xResolution, yResolution } = grid;
    const dx = (xRange.max - xRange.min) / xResolution;
    let dy = (yRange.max - yRange.min) / yResolution;
    if (map) dy *= KM_PER_DEGREE;

    const xWeight = new Float64Array(yResolution);
    for (let row = 0; row < yResolution; row++) {
        let width = dx;
        if (map) width = dx * kmPerDegreeX(grid, row);
        xWeight[row] = (width / maxDistance.x) ** 2;
    }

    return { xWeight, yWeight: (dy / maxDistance.y) ** 2 };
}

/** Kilometres in one degree of longitude at the centre of a grid row. */
function kmPerDegreeX(grid: GridSpec, row: number): number {
    const dy = (grid.yRange.max - grid.yRange.min) / grid.yResolution;
    const latitude = ((grid.yRange.min + (row + 0.5) * dy) * Math.PI) / 180;
    return KM_PER_DEGREE * Math.cos(latitude);
}

function percentileRange(
    values: Float64Array,
    minPercentile: number,
    maxPercentile: number
): PlotRange | null {
    const finite: number[] = [];

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (Number.isFinite(value)) finite.push(value);
    }

    if (finite.length === 0) return null;
    finite.sort((a, b) => a - b);

    const min = percentile(finite, minPercentile);
    const max = percentile(finite, maxPercentile);
    if (!(max > min)) return null;

    return { min, max };
}

function percentile(sorted: number[], percentileValue: number): number {
    const position = (Math.min(Math.max(percentileValue, 0), 100) / 100) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];

    const weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
