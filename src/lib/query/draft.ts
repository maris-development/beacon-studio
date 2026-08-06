/**
 * QueryDraft — the builder's editable state for a single query block.
 *
 * This is the source of truth the query builder edits directly: the selected
 * table, the selected columns (each with its filters), and the output format.
 * The CompiledQuery (used for the JSON view, the run request and downloads) is
 * always *derived* from a draft via {@link compileDraft} — never the other way
 * around — so switching between query blocks restores the exact builder state
 * without a lossy round-trip through CompiledQuery.
 */
import type { CompiledQuery, DataType, OutputFormat } from '@/beacon-api/types';
import type { SelectedFilterType } from '@/query/filter-types';
import { QueryBuilder } from '@/beacon-api/query';
import { getSettings } from '@/stores/settings';
import { Utils } from '@/utils';
import {
	isUsableSelection,
	toBboxFilters,
	toGeoJsonFilter,
	type SpatialSelection
} from '@/geo/spatial-selection';
import { detectCoordinateColumns } from '@/geo/coordinate-columns';

/** A single selected column plus the filters applied to it. */
export type SelectedField = {
	name: string;
	type: DataType;
	selected_filters: SelectedFilterType[];
};

/** The full builder draft for one query block. */
export type QueryDraft = {
	tableName: string;
	selectedFields: SelectedField[];
	outputFormat: string;
	/**
	 * An area drawn on the map viewer. It applies to the latitude and longitude
	 * columns together, so it cannot live on a single selected field.
	 */
	spatialFilter?: SpatialSelection | null;
};

/**
 * The output format of a new draft. The user sets it on the settings page. The
 * values match the keys of `BeaconClient.output_formats`.
 */
export function defaultOutputFormat(): string {
	return getSettings().defaultOutputFormat;
}

export function makeEmptyDraft(): QueryDraft {
	return {
		tableName: '',
		selectedFields: [],
		outputFormat: defaultOutputFormat()
	};
}

/** True when a draft can be compiled into a runnable query. */
export function isDraftComplete(draft: QueryDraft | null | undefined): boolean {
	return !!draft && !!draft.tableName && draft.selectedFields.length > 0;
}

/**
 * Compiles a draft into a CompiledQuery, or returns null while the draft is
 * incomplete (no table or no selected columns). Never throws.
 */
export function compileDraft(draft: QueryDraft | null | undefined): CompiledQuery | null {
	if (!isDraftComplete(draft)) {
		return null;
	}

	try {
		const builder = new QueryBuilder();

		for (const field of draft!.selectedFields) {
			builder.addSelect({ column: field.name, alias: null });
			for (const filter of field.selected_filters) {
				const bfilter = Utils.parameterFilterTypeToFilter(filter.filter_value, field.name);
				if (bfilter) {
					builder.addFilter(bfilter);
				}
			}
		}

		addSpatialFilters(builder, draft!);

		builder.setFrom(draft!.tableName);
		builder.setOutput({ format: draft!.outputFormat as OutputFormat });

		return builder.compile();
	} catch {
		return null;
	}
}

/**
 * Add the drawn area to a query: one point-in-polygon filter, plus the bounding
 * box of that polygon on the two columns. The box lets the server prune data
 * before it runs the slower polygon test.
 *
 * The box is always derived here, and is never stored on a field. So one delete
 * of `spatialFilter` removes every part of the area again.
 *
 * The query keeps no filter when it does not select both a latitude and a
 * longitude column.
 */
function addSpatialFilters(builder: QueryBuilder, draft: QueryDraft): void {
	const selection = draft.spatialFilter;
	if (!isUsableSelection(selection)) return;

	const names = draft.selectedFields.map((field) => field.name);
	const { latitude, longitude } = detectCoordinateColumns(names);
	if (!latitude || !longitude) return;

	builder.addFilter(toGeoJsonFilter(selection!, latitude.name, longitude.name));

	for (const filter of toBboxFilters(selection!, latitude.name, longitude.name)) {
		builder.addFilter(filter);
	}
}
