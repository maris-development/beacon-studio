/**
 * SpatialSelection — an area drawn on the map, and its conversion to query filters.
 *
 * The map offers three draw tools (polygon, box, cross section), but they all end
 * as one closed ring. A box is a five point ring. A cross section is a line plus a
 * width, which {@link crossSectionRing} converts to a ring. So the query model only
 * needs one spatial filter kind.
 *
 * The server side filter is a point-in-polygon test over the longitude and latitude
 * columns. See `beacon-core/src/query/filter/geo_json.rs`.
 */
import type { GeoJsonFilter, GeoJsonPolygon, MinMaxFilter } from '@/beacon-api/types';
import { getSettings } from '@/stores/settings';

export type SpatialSelectionMode = 'polygon' | 'box' | 'cross-section';

/** A [longitude, latitude] pair, in degrees. */
export type LngLat = [number, number];

export type SpatialSelection = {
    mode: SpatialSelectionMode;
    /** The closed ring that the filter uses. Every mode ends here. */
    ring: LngLat[];
    /** Cross section only: the drawn centre line. */
    line?: LngLat[];
    /** Cross section only: the full width of the band, in kilometres. */
    widthKm?: number;
};

export type Bounds = {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
};

/** Kilometres in one degree of latitude. */
const KM_PER_DEGREE = 111.32;

/**
 * The width of a new cross section band, in kilometres. The user sets the value
 * on the settings page. Call the function at the point of use.
 */
export function defaultCrossSectionWidthKm(): number {
    return getSettings().crossSectionWidthKm;
}

/** Close a ring: repeat the first point at the end, if it is not there already. */
export function closeRing(ring: LngLat[]): LngLat[] {
    if (ring.length < 3) return ring;

    const first = ring[0];
    const last = ring[ring.length - 1];

    if (first[0] === last[0] && first[1] === last[1]) {
        return ring;
    }

    return [...ring, [first[0], first[1]]];
}

/**
 * Convert a centre line and a width to a band shaped ring.
 *
 * The math works in a local equirectangular frame around the centre of the line,
 * so the offset keeps its width in kilometres at every latitude. At an interior
 * vertex the two segment normals are averaged.
 *
 * A very sharp angle can make the two sides cross. The result is still a usable
 * cross section, so the case is not corrected here.
 */
export function crossSectionRing(line: LngLat[], widthKm: number): LngLat[] {
    if (line.length < 2 || widthKm <= 0) return [];

    const centreLat = line.reduce((sum, point) => sum + point[1], 0) / line.length;
    const kmPerDegreeLon = KM_PER_DEGREE * Math.cos((centreLat * Math.PI) / 180);

    // Guard the poles, where a degree of longitude collapses to nothing.
    const lonScale = Math.max(kmPerDegreeLon, 1e-6);

    // Project to kilometres, relative to the first point.
    const origin = line[0];
    const points = line.map(([lon, lat]) => [
        (lon - origin[0]) * lonScale,
        (lat - origin[1]) * KM_PER_DEGREE
    ]);

    const half = widthKm / 2;
    const normals: [number, number][] = [];

    for (let i = 0; i < points.length; i++) {
        const previous = points[i - 1];
        const next = points[i + 1];

        // The tangent at this vertex: the segment, or the average of both segments.
        let tx = 0;
        let ty = 0;

        if (previous) {
            const [dx, dy] = normalise(points[i][0] - previous[0], points[i][1] - previous[1]);
            tx += dx;
            ty += dy;
        }

        if (next) {
            const [dx, dy] = normalise(next[0] - points[i][0], next[1] - points[i][1]);
            tx += dx;
            ty += dy;
        }

        const [ux, uy] = normalise(tx, ty);
        normals.push([-uy, ux]); // rotate the tangent by 90 degrees
    }

    const toLngLat = (x: number, y: number): LngLat => [
        origin[0] + x / lonScale,
        origin[1] + y / KM_PER_DEGREE
    ];

    const leftSide: LngLat[] = [];
    const rightSide: LngLat[] = [];

    for (let i = 0; i < points.length; i++) {
        const [nx, ny] = normals[i];
        leftSide.push(toLngLat(points[i][0] + nx * half, points[i][1] + ny * half));
        rightSide.push(toLngLat(points[i][0] - nx * half, points[i][1] - ny * half));
    }

    return closeRing([...leftSide, ...rightSide.reverse()]);
}

