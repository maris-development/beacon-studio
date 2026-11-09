import { describe, expect, it } from "vitest";
import {
    isCutEdge,
    landDetailForSpan,
    landMask,
    makeLandRing,
    type Land,
    type LandRing
} from "../land";

/** The ring as `[lon, lat]` pairs. */
function pairsOf(ring: LandRing): Array<[number, number]> {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < ring.points.length; i += 2)
        pairs.push([ring.points[i], ring.points[i + 1]]);
    return pairs;
}

function ringOf(points: Array<[number, number]>): LandRing {
    const ring = makeLandRing(points);
    if (!ring) throw new Error("No ring");
    return ring;
}

/** The mask as one string per row, from north to south. */
function rowsOf(mask: Uint8Array, columns: number): string[] {
    const rows: string[] = [];
    for (let start = 0; start < mask.length; start += columns) {
        rows.unshift(Array.from(mask.subarray(start, start + columns)).join(""));
    }
    return rows;
}

const SQUARE = ringOf([
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0]
]);

/** A ring around the south pole, below 70° S. Natural Earth cuts it at 180°. */
const SOUTH_POLE = ringOf([
    [0, -70],
    [120, -70],
    [-120, -70],
    [0, -70]
]);

describe("makeLandRing", () => {
    it("keeps a ring away from 180° as it is", () => {
        expect(pairsOf(SQUARE)).toEqual([
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0]
        ]);
        expect([SQUARE.minX, SQUARE.maxX, SQUARE.minY, SQUARE.maxY]).toEqual([0, 10, 0, 10]);
    });

    it("unwraps a ring that crosses 180° two times", () => {
        const ring = ringOf([
            [170, 0],
            [-170, 0],
            [-170, 10],
            [170, 10],
            [170, 0]
        ]);

        expect(pairsOf(ring)).toEqual([
            [170, 0],
            [190, 0],
            [190, 10],
            [170, 10],
            [170, 0]
        ]);
        expect([ring.minX, ring.maxX]).toEqual([170, 190]);
    });

    it("closes a ring around the south pole along the pole", () => {
        expect(pairsOf(SOUTH_POLE)).toEqual([
            [0, -70],
            [120, -70],
            [240, -70],
            [360, -70],
            [360, -90],
            [0, -90],
            [0, -70]
        ]);
        expect(SOUTH_POLE.minY).toBe(-90);
    });

    it("closes a ring around the north pole along the pole", () => {
        const ring = ringOf([
            [0, 80],
            [-120, 80],
            [120, 80],
            [0, 80]
        ]);

        expect(pairsOf(ring).slice(-3)).toEqual([
            [-360, 90],
            [0, 90],
            [0, 80]
        ]);
        expect(ring.maxY).toBe(90);
    });

    it("does not close a line", () => {
        const line = makeLandRing(
            [
                [170, 0],
                [-170, 5]
            ],
            false
        );

        expect(line && pairsOf(line)).toEqual([
            [170, 0],
            [190, 5]
        ]);
    });

    it("refuses a ring or a line with too few points", () => {
        expect(
            makeLandRing([
                [0, 0],
                [1, 0],
                [0, 0]
            ])
        ).toBeNull();
        expect(makeLandRing([[0, 0]], false)).toBeNull();
    });
});

describe("landMask", () => {
    it("marks the cells whose centre is on land", () => {
        const mask = landMask([SQUARE], {
            xRange: { min: -5, max: 15 },
            yRange: { min: -5, max: 15 },
            xResolution: 4,
            yResolution: 4
        });

        expect(rowsOf(mask, 4)).toEqual(["0000", "0110", "0110", "0000"]);
    });

    it("finds land west of 180° on a grid of 0..360°", () => {
        const land: Land = [
            ringOf([
                [-175, 0],
                [-165, 0],
                [-165, 10],
                [-175, 10],
                [-175, 0]
            ])
        ];
        const mask = landMask(land, {
            xRange: { min: 180, max: 200 },
            yRange: { min: 0, max: 10 },
            xResolution: 4,
            yResolution: 2
        });

        expect(rowsOf(mask, 4)).toEqual(["0110", "0110"]);
    });

    it("finds an unwrapped ring east of 180° on a grid of -180..180°", () => {
        const land: Land = [
            ringOf([
                [170, 0],
                [-170, 0],
                [-170, 10],
                [170, 10],
                [170, 0]
            ])
        ];
        const mask = landMask(land, {
            xRange: { min: -180, max: -160 },
            yRange: { min: 0, max: 10 },
            xResolution: 4,
            yResolution: 2
        });

        expect(rowsOf(mask, 4)).toEqual(["1100", "1100"]);
    });

    it("fills the cap of a ring around the pole", () => {
        const mask = landMask([SOUTH_POLE], {
            xRange: { min: 0, max: 360 },
            yRange: { min: -90, max: -60 },
            xResolution: 4,
            yResolution: 3
        });

        expect(rowsOf(mask, 4)).toEqual(["0000", "1111", "1111"]);
    });

    it("gives no land for a grid away from every ring", () => {
        const mask = landMask([SQUARE], {
            xRange: { min: 50, max: 60 },
            yRange: { min: 50, max: 60 },
            xResolution: 2,
            yResolution: 2
        });

        expect(Array.from(mask)).toEqual([0, 0, 0, 0]);
    });
});

describe("landDetailForSpan", () => {
    it("gives a coarse detail for a large span and a fine one for a small span", () => {
        expect(landDetailForSpan(360)).toBe("110m");
        expect(landDetailForSpan(61)).toBe("110m");
        expect(landDetailForSpan(60)).toBe("50m");
        expect(landDetailForSpan(13)).toBe("50m");
        expect(landDetailForSpan(12)).toBe("10m");
        expect(landDetailForSpan(0.5)).toBe("10m");
    });
});

describe("isCutEdge", () => {
    it("finds an edge along 180°", () => {
        expect(isCutEdge(180, 0, 180, 10)).toBe(true);
        expect(isCutEdge(-180, 0, -180, 10)).toBe(true);
        expect(isCutEdge(540, 0, 540, 10)).toBe(true);
    });

    it("finds an edge along a pole", () => {
        expect(isCutEdge(360, -90, 0, -90)).toBe(true);
        expect(isCutEdge(0, 90, 120, 90)).toBe(true);
    });

    it("keeps a coastline edge", () => {
        expect(isCutEdge(170, 0, 180, 10)).toBe(false);
        expect(isCutEdge(0, -89, 10, -89)).toBe(false);
        expect(isCutEdge(0, -90, 0, -80)).toBe(false);
    });
});
