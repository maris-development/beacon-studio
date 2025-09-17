<script lang="ts">
	import type {
		AnyFilterColumn,
		FilterColumn,
		OptionsFilterColumn,
		RangeFilterColumn
	} from '@/beacon-api/types';
	import RangeFilter from './range_filter.svelte';
	import OptionsFilter from './options_filter.svelte';
	import AnyFilter from './any_filter.svelte';

	let {
		filter,
		filter_value = $bindable(null)
	}: { filter: FilterColumn; filter_value: QueryFilterValue } = $props();

	export type QueryFilterValue =
		| { min?: number | string; max?: number | string }
		| { options: Array<string | number> }
		| null;

	let min_value: number | string = $state(0);
	let max_value: number | string = $state(0);
	let selected_options: Array<string | number> = $state([]);

	if (filter !== null) {
		if ('min' in filter && 'max' in filter) {
			min_value = filter.min as number | string;
			max_value = filter.max as number | string;
			filter_value = { min: filter.min as number | string, max: filter.max as number | string };
		} else if ('options' in filter) {
			selected_options = [];
			filter_value = { options: selected_options };
		}
	}

	$effect(() => {
		if (filter_value !== null) {
			if (
				'min' in filter_value &&
				'max' in filter_value &&
				(min_value !== filter_value.min || max_value !== filter_value.max)
			) {
				filter_value = { min: min_value, max: max_value };
			} else if ('options' in filter_value && selected_options !== filter_value.options) {
				filter_value = { options: selected_options };
			}
		}
	});
</script>

{#if filter !== null && 'min' in filter && 'max' in filter}
	<RangeFilter range_filter={filter as RangeFilterColumn} bind:max_value bind:min_value />
{:else if filter !== null && 'options' in filter}
	<!-- Options Filter -->
	<OptionsFilter options_filter={filter as OptionsFilterColumn} bind:selected_options />
{:else if filter !== null}
	<!-- Any Filter -->
	<AnyFilter filter={filter as AnyFilterColumn} />
{/if}
