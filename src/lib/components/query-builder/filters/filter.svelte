<script lang="ts">
	import type { AnyFilterColumn, FilterColumn, OptionsFilterColumn } from '@/beacon-api/types';
	import RangeFilter from './range_filter.svelte';
	import OptionsFilter from './options_filter.svelte';
	import AnyFilter from './any_filter.svelte';

	let { filter = $bindable() }: { filter: FilterColumn } = $props();

	let min_value: number = $state(0);
	let max_value: number = $state(0);

	if ('min' in filter && 'max' in filter) {
		min_value = (filter.min as number);
		max_value = (filter.max as number);
	}

	$effect(() => {
		if (
			'min' in filter &&
			'max' in filter &&
			(min_value !== filter.min || max_value !== filter.max)
		) {
			filter.min = min_value;
			filter.max = max_value;
			filter = { ...filter }; // ✅ This will notify the parent
		}
	});
</script>

{#if 'min' in filter && 'max' in filter}
	<RangeFilter bind:max_value bind:min_value />
{:else if 'values' in filter}
	<!-- Options Filter -->
	<OptionsFilter filter={(filter as OptionsFilterColumn)} />
{:else}
	<!-- Any Filter -->
	<AnyFilter filter={(filter as AnyFilterColumn)} />
{/if}
