/**
 * Turns one compiled query into a compact telemetry payload.
 *
 * The result answers the questions that the event table exists for: which table,
 * which columns, which filters, which time range and which output format.
 *
 * Beacon queries run over open data, so the shape carries the filter values as
 * well. A minimum and a maximum on a time column tell which years people ask for.
 *
 * The object goes into `props`. `fitProps` cuts it down when it is too large.
 */

import type { CompiledQuery, Filter, From, GeoJsonPolygon, Output } from '@/beacon-api/types';

/** The longest column list in one shape. The count stays complete. */
const MAX_COLUMNS = 25;

/** The longest filter list in one shape. The count stays complete. */
const MAX_FILTERS = 20;

/** The longest filter value, in characters. */
const MAX_VALUE_CHARS = 40;

/** The filter keys that hold one value and one column. */
const SIMPLE_KINDS = ['eq', 'neq', 'gt', 'gt_eq', 'lt', 'lt_eq'] as const;

export interface FilterShape {
	column: string;
	kind: string;
	min?: number | string;
	max?: number | string;
	value?: number | string;
}

export interface QueryShape {
	/** The table name, or the format and the path of a file source. */
	table: string | null;
	columns: string[];
	columnCount: number;
	filters: FilterShape[];
	filterCount: number;
	/** How many filters of each kind the query holds. */
	filterKinds: Record<string, number>;
	format: string | null;
	limit: number | null;
	offset: number | null;
	/** The bounds of a drawn area, as [west, south, east, north]. */
	bbox?: [number, number, number, number];
	columnsTruncated?: boolean;
	filtersTruncated?: boolean;
}

/** Cuts one filter value to a size that a row can hold. */
function shortValue(value: unknown): number | string | undefined {
	if (typeof value === 'number') return value;

	if (typeof value === 'string') return value.slice(0, MAX_VALUE_CHARS);

	return undefined;
}

/** The table of a query: a name, or the format and the path of a file source. */
function tableOf(from: From | undefined): string | null {
	if (!from) return null;

	if (typeof from === 'string') return from;

	const format = (from as { format?: Record<string, unknown> }).format;

	if (!format) return null;

	const entry = Object.entries(format)[0];

	if (!entry) return null;

	const [kind, value] = entry;
	const path = (value as { path?: unknown } | null)?.path;

	if (typeof path === 'string') return `${kind}:${path}`;

	return kind;
}

/** The output format. A GeoParquet output is an object, every other one is a string. */
function formatOf(output: Output | undefined): string | null {
	const format = output?.format;

	if (!format) return null;

	if (typeof format === 'string') return format;

	return 'geoparquet';
}

/** The bounds of the outer ring of a polygon. */
function bboxOf(geometry: GeoJsonPolygon | undefined): [number, number, number, number] | undefined {
	const ring = geometry?.coordinates?.[0];

	if (!Array.isArray(ring) || ring.length === 0) return undefined;

	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;

	for (const point of ring) {
		const [lon, lat] = point;

		if (typeof lon !== 'number' || typeof lat !== 'number') continue;

		west = Math.min(west, lon);
		east = Math.max(east, lon);
		south = Math.min(south, lat);
		north = Math.max(north, lat);
	}

	if (west === Infinity) return undefined;

	const round = (value: number) => Math.round(value * 1000) / 1000;

	return [round(west), round(south), round(east), round(north)];
}

/** Turns one filter into its column, its kind and its values. */
function describeFilter(filter: Filter): FilterShape | null {
	if (!filter || typeof filter !== 'object') return null;

	const raw = filter as Record<string, unknown>;

	if (typeof raw.for_query_parameter === 'string') {
		const column = raw.for_query_parameter;

		if ('min' in raw || 'max' in raw) {
			return { column, kind: 'min_max', min: shortValue(raw.min), max: shortValue(raw.max) };
		}

		for (const kind of SIMPLE_KINDS) {
			if (kind in raw) return { column, kind, value: shortValue(raw[kind]) };
		}

		return { column, kind: 'unknown' };
	}

	const isNull = raw.is_null as { for_query_parameter?: unknown } | undefined;

	if (isNull && typeof isNull.for_query_parameter === 'string') {
		return { column: isNull.for_query_parameter, kind: 'is_null' };
	}

	const isNotNull = raw.is_not_null as { for_query_parameter?: unknown } | undefined;

	if (isNotNull && typeof isNotNull.for_query_parameter === 'string') {
		return { column: isNotNull.for_query_parameter, kind: 'is_not_null' };
	}

	if (typeof raw.longitude_query_parameter === 'string') {
		const latitude = raw.latitude_query_parameter;
		const column = typeof latitude === 'string' ? `${raw.longitude_query_parameter}/${latitude}` : raw.longitude_query_parameter;

		return { column, kind: 'geojson' };
	}

	if (Array.isArray(raw.or)) return { column: '', kind: 'or', value: raw.or.length };

	if (Array.isArray(raw.and)) return { column: '', kind: 'and', value: raw.and.length };

	return null;
}

/**
 * The drawn area of a query, if it holds one.
 *
 * The scan goes through `or` and `and` groups. An area that crosses the
 * antimeridian gives one group per world copy, so its geometry sits two levels
 * down. See `toSpatialFilters` in `geo/spatial-selection.ts`.
 */
function spatialBbox(filters: Filter[]): [number, number, number, number] | undefined {
	for (const filter of filters) {
		if (!filter || typeof filter !== 'object') continue;

		const raw = filter as { geometry?: GeoJsonPolygon; or?: Filter[]; and?: Filter[] };

		if (raw.geometry) return bboxOf(raw.geometry);

		const group = raw.or ?? raw.and;

		if (!Array.isArray(group)) continue;

		const nested = spatialBbox(group);

		if (nested) return nested;
	}

	return undefined;
}

/**
 * Describes one query for telemetry. Returns null when there is no query.
 *
 * This function always builds the full shape. `track` drops the content keys
 * when the user switched the query detail off. See `CONTENT_KEYS` there.
 *
 * The function never throws: a broken query must not stop a run.
 */
export function describeQuery(query: CompiledQuery | null | undefined): QueryShape | null {
	if (!query) return null;

	try {
		const selects = query.query_parameters ?? [];
		const filters = query.filters ?? [];

		const columns = selects
			.map((select) => select?.column)
			.filter((column): column is string => typeof column === 'string');

		const described: FilterShape[] = [];
		const filterKinds: Record<string, number> = {};

		for (const filter of filters) {
			const shape = describeFilter(filter);

			if (!shape) continue;

			filterKinds[shape.kind] = (filterKinds[shape.kind] ?? 0) + 1;

			if (described.length < MAX_FILTERS) described.push(shape);
		}

		const shape: QueryShape = {
			table: tableOf(query.from),
			columns: columns.slice(0, MAX_COLUMNS),
			columnCount: columns.length,
			filters: described,
			filterCount: filters.length,
			filterKinds,
			format: formatOf(query.output),
			limit: query.limit ?? null,
			offset: query.offset ?? null
		};

		if (columns.length > MAX_COLUMNS) shape.columnsTruncated = true;

		if (filters.length > described.length) shape.filtersTruncated = true;

		const bbox = spatialBbox(filters);

		if (bbox) shape.bbox = bbox;

		return shape;
	} catch {
		return null;
	}
}