function normalise(x: number, y: number): [number, number] {
    const length = Math.hypot(x, y);
    if (length === 0) return [0, 0];
    return [x / length, y / length];
}

/** The bounding box of a ring. */
export function ringBounds(ring: LngLat[]): Bounds | null {
    if (ring.length === 0) return null;

    const bounds: Bounds = {
        minLon: Infinity,
        maxLon: -Infinity,
        minLat: Infinity,
        maxLat: -Infinity
    };

    for (const [lon, lat] of ring) {
        if (lon < bounds.minLon) bounds.minLon = lon;
        if (lon > bounds.maxLon) bounds.maxLon = lon;
        if (lat < bounds.minLat) bounds.minLat = lat;
        if (lat > bounds.maxLat) bounds.maxLat = lat;
    }

    return bounds;
}

/** Build a selection from a ring drawn with the polygon or the box tool. */
export function makeRingSelection(mode: 'polygon' | 'box', ring: LngLat[]): SpatialSelection {
    return { mode, ring: closeRing(ring) };
}

/** Build a cross section selection from a drawn line and a width. */
export function makeCrossSectionSelection(line: LngLat[], widthKm: number): SpatialSelection {
    return {
        mode: 'cross-section',
        ring: crossSectionRing(line, widthKm),
        line: line.map(([lon, lat]) => [lon, lat] as LngLat),
        widthKm
    };
}

/** True when the selection has a usable area. */
export function isUsableSelection(selection: SpatialSelection | null | undefined): boolean {
    return !!selection && selection.ring.length >= 4;
}

export function toGeoJsonPolygon(selection: SpatialSelection): GeoJsonPolygon {
    return { type: 'Polygon', coordinates: [closeRing(selection.ring)] };
}

/** The point-in-polygon filter for the server. */
export function toGeoJsonFilter(
    selection: SpatialSelection,
    latitudeColumn: string,
    longitudeColumn: string
): GeoJsonFilter {
    return {
        longitude_query_parameter: longitudeColumn,
        latitude_query_parameter: latitudeColumn,
        geometry: toGeoJsonPolygon(selection)
    };
}

/**
 * The bounding box filters that go beside the polygon filter.
 *
 * The server can prune data with a min/max test on the two columns, but not with
 * the polygon test. The box therefore makes the query much faster, and it never
 * removes a row that the polygon keeps.
 */
export function toBboxFilters(
    selection: SpatialSelection,
    latitudeColumn: string,
    longitudeColumn: string
): MinMaxFilter[] {
    const bounds = ringBounds(selection.ring);
    if (!bounds) return [];

    return [
        { for_query_parameter: latitudeColumn, min: bounds.minLat, max: bounds.maxLat },
        { for_query_parameter: longitudeColumn, min: bounds.minLon, max: bounds.maxLon }
    ];
}

/** True when the filter is a point-in-polygon filter. */
export function isGeoJsonFilter(filter: unknown): filter is GeoJsonFilter {
    if (!filter || typeof filter !== 'object') return false;
    const candidate = filter as Record<string, unknown>;
    return (
        typeof candidate.longitude_query_parameter === 'string' &&
        typeof candidate.latitude_query_parameter === 'string' &&
        !!candidate.geometry
    );
}

/** Read a drawn selection back out of a compiled filter. */
export function fromGeoJsonFilter(filter: GeoJsonFilter): SpatialSelection | null {
    const ring = filter.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 4) return null;

    return {
        mode: 'polygon',
        ring: ring.map((point) => [Number(point[0]), Number(point[1])] as LngLat)
    };
}

/** A short label for the area, for the builder chip and the map toolbar. */
export function describeSelection(selection: SpatialSelection): string {
    if (selection.mode === 'box') {
        return 'Box';
    }

    if (selection.mode === 'cross-section') {
        return `Cross section (${selection.widthKm ?? defaultCrossSectionWidthKm()} km)`;
    }

    // The closing point repeats the first one, so it does not count.
    return `Polygon (${Math.max(0, selection.ring.length - 1)} points)`;
}
