<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import type { ParameterFilterType } from './advanced-parameter-filter.svelte';

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
				variant="default"
				class="w-[200px] justify-between"
				{...props}
				role="combobox"
				aria-expanded={open}
			>
				<PlusIcon class="size-4 shrink-0" />
				Add Filter
				<!-- <ChevronsUpDownIcon class="ml-2 size-4 shrink-0 opacity-50" /> -->
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[200px] p-0">
		<Command.Root>
			<Command.Input placeholder="Search Filters..." />
			<Command.List>
				<Command.Empty>No filters found.</Command.Empty>
				<Command.Group>
					{#each available_filters as filter}
						<Command.Item
							onSelect={() => {
								selected_filters.push(filter);
								open = false;
							}}
						>
							{filter.label}
						</Command.Item>
						<Separator />
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
