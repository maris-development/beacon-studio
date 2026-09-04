/**
 * The filter safeguard of the query workbench.
 *
 * Beacon holds large datasets. A query with no filter reads a whole table, so
 * the workbench blocks it. The user turns the safeguard off on the settings
 * page, with `requireQueryFilters`.
 *
 * The rule reads the compiled query, and not the draft. A draft filter with no
 * value compiles to nothing (`Utils.parameterFilterTypeToFilter` returns null),
 * so a count over the draft reports a filter that the server never gets. The
 * compiled query is also the only state of a block that comes from a share link
 * or from the JSON editor.
 */
import type { AndFilter, CompiledQuery, Filter, OrFilter } from '@/beacon-api/types';
import { getSettings } from '@/stores/settings';

/** The text that the workbench shows when the safeguard blocks a query. */
export const NO_FILTER_MESSAGE =
	'This query has no filters. Add at least one filter, or turn off "Require a filter" in the settings.';

/**
 * The number of leaf filters of a query. A group (`and` / `or`) contributes its
 * members, and not itself. Therefore an empty group counts as zero.
 */
export function countFilters(query: CompiledQuery | null | undefined): number {
	return countIn(query?.filters ?? []);
}

function countIn(filters: Filter[]): number {
	let total = 0;

	for (const filter of filters) {
		const group = filter as Partial<AndFilter & OrFilter>;

		if (Array.isArray(group.and)) {
			total += countIn(group.and);
		} else if (Array.isArray(group.or)) {
			total += countIn(group.or);
		} else {
			total += 1;
		}
	}

	return total;
}

/** True when a query carries at least one filter. */
export function hasFilters(query: CompiledQuery | null | undefined): boolean {
	return countFilters(query) > 0;
}

/** True while the safeguard is on. The settings page holds the switch. */
export function isFilterRequired(): boolean {
	return getSettings().requireQueryFilters;
}

/**
 * The reason that a query must not run, or null when it may run.
 *
 * A missing query gives null. Such a block has no table or no column yet, and
 * the caller reports that itself. This function judges a compiled query only.
 */
export function runBlockReason(query: CompiledQuery | null | undefined): string | null {
	if (!query) return null;
	if (!isFilterRequired()) return null;
	if (hasFilters(query)) return null;

	return NO_FILTER_MESSAGE;
}
