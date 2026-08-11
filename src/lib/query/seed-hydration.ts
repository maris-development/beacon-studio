/**
 * Seed hydration — the reverse of {@link compileDraft}.
 *
 * A deep link (or an imported query) arrives as a CompiledQuery. The builder
 * edits a {@link QueryDraft}. This module translates the one into the other on
 * a best-effort basis: it reports the parts it cannot represent instead of
 * failing, so the user still gets the query that the builder can express.
 *
 * It is pure: it reads a query plus the table schema, and returns a draft. It
 * touches no component state and shows no toast. The caller decides what to do
 * with `droppedParts`.
 */
import type { CompiledQuery, DataType, Filter } from '@/beacon-api/types';
import { Utils } from '@/utils';
import type { SelectedFilterType } from '@/query/filter-types';
import type { SelectedField } from '@/query/draft';
import {
	fromGeoJsonFilter,
	isGeoJsonFilter,
	ringBounds,
	type SpatialSelection
} from '@/geo/spatial-selection';

/**
 * A column of the table the query reads from, in the shape the builder holds
 * it. Not the API `SchemaField`, which names the type `data_type`.
 */
export type SchemaColumn = {
	name: string;
	type: DataType;
};

/** The builder state read back from a CompiledQuery. */
export type HydratedSeed = {
	selectedFields: SelectedField[];
	spatialFilter: SpatialSelection | null;
	/** The output format of the query, or null when it has none the builder knows. */
	outputFormat: string | null;
	/** Number of query parts the builder cannot represent. */
	droppedParts: number;
};

/** The label the filter dropdown shows for a filter value. */
export function filterLabel(filter: SelectedFilterType['filter_value']): string {
	switch (filter.type) {
		case 'range_numeric':
		case 'range_string':
		case 'range_timestamp':
			return 'Between';
		case 'greater_than_numeric':
		case 'greater_than_string':
		case 'greater_than_timestamp':
			return 'Greater Than';
		case 'greater_than_or_equals_numeric':
		case 'greater_than_or_equals_string':
		case 'greater_than_or_equals_timestamp':
			return 'Greater Than or Equals';
		case 'less_than_numeric':
		case 'less_than_string':
		case 'less_than_timestamp':
			return 'Less Than';
		case 'less_than_or_equals_numeric':
		case 'less_than_or_equals_string':
		case 'less_than_or_equals_timestamp':
			return 'Less Than or Equals';
		case 'equals_numeric':
		case 'equals_string':
		case 'equals_timestamp':
			return 'Equals';
		case 'not_equals_numeric':
		case 'not_equals_string':
		case 'not_equals_timestamp':
			return 'Not Equals';
		case 'is_null':
			return 'Is Null';
		case 'is_not_null':
			return 'Is Not Null';
	}
}

/** The column a leaf filter applies to, or null for a shape the builder skips. */
function filterColumnName(filter: Filter): string | null {
	if ('for_query_parameter' in filter) {
		return filter.for_query_parameter;
	}

	if ('is_null' in filter) {
		return filter.is_null.for_query_parameter;
	}

	if ('is_not_null' in filter) {
		return filter.is_not_null.for_query_parameter;
	}

	return null;
}

/**
 * Flatten `and`/`or` groups into a list of leaf filters. The builder has no
 * grouping, so each group counts as a dropped part.
 */
function flattenFilters(filters: Filter[] | undefined, onDrop: () => void): Filter[] {
	const result: Filter[] = [];

	for (const filter of filters ?? []) {
		if ('or' in filter) {
			onDrop();
			result.push(...flattenFilters(filter.or, onDrop));
			continue;
		}

		if ('and' in filter) {
			onDrop();
			result.push(...flattenFilters(filter.and, onDrop));
			continue;
		}

		result.push(filter);
	}

	return result;
}

