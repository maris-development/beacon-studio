<script lang="ts">
	import type { FilterColumn } from '@/beacon-api/models/preset_table';
	import RangeFilter from './range_filter.svelte';
	import OptionsFilter from './options_filter.svelte';
	import AnyFilter from './any_filter.svelte';

	let { filter = $bindable() }: { filter: FilterColumn } = $props();

	if ('min' in filter && 'max' in filter) {
		var min_value = $state(filter.min);
		var max_value = $state(filter.max);
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
	<OptionsFilter {filter} />
{:else}
	<!-- Any Filter -->
	<AnyFilter {filter} />
{/if}
