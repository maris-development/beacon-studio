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
import type { SelectedFilterType } from './AddFilterDropdown.svelte';
import { QueryBuilder } from '@/beacon-api/query';
import { Utils } from '@/utils';

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
};

/** Default output format value (matches BeaconClient.output_formats['Parquet']). */
export const DEFAULT_OUTPUT_FORMAT = 'parquet';

export function makeEmptyDraft(): QueryDraft {
	return {
		tableName: '',
		selectedFields: [],
		outputFormat: DEFAULT_OUTPUT_FORMAT
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

		builder.setFrom(draft!.tableName);
		builder.setOutput({ format: draft!.outputFormat as OutputFormat });

		return builder.compile();
	} catch {
		return null;
	}
}
