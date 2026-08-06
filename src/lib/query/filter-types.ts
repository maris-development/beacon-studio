/**
 * The filter shapes the query builder edits.
 *
 * These types were declared inside `ParameterFilter.svelte` and
 * `AddFilterDropdown.svelte`. The domain layer (`draft`, `seed-hydration`) and
 * `Utils` both need them, and neither may import a component. So they live
 * here, and the components import them back.
 */

/** An ISO timestamp, as the date inputs write it. */
type DateString = string;

/** One filter on one column, with the values the user typed. */
export type ParameterFilterType =
	| { min?: number; max?: number; type: 'range_numeric' }
	| { min?: string; max?: string; type: 'range_string' }
	| { min?: DateString; max?: DateString; type: 'range_timestamp' }
	| { value?: string; type: 'greater_than_string' }
	| { value?: number; type: 'greater_than_numeric' }
	| { value?: DateString; type: 'greater_than_timestamp' }
	| { value?: string; type: 'less_than_string' }
	| { value?: number; type: 'less_than_numeric' }
	| { value?: DateString; type: 'less_than_timestamp' }
	| { value?: string; type: 'greater_than_or_equals_string' }
	| { value?: number; type: 'greater_than_or_equals_numeric' }
	| { value?: DateString; type: 'greater_than_or_equals_timestamp' }
	| { value?: string; type: 'less_than_or_equals_string' }
	| { value?: number; type: 'less_than_or_equals_numeric' }
	| { value?: DateString; type: 'less_than_or_equals_timestamp' }
	| { value?: string; type: 'equals_string' }
	| { value?: number; type: 'equals_numeric' }
	| { value?: DateString; type: 'equals_timestamp' }
	| { value?: string; type: 'not_equals_string' }
	| { value?: number; type: 'not_equals_numeric' }
	| { value?: DateString; type: 'not_equals_timestamp' }
	| { type: 'is_null' }
	| { type: 'is_not_null' };

/** A filter plus the label the dropdown shows for it. */
export type SelectedFilterType = {
	label: string;
	filter_value: ParameterFilterType;
};
