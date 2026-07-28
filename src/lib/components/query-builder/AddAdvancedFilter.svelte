<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as SearchSelect from '$lib/components/ui/search-select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import Button from '$lib/components/buttons/Button.svelte';
	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import type { ParameterFilterType } from './AdvancedParameterFilter.svelte';

	export type SelectedFilterType = { label: string; filter_value: ParameterFilterType };

	let {
		data_type,
		selected_filters = $bindable()
	}: {
		data_type: DataType;
		selected_filters: { label: string; filter_value: ParameterFilterType }[];
	} = $props();

	const untyped_filters: { label: string; filter_value: ParameterFilterType }[] = [
		{
			label: 'Is Null',
			filter_value: { type: 'is_null' }
		},
		{
			label: 'Is Not Null',
			filter_value: { type: 'is_not_null' }
		}
	];
	function getTypedFilters(
		data_type: DataType
	): { label: string; filter_value: ParameterFilterType }[] {

		if (Utils.isNumericDataType(data_type)) {
			return [
				{
					label: 'Between',
					filter_value: { type: 'range_numeric', min: null, max: null }
				},
				{
					label: 'Greater Than',
					filter_value: { type: 'greater_than_numeric', value: null }
				},
				{
					label: 'Greater Than or Equals',
					filter_value: { type: 'greater_than_or_equals_numeric', value: null }
				},
				{
					label: 'Less Than',
					filter_value: { type: 'less_than_numeric', value: null }
				},
				{
					label: 'Less Than or Equals',
					filter_value: { type: 'less_than_or_equals_numeric', value: null }
				},
				{
					label: 'Equals',
					filter_value: { type: 'equals_numeric', value: null }
				},
				{
					label: 'Not Equals',
					filter_value: { type: 'not_equals_numeric', value: null }
				}
			];
		} else if (Utils.isStringDataType(data_type)) {
			return [
				{
					label: 'Between',
					filter_value: { type: 'range_string', min: null, max: null }
				},
				{
					label: 'Greater Than',
					filter_value: { type: 'greater_than_string', value: null }
				},
				{
					label: 'Greater Than or Equals',
					filter_value: { type: 'greater_than_or_equals_string', value: null }
				},
				{
					label: 'Less Than',
					filter_value: { type: 'less_than_string', value: null }
				},
				{
					label: 'Less Than or Equals',
					filter_value: { type: 'less_than_or_equals_string', value: null }
				},
				{
					label: 'Equals',
					filter_value: { type: 'equals_string', value: null }
				},
				{
					label: 'Not Equals',
					filter_value: { type: 'not_equals_string', value: null }
				}
			];
			
		} else if (Utils.isTimestampDataType(data_type)) {
			return [
				{
					label: 'Between',
					filter_value: { type: 'range_timestamp', min: null, max: null }
				},
				{
					label: 'Greater Than',
					filter_value: { type: 'greater_than_timestamp', value: null }
				},
				{
					label: 'Greater Than or Equals',
					filter_value: { type: 'greater_than_or_equals_timestamp', value: null }
				},
				{
					label: 'Less Than',
					filter_value: { type: 'less_than_timestamp', value: null }
				},
				{
					label: 'Less Than or Equals',
					filter_value: { type: 'less_than_or_equals_timestamp', value: null }
				},
				{
					label: 'Equals',
					filter_value: { type: 'equals_timestamp', value: null }
				},
				{
					label: 'Not Equals',
					filter_value: { type: 'not_equals_timestamp', value: null }
				}
			];
		} else {
			console.warn(`Unsupported data type for filters: ${data_type}`);
			return [];
		}
	}
	const available_filters = [...getTypedFilters(data_type), ...untyped_filters];

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				variant="confirm"
				class="add-filter-trigger"
				{...props}
				role="combobox"
				aria-expanded={open}
			>
				<PlusIcon class="add-filter-trigger-icon" />
				Add Filter
				<!-- <ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" /> -->
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="add-filter-content">
		<SearchSelect.Root>
			<SearchSelect.Input placeholder="Search filter..." />
			<SearchSelect.List>
				<SearchSelect.Empty>No filters found.</SearchSelect.Empty>
				<SearchSelect.Group>
					{#each available_filters as filter, index (index)}
						<SearchSelect.Item
							value={filter.label}
							onSelect={() => {
								selected_filters.push(filter);
								open = false;
							}}
						>
							{filter.label}
						</SearchSelect.Item>
						{#if index < available_filters.length - 1}
							<Separator />
						{/if}
					{/each}
				</SearchSelect.Group>
			</SearchSelect.List>
		</SearchSelect.Root>
	</Popover.Content>
</Popover.Root>

<style lang="scss">
	:global(.add-filter-trigger) {
		width: 12.5rem;
		display: flex;
		justify-content: space-between;
	}

	:global(.add-filter-trigger-icon) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	:global(.add-filter-content) {
		width: 12.5rem;
		padding: 0;
	}
</style>
