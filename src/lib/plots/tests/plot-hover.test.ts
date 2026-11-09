import { describe, expect, it } from "vitest";
import {
    buildPointIndex,
    forEachPointNear,
    insideRing,
    nearestPoint,
    type PixelTransform
} from "../plot-hover";

const IDENTITY: PixelTransform = { ax: 1, bx: 0, ay: 1, by: 0 };

/** A scaled transform with a reversed Y axis, as on a screen. */
const SCREEN: PixelTransform = { ax: 3, bx: 7, ay: -2, by: 500 };

/** Repeatable random numbers in [0, 1). */
function random(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function randomPoints(count: number, seed: number): { x: Float64Array; y: Float64Array } {
    const next = random(seed);
    const x = Float64Array.from({ length: count }, () => next() * 100);
    const y = Float64Array.from({ length: count }, () => next() * 50 - 25);
    return { x, y };
}

/** The squared pixel distance of each point within `radius`, found without the index. */
function pointsNear(
    x: Float64Array,
    y: Float64Array,
    transform: PixelTransform,
    px: number,
    py: number,
    radius: number
): Map<number, number> {
    const found = new Map<number, number>();
    for (let i = 0; i < x.length; i++) {
        const dx = transform.ax * x[i] + transform.bx - px;
        const dy = transform.ay * y[i] + transform.by - py;
        const distance = dx * dx + dy * dy;
        if (distance <= radius * radius) found.set(i, distance);
    }
    return found;
}

describe("nearestPoint", () => {
    const x = Float64Array.from([0, 10, 10, 5]);
    const y = Float64Array.from([0, 0, 10, 5]);
    const index = buildPointIndex(x, y);

    it("finds the nearest point within the radius", () => {
        expect(nearestPoint(index, IDENTITY, 9, 1, 5)).toBe(1);
        expect(nearestPoint(index, IDENTITY, 6, 6, 5)).toBe(3);
    });

    it("returns -1 when no point is near", () => {
        expect(nearestPoint(index, IDENTITY, 50, 50, 5)).toBe(-1);
        expect(nearestPoint(index, IDENTITY, -50, -50, 5)).toBe(-1);
    });

    it("skips a point that accept refuses", () => {
        expect(nearestPoint(index, IDENTITY, 9, 1, 5, (point) => point !== 1)).toBe(-1);
        expect(nearestPoint(index, IDENTITY, 9, 1, 10, (point) => point !== 1)).toBe(3);
    });

    it("measures the distance in pixels on a reversed axis", () => {
        // The point (10, 10) is at pixel (37, 480).
        expect(nearestPoint(index, SCREEN, 37, 480, 1)).toBe(2);
        expect(nearestPoint(index, SCREEN, 37, 520, 1)).toBe(-1);
    });

    it("finds no point for an axis with no scale", () => {
        expect(nearestPoint(index, { ...IDENTITY, ax: 0 }, 0, 0, 5)).toBe(-1);
    });

    it("finds no point in an empty index", () => {
        const empty = buildPointIndex(new Float64Array(0), new Float64Array(0));
        expect(nearestPoint(empty, IDENTITY, 0, 0, 5)).toBe(-1);
    });

    it("finds a point when all points have the same place", () => {
        const same = buildPointIndex(Float64Array.from([4, 4, 4]), Float64Array.from([2, 2, 2]));
        expect(nearestPoint(same, IDENTITY, 4.5, 2, 1)).toBe(0);
    });

    it("gives the same point as a full scan", () => {
        const points = randomPoints(3000, 7);
        const large = buildPointIndex(points.x, points.y);
        const next = random(11);

        for (let k = 0; k < 200; k++) {
            const px = next() * 340;
            const py = 400 + next() * 200;
            const near = pointsNear(points.x, points.y, SCREEN, px, py, 6);
            const best = nearestPoint(large, SCREEN, px, py, 6);

            if (near.size === 0) {
                expect(best).toBe(-1);
            } else {
                expect(near.get(best)).toBe(Math.min(...near.values()));
            }
        }
    });
});

describe("forEachPointNear", () => {
    it("visits the same points as a full scan, with their distance", () => {
        const points = randomPoints(3000, 3);
        const index = buildPointIndex(points.x, points.y);
        const next = random(5);

        for (let k = 0; k < 200; k++) {
            const px = next() * 340;
            const py = 400 + next() * 200;
            const visited = new Map<number, number>();
            forEachPointNear(index, SCREEN, px, py, 10, (point, distance) =>
                visited.set(point, distance)
            );

            expect(visited).toEqual(pointsNear(points.x, points.y, SCREEN, px, py, 10));
        }
    });
});

describe("insideRing", () => {
    const square: Array<[number, number]> = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
    ];

    it("finds a point inside a square", () => {
        expect(insideRing(square, 5, 5)).toBe(true);
    });

    it("finds a point outside a square", () => {
        expect(insideRing(square, 15, 5)).toBe(false);
        expect(insideRing(square, -1, 5)).toBe(false);
        expect(insideRing(square, 5, 11)).toBe(false);
    });

    it("finds the notch of a concave ring outside", () => {
        const shape: Array<[number, number]> = [
            [0, 0],
            [10, 0],
            [10, 5],
            [5, 5],
            [5, 10],
            [0, 10],
            [0, 0]
        ];

        expect(insideRing(shape, 7, 7)).toBe(false);
        expect(insideRing(shape, 2, 7)).toBe(true);
        expect(insideRing(shape, 7, 2)).toBe(true);
    });

    it("finds no point inside an empty ring", () => {
        expect(insideRing([], 0, 0)).toBe(false);
    });
});
