/**
 * Land polygons and country borders from Natural Earth, and a land mask on a regular grid.
 *
 * Natural Earth is public domain. The world-atlas package holds it as TopoJSON, in three details.
 * A file loads only when a plot needs it.
 */
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110mUrl from "world-atlas/land-110m.json?url";
import land50mUrl from "world-atlas/land-50m.json?url";
import land10mUrl from "world-atlas/land-10m.json?url";
import countries110mUrl from "world-atlas/countries-110m.json?url";
import countries50mUrl from "world-atlas/countries-50m.json?url";
import countries10mUrl from "world-atlas/countries-10m.json?url";

export type LandDetail = "110m" | "50m" | "10m";

/** One ring or line of `[lon, lat]` pairs. The longitude does not jump at 180°. */
export interface LandRing {
    /** Interleaved longitude and latitude values. */
    points: Float64Array;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export type Land = ReadonlyArray<LandRing>;

/** The land of one detail, and the country borders when a plot asked for them. */
export interface Geography {
    detail: LandDetail;
    land: Land;
    /** Open lines. Empty when the plot did not ask for borders. */
    borders: Land;
}

/** A regular grid in degrees. Row 0 is at the south edge. */
export interface LandGrid {
    xRange: { min: number; max: number };
    yRange: { min: number; max: number };
    xResolution: number;
    yResolution: number;
}

const LAND_SOURCES: Record<LandDetail, string> = {
    "110m": land110mUrl,
    "50m": land50mUrl,
    "10m": land10mUrl
};

const COUNTRY_SOURCES: Record<LandDetail, string> = {
    "110m": countries110mUrl,
    "50m": countries50mUrl,
    "10m": countries10mUrl
};

/** The details from coarse to fine. */
export const LAND_DETAILS: ReadonlyArray<LandDetail> = ["110m", "50m", "10m"];

const loadedLand = new Map<LandDetail, Promise<Land>>();
const loadedBorders = new Map<LandDetail, Promise<Land>>();
const ready = new Map<string, Geography>();

/** The detail that suits a map of this extent, in degrees: the larger of the two axis spans. */
export function landDetailForSpan(span: number): LandDetail {
    if (span > 60) return "110m";
    if (span > 12) return "50m";
    return "10m";
}

/**
 * True for an edge that is not coastline: a cut along 180°, or the closure of a ring along a pole.
 * A fill needs these edges, and a coastline stroke skips them.
 */
export function isCutEdge(x1: number, y1: number, x2: number, y2: number): boolean {
    const onSeam = (x: number): boolean => Math.abs((((x % 360) + 360) % 360) - 180) < 1e-9;
    if (onSeam(x1) && onSeam(x2)) return true;
    return Math.abs(y1) === 90 && y1 === y2;
}

/** Load the land of one detail. Each detail loads one time. */
export function loadLand(detail: LandDetail): Promise<Land> {
    return loadOnce(loadedLand, detail, LAND_SOURCES[detail], topologyToLand);
}

/** Load the land of one detail, and its country borders when asked. */
export async function loadGeography(detail: LandDetail, borders: boolean): Promise<Geography> {
    let pendingBorders: Promise<Land> = Promise.resolve([]);
    if (borders) {
        pendingBorders = loadOnce(
            loadedBorders,
            detail,
            COUNTRY_SOURCES[detail],
            topologyToBorders
        );
    }

    const [land, lines] = await Promise.all([loadLand(detail), pendingBorders]);

    const geography = { detail, land, borders: lines };
    ready.set(geographyKey(detail, borders), geography);
    return geography;
}

/** The geography of a detail when it has loaded already, or null. A draw reads this and does not wait. */
export function readyGeography(detail: LandDetail, borders: boolean): Geography | null {
    return ready.get(geographyKey(detail, borders)) ?? null;
}

function geographyKey(detail: LandDetail, borders: boolean): string {
    if (borders) return `${detail}+borders`;
    return detail;
}

function loadOnce(
    cache: Map<LandDetail, Promise<Land>>,
    detail: LandDetail,
    url: string,
    read: (topology: Topology) => Land
): Promise<Land> {
    let pending = cache.get(detail);

    if (!pending) {
        pending = fetch(url)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<Topology>;
            })
            .then(read);

        // A failed load can try again on the next plot.
        pending.catch(() => cache.delete(detail));
        cache.set(detail, pending);
    }

    return pending;
}

/** The borders between two countries of a world-atlas topology, as open lines. Coastlines are not in it. */
export function topologyToBorders(topology: Topology): Land {
    const lines = mesh(
        topology,
        topology.objects.countries as GeometryCollection,
        (a, b) => a !== b
    );
    const result: LandRing[] = [];

    for (const line of lines.coordinates) {
        const border = makeLandRing(line, false);
        if (border) result.push(border);
    }

    return result;
}

