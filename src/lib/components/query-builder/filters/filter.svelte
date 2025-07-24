<script lang="ts">
	import type { FilterColumn } from '@/beacon-api/models/preset_table';
	import RangeFilter from './range_filter.svelte';
	import OptionsFilter from './options_filter.svelte';
	import AnyFilter from './any_filter.svelte';

	const { filter } = $props<{
		filter: FilterColumn;
	}>();
</script>

{#if 'min' in filter && 'max' in filter}
	<RangeFilter {filter} />
{:else if 'values' in filter}
	<!-- Options Filter -->
	<OptionsFilter {filter} />
{:else}
	<!-- Any Filter -->
	<AnyFilter {filter} />
{/if}