/**
 * True when the filter is the bounding box that compileDraft derives from the
 * drawn area. The draft keeps only the polygon, and derives the box again on
 * compile. Without this test the box also appears as two range filters.
 */
function isDerivedBoxFilter(
	filter: Filter,
	selection: SpatialSelection | null,
	bounds: ReturnType<typeof ringBounds> | null
): boolean {
	if (!selection || !bounds) {
		return false;
	}

	if (!('for_query_parameter' in filter) || !('min' in filter) || !('max' in filter)) {
		return false;
	}

	const name = filter.for_query_parameter.toLowerCase();
	const matches = (min: number, max: number) => {
		return Math.abs(Number(filter.min) - min) < 1e-9 && Math.abs(Number(filter.max) - max) < 1e-9;
	};

	if (name.includes('latitude')) {
		return matches(bounds.minLat, bounds.maxLat);
	}

	if (name.includes('longitude')) {
		return matches(bounds.minLon, bounds.maxLon);
	}

	return false;
}

/**
 * Read a CompiledQuery back into builder state.
 *
 * @param query  The query to read. Usually a deep-link seed.
 * @param schema The columns of the table, used to type each selected column.
 */
export function hydrateDraftFromQuery(
	query: CompiledQuery | null | undefined,
	schema: SchemaColumn[]
): HydratedSeed {
	const empty: HydratedSeed = {
		selectedFields: [],
		spatialFilter: null,
		outputFormat: null,
		droppedParts: 0
	};

	if (!query || schema.length === 0) {
		return empty;
	}

	let droppedParts = 0;
	const drop = () => {
		droppedParts += 1;
	};

	const selectedFields: SelectedField[] = [];

	const findSelectedField = (name: string) => {
		return selectedFields.find((field) => field.name === name);
	};

	const addSelectedFieldIfMissing = (name: string): SelectedField | null => {
		const existingField = findSelectedField(name);
		if (existingField) {
			return existingField;
		}

		const schemaField = schema.find((field) => field.name === name);
		if (!schemaField) {
			return null;
		}

		const selectedField: SelectedField = {
			name: schemaField.name,
			type: schemaField.type,
			selected_filters: []
		};

		selectedFields.push(selectedField);
		return selectedField;
	};

	if (typeof query.from !== 'string') {
		drop();
	}

	const queryParameters = (query.query_parameters ?? []) as Array<{
		column?: string;
		column_name?: string;
		alias?: string | null;
	}>;

	for (const queryParameter of queryParameters) {
		const columnName = queryParameter.column ?? queryParameter.column_name;

		if (!columnName) {
			drop();
			continue;
		}

		if (!addSelectedFieldIfMissing(columnName)) {
			drop();
		}
	}

	const seedFilters = flattenFilters(query.filters, drop);

	const spatialFilter = seedFilters.filter(isGeoJsonFilter).map(fromGeoJsonFilter).find(Boolean) ?? null;
	const selectionBounds = spatialFilter ? ringBounds(spatialFilter.ring) : null;

	for (const filter of seedFilters) {
		if (isGeoJsonFilter(filter) || isDerivedBoxFilter(filter, spatialFilter, selectionBounds)) {
			continue;
		}

		const columnName = filterColumnName(filter);

		if (!columnName) {
			drop();
			continue;
		}

		const selectedField = addSelectedFieldIfMissing(columnName);

		if (!selectedField) {
			drop();
			continue;
		}

		const mappedFilter = Utils.filterToParameterFilterType(filter, selectedField.type);

		if (!mappedFilter) {
			drop();
			continue;
		}

		selectedField.selected_filters.push({
			label: filterLabel(mappedFilter),
			filter_value: mappedFilter
		});
	}

	const format = query.output?.format;
	let outputFormat: string | null = null;

	if (typeof format === 'string') {
		outputFormat = format;
	} else if (format) {
		drop();
	}

	return { selectedFields, spatialFilter, outputFormat, droppedParts };
}
