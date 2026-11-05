/**
 * The view of a plot: the part of the data that the axes show, and the rules
 * that change it.
 *
 * The mouse layer of the canvas moves, zooms and stretches the view. These
 * functions hold the arithmetic of each step, so the canvas only reads the mouse
 * and applies the result. They hold no DOM and no uPlot state.
 *
 * A map plot keeps its shape: one km has the same length on both axes. A change
 * to one axis then also changes the other one. {@link fitMapShape} keeps the axis
 * that the user touched, and fits the other one around its centre.
 */

/** One axis of the view, in data units. */
export interface ViewRange {
    min: number;
    max: number;
}

export interface PlotView {
    x: ViewRange;
    y: ViewRange;
}

export type ViewAxis = "x" | "y";

/** The axis that a change sets. On a map the other axis follows it. `both` grows the smaller side. */
export type ViewKeep = ViewAxis | "both";

/** A rectangle in CSS pixels. */
export interface PixelRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface PixelSize {
    width: number;
    height: number;
}

/** One wheel notch makes the range this much smaller, around the pointer. */
export const WHEEL_ZOOM = 0.85;

/** A drag of this many pixels along an axis stretches it by a factor of e. */
export const AXIS_STRETCH_PIXELS = 150;

/** A zoom box thinner than this, in pixels, zooms the other axis only. */
export const FLAT_BOX = 12;

/** The smallest figure that an edge drag gives. */
export const MIN_FIGURE: PixelSize = { width: 240, height: 180 };

/** True when both ranges are finite and have a width. */
export function isUsableView(view: PlotView): boolean {
    const { x, y } = view;
    const finite = [x.min, x.max, y.min, y.max].every(Number.isFinite);
    return finite && x.max > x.min && y.max > y.min;
}

/** The range times `factor`, around `anchor`. The anchor stays at the same place on screen. */
export function zoomAround(range: ViewRange, anchor: number, factor: number): ViewRange {
    return {
        min: anchor - (anchor - range.min) * factor,
        max: anchor + (range.max - anchor) * factor
    };
}

export function panRange(range: ViewRange, delta: number): ViewRange {
    return { min: range.min + delta, max: range.max + delta };
}

/**
 * The zoom factor of an axis drag. A drag right or up gives a factor below one,
 * so the range gets smaller and the axis stretches.
 */
export function stretchFactor(pixels: number): number {
    return Math.exp(-pixels / AXIS_STRETCH_PIXELS);
}

/** The length of one degree of longitude, in degrees of latitude, at the middle of a range. */
export function longitudeScale(latitude: ViewRange): number {
    const middle = (((latitude.min + latitude.max) / 2) * Math.PI) / 180;
    return Math.max(Math.cos(middle), 0.05);
}

/**
 * Fit a map view to a plot box of `ratio` (width / height), so one km has the
 * same length on both axes. `keep` names the axis that stays. With `both` the
 * smaller side grows, so the view still holds all of the input.
 */
export function fitMapShape(view: PlotView, keep: ViewKeep, ratio: number): PlotView {
    const k = longitudeScale(view.y);
    let xs = view.x.max - view.x.min;
    let ys = view.y.max - view.y.min;

    if (keep === "x" || (keep === "both" && (xs * k) / ys > ratio)) {
        ys = (xs * k) / ratio;
    } else {
        xs = (ys * ratio) / k;
    }

    const cx = (view.x.min + view.x.max) / 2;
    const cy = (view.y.min + view.y.max) / 2;

    return {
        x: { min: cx - xs / 2, max: cx + xs / 2 },
        y: { min: cy - ys / 2, max: cy + ys / 2 }
    };
}

/** The first view of a map: the ranges, `pad` times wider, in the shape of the plot box. */
export function mapShapeView(
    xRange: ViewRange,
    yRange: ViewRange,
    box: PixelSize,
    pad = 1
): PlotView {
    const cx = (xRange.min + xRange.max) / 2;
    const cy = (yRange.min + yRange.max) / 2;
    const xs = (xRange.max - xRange.min) * pad || 1;
    const ys = (yRange.max - yRange.min) * pad || 1;

    const padded: PlotView = {
        x: { min: cx - xs / 2, max: cx + xs / 2 },
        y: { min: cy - ys / 2, max: cy + ys / 2 }
    };

    return fitMapShape(padded, "both", box.width / box.height);
}

/** The width of the data on a map divided by its height, with one km as long on both axes. */
export function mapDataAspect(xRange: ViewRange, yRange: ViewRange): number {
    const height = yRange.max - yRange.min || 1;
    return ((xRange.max - xRange.min) * longitudeScale(yRange)) / height;
}

/**
 * The zoom box of a drag from `start` to `end`, inside the plot `area`.
 *
 * A box flatter than {@link FLAT_BOX} on one side zooms only the other axis, and
 * it spans the whole plot on the flat side.
 */
export function zoomBoxOf(
    start: { x: number; y: number },
    end: { x: number; y: number },
    area: PixelRect
): { rect: PixelRect; keep: ViewKeep } {
    const x1 = clamp(end.x, area.left, area.left + area.width);
    const y1 = clamp(end.y, area.top, area.top + area.height);
    const flatY = Math.abs(y1 - start.y) < FLAT_BOX;
    const flatX = Math.abs(x1 - start.x) < FLAT_BOX;

    const left = Math.min(start.x, x1);
    const top = Math.min(start.y, y1);
    const width = Math.abs(x1 - start.x);
    const height = Math.abs(y1 - start.y);

    if (flatY && !flatX) {
        return { rect: { left, top: area.top, width, height: area.height }, keep: "x" };
    }

    if (flatX && !flatY) {
        return { rect: { left: area.left, top, width: area.width, height }, keep: "y" };
    }

    return { rect: { left, top, width, height }, keep: "both" };
}

/**
 * The largest figure in the shape of the data that fits in the room. `margin` is
 * the room that the axes, the titles and the legend take around the plot area.
 */
export function figureForAspect(aspect: number, room: PixelSize, margin: PixelSize): PixelSize {
    let height = room.height - margin.height;
    let width = height * aspect;

    if (width > room.width - margin.width) {
        width = room.width - margin.width;
        height = width / aspect;
    }

    return { width: width + margin.width, height: height + margin.height };
}

/** The figure size of an edge drag: the start size plus two times the move, inside the room. */
export function dragFigureSide(start: number, move: number, min: number, room: number): number {
    return clamp(start + 2 * move, Math.min(min, room), room);
}

/** The text of an axis limit in the axis editor. A time is UTC, as on the time axis. */
export function formatAxisLimit(value: number, time: boolean): string {
    if (time) return new Date(value).toISOString().slice(0, 16).replace("T", " ");
    return String(Number(value.toPrecision(7)));
}

/** Read an axis limit from the axis editor. Returns NaN for a text that is no value. */
export function parseAxisLimit(text: string, time: boolean): number {
    const value = text.trim();
    if (!value) return Number.NaN;
    if (!time) return Number(value);

    let iso = value.replace(" ", "T");
    if (/^\d{4}-\d\d-\d\d$/.test(value)) iso = `${value}T00:00`;

    // A time with no zone is UTC, as on the axis.
    if (!/(Z|[+-]\d\d:?\d\d)$/i.test(iso)) iso = `${iso}Z`;
    return Date.parse(iso);
}

function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}
