/**
 * Contour lines of the interpolated field.
 *
 * The lines trace the same field as the coloured surface, so the two always agree. The tracer needs
 * a value in each cell, so it gets a copy with each gap filled from its neighbours. The renderer
 * then clips the lines to the coastline, to the outline of the field and to the outline of the
 * valid cells, as it clips the surface.
 *
 * The output is in data coordinates. The chart owns the scales, so the lines survive a resize.
 */
import { contours as d3Contours } from "d3-contour";
import { colorScaleValue } from "@/colors/color-scale";
import { fillGridGaps, type ContourRing } from "./grid";
import type { InterpolationField } from "./interpolation";
import type { PlotConfig } from "./plot-config";
import type { PlotRange } from "./plot-data";

/** One isoline. A ring that ran on the edge of the grid splits there into open lines. */
export interface ContourLine {
    points: ContourRing;
    closed: boolean;
}

export interface ContourLevel {
    /** The Z value of this level. */
    value: number;
    lines: ContourLine[];
}

export interface ContourResult {
    levels: ContourLevel[];
    /** The side of the coastline that the field covers. Null for everywhere. */
    domain: "sea" | "land" | null;
    /** The rings around the cells with a value, or null when each cell has one. */
    valid: ContourRing[] | null;
    /** The outline of the field. The lines stop at it, as the surface does. */
    outline: ContourRing;
    /** The Z range that the levels span. The colour of a level comes from it. */
    range: PlotRange;
}

/**
 * The contour lines of a field. The levels span `range`, the colour range of the plot
 * (`colourRangeOf`), so each line has the colour of the surface below it. Returns null when there
 * is no level to draw.
 */
export function buildContours(
    field: InterpolationField,
    plot: PlotConfig,
    range: PlotRange
): ContourResult | null {
    if (!(range.max > range.min)) return null;

    const { xResolution: nx, yResolution: ny } = field;
    if (!field.values.some(Number.isFinite)) return null;

    const levelCount = Math.min(Math.max(Math.round(plot.contour.levelCount), 2), 50);
    // The levels sit between the ends: a level at an end encloses nothing or everything.
    const thresholds: number[] = [];
    for (let i = 1; i <= levelCount; i++) {
        thresholds.push(
            colorScaleValue(i / (levelCount + 1), range.min, range.max, plot.z?.scale ?? "linear")
        );
    }

    // Grid space runs 0..resolution, with cell i between i and i + 1.
    const xStep = (field.xRange.max - field.xRange.min) / nx;
    const yStep = (field.yRange.max - field.yRange.min) / ny;
    const toData = ([x, y]: number[]): [number, number] => [
        field.xRange.min + x * xStep,
        field.yRange.min + y * yStep
    ];

    // A ring edge with both ends on the frame of the grid is the edge of a region, not an
    // isoline. That also holds for the short cut that d3 makes across a corner.
    const onBorder = ([x, y]: number[]): boolean => x === 0 || x === nx || y === 0 || y === ny;
    const onFrame = (a: number[], b: number[]): boolean => onBorder(a) && onBorder(b);

    const filled = fillGridGaps(field.values, nx);
    const shapes = d3Contours().size([nx, ny]).thresholds(thresholds)(Array.from(filled));
    const levels: ContourLevel[] = [];

    for (const shape of shapes) {
        const lines: ContourLine[] = [];

        for (const ring of shape.coordinates.flat()) {
            const pieces = splitAtFrame(ring, onFrame);

            if (pieces) {
                for (const piece of pieces) {
                    if (piece.length > 1) lines.push({ points: piece.map(toData), closed: false });
                }
                continue;
            }

            // A loop inside one or two cells is grid noise.
            if (spansCells(ring) < 2) continue;
            lines.push({ points: ring.map(toData), closed: true });
        }

        if (lines.length > 0) levels.push({ value: shape.value, lines });
    }

    if (levels.length === 0) return null;
    return { levels, domain: field.domain, valid: field.valid, outline: field.outline, range };
}

/** The open pieces of a ring between its edges on the frame, or null when it has no such edge. */
function splitAtFrame(
    ring: number[][],
    onFrame: (a: number[], b: number[]) => boolean
): number[][][] | null {
    const pieces: number[][][] = [];
    let piece = [ring[0]];
    let split = false;

    for (let i = 1; i < ring.length; i++) {
        if (onFrame(ring[i - 1], ring[i])) {
            split = true;
            pieces.push(piece);
            piece = [ring[i]];
        } else {
            piece.push(ring[i]);
        }
    }

    pieces.push(piece);
    if (!split) return null;

    // The ring is closed, so its last piece runs on into its first piece.
    const last = pieces[pieces.length - 1];
    if (pieces.length > 1 && pieces[0].length > 1 && last.length > 1) {
        pieces.pop();
        pieces[0] = last.concat(pieces[0].slice(1));
    }

    return pieces;
}

/** The larger side of the box around a ring, in cells. */
function spansCells(ring: number[][]): number {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;

    for (const [x, y] of ring) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
    }

    return Math.max(x1 - x0, y1 - y0);
}
