/**
 * SpatialSelection — an area drawn on the map, and its conversion to query filters.
 *
 * The map offers three draw tools (polygon, box, cross section), but they all end
 * as one closed ring. A box is a five point ring. A cross section is a line plus a
 * width, which {@link crossSectionRing} converts to a ring. So the query model only
 * needs one spatial filter kind.
 *
 * The server side filter is a point-in-polygon test over the longitude and latitude
 * columns. See `beacon-core/src/query/filter/geo_json.rs`. The test reads the raw
 * column, and a producer can store longitudes as -180..180 or as 0..360. So the
 * filter holds every copy of the ring that those two ranges can hold. See
 * {@link ringWorldCopies}.
 */
import type { Filter, GeoJsonFilter, GeoJsonPolygon, MinMaxFilter } from '@/beacon-api/types';
import { detectCoordinateColumns } from '@/geo/coordinate-columns';
import { alignLongitude, TURN } from '@/geo/longitude';
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
    /**
     * The columns the filter tests. The user picks them in the query builder.
     * Both are absent on an area of an older record, and {@link selectionColumns}
     * then falls back to {@link detectCoordinateColumns}.
     */
    latitudeColumn?: string;
    longitudeColumn?: string;
};

/** The pair of columns a spatial filter tests. */
export type CoordinatePair = {
    latitude: string;
    longitude: string;
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

/** The mean radius of the earth, in kilometres. */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * The area of a closed ring, in square kilometres.
 *
 * The formula is the spherical excess of the polygon, so the value stays correct
 * for a large area and at a high latitude. A ring with less than four points has
 * no area.
 */
export function ringAreaKm2(ring: LngLat[]): number {
    const closed = closeRing(ring);
    if (closed.length < 4) return 0;

    const toRadians = Math.PI / 180;
    let total = 0;

    for (let i = 0; i < closed.length - 1; i++) {
        const [lon1, lat1] = closed[i];
        const [lon2, lat2] = closed[i + 1];

        // Keep the step on the short way round, so a ring over the antimeridian
        // does not wrap the globe.
        let deltaLon = (lon2 - lon1) * toRadians;
        if (deltaLon > Math.PI) deltaLon -= 2 * Math.PI;
        if (deltaLon < -Math.PI) deltaLon += 2 * Math.PI;

        total += deltaLon * (2 + Math.sin(lat1 * toRadians) + Math.sin(lat2 * toRadians));
    }

    return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** A short label for an area in square kilometres. */
export function formatAreaKm2(areaKm2: number): string {
    if (areaKm2 === 0) return '0 km²';

    let digits = 0;
    if (areaKm2 < 10) {
        digits = 2;
    } else if (areaKm2 < 100) {
        digits = 1;
    }

    const value = areaKm2.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });

    return `${value} km²`;
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

/** Put the two column names on a selection. The draw tools drop them. */
export function withColumns(
    selection: SpatialSelection,
    columns: CoordinatePair | null
): SpatialSelection {
    if (!columns) return selection;

    return {
        ...selection,
        latitudeColumn: columns.latitude,
        longitudeColumn: columns.longitude
    };
}

/**
 * The two columns a spatial filter must test, or null.
 *
 * The names on the selection win, because the user picked them. They only win
 * while the query still selects both: a filter on a column that the query does
 * not select is invalid. Detection then answers, which also serves an area of
 * an older record, and an area that the map viewer drew.
 */
export function selectionColumns(
    selection: SpatialSelection | null | undefined,
    availableNames: string[]
): CoordinatePair | null {
    const latitude = selection?.latitudeColumn;
    const longitude = selection?.longitudeColumn;

    if (
        latitude &&
        longitude &&
        availableNames.includes(latitude) &&
        availableNames.includes(longitude)
    ) {
        return { latitude, longitude };
    }

    const detection = detectCoordinateColumns(availableNames);
    if (!detection.latitude || !detection.longitude) return null;

    return { latitude: detection.latitude.name, longitude: detection.longitude.name };
}

/**
 * The column of a selection that the query does not select, or null.
 *
 * The builder reports this. The area stays on the draft, so the user can pick
 * the column again, or select it in the query.
 */
export function missingSelectionColumn(
    selection: SpatialSelection | null | undefined,
    availableNames: string[]
): string | null {
    const wanted = [selection?.latitudeColumn, selection?.longitudeColumn].filter(
        Boolean
    ) as string[];

    return wanted.find((name) => !availableNames.includes(name)) ?? null;
}

/** True when the selection has a usable area. */
export function isUsableSelection(selection: SpatialSelection | null | undefined): boolean {
    return !!selection && selection.ring.length >= 4;
}

export function toGeoJsonPolygon(ring: LngLat[]): GeoJsonPolygon {
    return { type: 'Polygon', coordinates: [closeRing(ring)] };
}

/** The lowest and the highest longitude that a producer stores. */
const WORLD_MIN = -180;
const WORLD_MAX = TURN;

/**
 * The copies of the ring that a dataset can match.
 *
 * The map draws -180..180, but a producer stores longitudes in that range or in
 * 0..360, and the server tests the raw column. So the filter holds every copy of
 * the ring that reaches -180..360. A row matches one copy at most, so the copies
 * select the drawn area, and nothing more.
 *
 * The ring moves to -180..180 first, and every point of it moves by the same
 * amount: a move per point breaks the shape. That copy comes first, so a read of
 * the filter finds the ring of the map. See {@link fromGeoJsonFilter}.
 *
 * An area away from a seam gives one copy. An area over a seam gives two, because
 * no single polygon holds both sides of a seam.
 */
export function ringWorldCopies(ring: LngLat[]): LngLat[][] {
    const bounds = ringBounds(ring);
    if (!bounds) return [ring];

    const centre = (bounds.minLon + bounds.maxLon) / 2;
    const home = alignLongitude(centre, 0) - centre;

    const reaching = [home, home - TURN, home + TURN].filter((amount) => {
        return bounds.minLon + amount <= WORLD_MAX && bounds.maxLon + amount >= WORLD_MIN;
    });

    if (reaching.length === 0) {
        return [shiftRing(ring, home)];
    }

    return reaching.map((amount) => shiftRing(ring, amount));
}

/** Move every point of the ring by the same number of degrees. */
function shiftRing(ring: LngLat[], degrees: number): LngLat[] {
    if (degrees === 0) return ring;
    return ring.map(([lon, lat]) => [lon + degrees, lat] as LngLat);
}

/**
 * The filters of a drawn area.
 *
 * The area gives a point-in-polygon filter, plus the bounding box of the polygon.
 * The server can prune data with a min/max test, but not with the polygon test.
 * The box therefore makes the query much faster, and it never removes a row that
 * the polygon keeps.
 *
 * An area that needs two copies of its ring gives two polygons. Each one keeps
 * its own longitude box, so every copy becomes one and-group inside an or-group.
 * The latitude box holds for every copy, so it stays outside. See
 * {@link ringWorldCopies}.
 */
export function toSpatialFilters(
    selection: SpatialSelection,
    latitudeColumn: string,
    longitudeColumn: string
): Filter[] {
    const bounds = ringBounds(selection.ring);
    if (!bounds) return [];

    const latitudeBox: MinMaxFilter = {
        for_query_parameter: latitudeColumn,
        min: bounds.minLat,
        max: bounds.maxLat
    };

    const branches = ringWorldCopies(selection.ring).map((ring) => [
        ringFilter(ring, latitudeColumn, longitudeColumn),
        longitudeBox(ring, longitudeColumn)
    ]);

    if (branches.length === 1) {
        return [...branches[0], latitudeBox];
    }

    return [{ or: branches.map((filters) => ({ and: filters })) }, latitudeBox];
}

/** The point-in-polygon filter of one ring. */
function ringFilter(
    ring: LngLat[],
    latitudeColumn: string,
    longitudeColumn: string
): GeoJsonFilter {
    return {
        longitude_query_parameter: longitudeColumn,
        latitude_query_parameter: latitudeColumn,
        geometry: toGeoJsonPolygon(ring)
    };
}

/** The longitude box of one ring. */
function longitudeBox(ring: LngLat[], longitudeColumn: string): MinMaxFilter {
    const bounds = ringBounds(ring);

    return {
        for_query_parameter: longitudeColumn,
        min: bounds?.minLon ?? -180,
        max: bounds?.maxLon ?? 180
    };
}

/** The area filter of a query, also inside a group. */
export function findGeoJsonFilter(filters: Filter[]): GeoJsonFilter | null {
    for (const filter of filters) {
        if (isGeoJsonFilter(filter)) return filter;

        const members = groupMembers(filter);
        if (!members) continue;

        const found = findGeoJsonFilter(members);
        if (found) return found;
    }

    return null;
}

/** True when the filter is a group that holds an area filter. */
export function holdsGeoJsonFilter(filter: Filter): boolean {
    const members = groupMembers(filter);
    return !!members && !!findGeoJsonFilter(members);
}

/** The filters of a group, or null for a leaf filter. */
function groupMembers(filter: Filter): Filter[] | null {
    const group = filter as Partial<{ and: Filter[]; or: Filter[] }>;

    if (Array.isArray(group.and)) return group.and;
    if (Array.isArray(group.or)) return group.or;

    return null;
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

/**
 * Read a drawn selection back out of a compiled filter.
 *
 * A copy of the ring can lie outside -180..180, so the ring moves back to the
 * range the map draws. The next compile of the area then gives the same copies
 * again. See {@link ringWorldCopies}.
 */
export function fromGeoJsonFilter(filter: GeoJsonFilter): SpatialSelection | null {
    const points = filter.geometry?.coordinates?.[0];
    if (!Array.isArray(points) || points.length < 4) return null;

    const ring = points.map((point) => [Number(point[0]), Number(point[1])] as LngLat);
    const bounds = ringBounds(ring);
    const centre = bounds ? (bounds.minLon + bounds.maxLon) / 2 : 0;

    return {
        mode: 'polygon',
        ring: shiftRing(ring, alignLongitude(centre, 0) - centre),
        latitudeColumn: filter.latitude_query_parameter,
        longitudeColumn: filter.longitude_query_parameter
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