/** The rings of the `land` object of a world-atlas topology. */
export function topologyToLand(topology: Topology): Land {
    const collection = feature(topology, topology.objects.land as GeometryCollection);
    const rings: LandRing[] = [];

    for (const item of collection.features) {
        const geometry = item.geometry;
        let polygons: number[][][][] = [];
        if (geometry.type === "Polygon") polygons = [geometry.coordinates];
        if (geometry.type === "MultiPolygon") polygons = geometry.coordinates;

        for (const polygon of polygons) {
            for (const ring of polygon) {
                const landRing = makeLandRing(ring);
                if (landRing) rings.push(landRing);
            }
        }
    }

    return rings;
}

/**
 * Make the longitude of a ring or a line continuous.
 *
 * Natural Earth jumps from 180° to -180° inside a ring. After the unwrap, a ring that crosses 180°
 * two times closes again. A ring that crosses one time goes around a pole, and it closes along that pole.
 * A line (`closed` false) does not close.
 */
export function makeLandRing(
    ring: ReadonlyArray<ReadonlyArray<number>>,
    closed = true
): LandRing | null {
    if (ring.length < 2 || (closed && ring.length < 4)) return null;

    const xs: number[] = [];
    const ys: number[] = [];
    let offset = 0;
    let latitudeSum = 0;

    for (let i = 0; i < ring.length; i++) {
        if (i > 0) {
            const step = ring[i][0] - ring[i - 1][0];
            if (step > 180) offset -= 360;
            if (step < -180) offset += 360;
        }

        xs.push(ring[i][0] + offset);
        ys.push(ring[i][1]);
        latitudeSum += ring[i][1];
    }

    if (closed && offset !== 0) {
        let pole = 90;
        if (latitudeSum < 0) pole = -90;

        xs.push(xs[xs.length - 1], xs[0], xs[0]);
        ys.push(pole, pole, ys[0]);
    }

    const points = new Float64Array(xs.length * 2);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < xs.length; i++) {
        points[i * 2] = xs[i];
        points[i * 2 + 1] = ys[i];
        minX = Math.min(minX, xs[i]);
        maxX = Math.max(maxX, xs[i]);
        minY = Math.min(minY, ys[i]);
        maxY = Math.max(maxY, ys[i]);
    }

    return { points, minX, maxX, minY, maxY };
}

/**
 * A mask with 1 for each grid cell whose centre is on land.
 *
 * A scan line through the cell centres of each row counts the ring edges that it crosses: an odd count
 * on the left of a centre puts the centre on land. A grid on 0..360° also works, because each ring
 * also counts one turn east and one turn west.
 */
export function landMask(land: Land, grid: LandGrid): Uint8Array {
    const { xRange, yRange, xResolution, yResolution } = grid;
    const xStep = (xRange.max - xRange.min) / xResolution;
    const yStep = (yRange.max - yRange.min) / yResolution;
    const crossings: number[][] = Array.from({ length: yResolution }, () => []);

    for (const ring of land) {
        if (ring.maxY < yRange.min || ring.minY > yRange.max) continue;

        for (const shift of [-360, 0, 360]) {
            // A ring on one side of the grid adds an even count to each row, so it changes nothing.
            if (ring.maxX + shift < xRange.min || ring.minX + shift > xRange.max) continue;
            addCrossings(ring.points, shift, yRange.min, yStep, yResolution, crossings);
        }
    }

    const mask = new Uint8Array(xResolution * yResolution);

    for (let row = 0; row < yResolution; row++) {
        const xs = crossings[row].sort((a, b) => a - b);
        let passed = 0;

        for (let column = 0; column < xResolution; column++) {
            const x = xRange.min + (column + 0.5) * xStep;
            while (passed < xs.length && xs[passed] < x) passed++;
            if (passed % 2 === 1) mask[row * xResolution + column] = 1;
        }
    }

    return mask;
}

function addCrossings(
    points: Float64Array,
    shift: number,
    yMin: number,
    yStep: number,
    yResolution: number,
    crossings: number[][]
): void {
    for (let i = 2; i < points.length; i += 2) {
        const x1 = points[i - 2] + shift;
        const y1 = points[i - 1];
        const x2 = points[i] + shift;
        const y2 = points[i + 1];
        if (y1 === y2) continue;

        const low = Math.max(Math.floor((Math.min(y1, y2) - yMin) / yStep - 0.5), 0);
        const high = Math.min(Math.ceil((Math.max(y1, y2) - yMin) / yStep - 0.5), yResolution - 1);

        for (let row = low; row <= high; row++) {
            const y = yMin + (row + 0.5) * yStep;
            if (y1 > y === y2 > y) continue;
            crossings[row].push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
    }
}
