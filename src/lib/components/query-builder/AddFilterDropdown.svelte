<script lang="ts">
	import FunnelPlusIcon from '@lucide/svelte/icons/funnel-plus';
	import * as SearchSelect from '$lib/components/ui/search-select/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import Button from '$lib/components/buttons/Button.svelte';
	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import type { SelectedFilterType } from '@/query/filter-types';
	import { track } from '@/telemetry';
	import { t } from '@/i18n';
	import { filterLabel } from '@/query/seed-hydration';

	let {
		data_type,
		selected_filters = $bindable()
	}: {
		data_type: DataType;
		selected_filters: SelectedFilterType[];
	} = $props();

	const untyped_filters: SelectedFilterType[] = [
		{
			label: 'filter.op.isNull',
			filter_value: { type: 'is_null' }
		},
		{
			label: 'filter.op.isNotNull',
			filter_value: { type: 'is_not_null' }
		}
	];
	function getTypedFilters(
		data_type: DataType
	): SelectedFilterType[] {

		if (Utils.isNumericDataType(data_type)) {
			return [
				{
					label: 'filter.op.between',
					filter_value: { type: 'range_numeric', min: null, max: null }
				},
				{
					label: 'filter.op.greaterThan',
					filter_value: { type: 'greater_than_numeric', value: null }
				},
				{
					label: 'filter.op.greaterThanOrEquals',
					filter_value: { type: 'greater_than_or_equals_numeric', value: null }
				},
				{
					label: 'filter.op.lessThan',
					filter_value: { type: 'less_than_numeric', value: null }
				},
				{
					label: 'filter.op.lessThanOrEquals',
					filter_value: { type: 'less_than_or_equals_numeric', value: null }
				},
				{
					label: 'filter.op.equals',
					filter_value: { type: 'equals_numeric', value: null }
				},
				{
					label: 'filter.op.notEquals',
					filter_value: { type: 'not_equals_numeric', value: null }
				}
			];
		} else if (Utils.isStringDataType(data_type)) {
			return [
				{
					label: 'filter.op.between',
					filter_value: { type: 'range_string', min: null, max: null }
				},
				{
					label: 'filter.op.greaterThan',
					filter_value: { type: 'greater_than_string', value: null }
				},
				{
					label: 'filter.op.greaterThanOrEquals',
					filter_value: { type: 'greater_than_or_equals_string', value: null }
				},
				{
					label: 'filter.op.lessThan',
					filter_value: { type: 'less_than_string', value: null }
				},
				{
					label: 'filter.op.lessThanOrEquals',
					filter_value: { type: 'less_than_or_equals_string', value: null }
				},
				{
					label: 'filter.op.equals',
					filter_value: { type: 'equals_string', value: null }
				},
				{
					label: 'filter.op.notEquals',
					filter_value: { type: 'not_equals_string', value: null }
				}
			];
			
		} else if (Utils.isDictionaryOfStrings(data_type)) {
			return [
				{
					label: 'filter.op.equals',
					filter_value: { type: 'equals_string', value: null }
				},
				{
					label: 'filter.op.notEquals',
					filter_value: { type: 'not_equals_string', value: null }
				}
			];
		} else if (Utils.isTemporalDataType(data_type)) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const d = new Date();
			d.setUTCFullYear(d.getUTCFullYear() - 1);
			let minTimeSuffix = 'T00:00:00Z';
			let maxTimeSuffix = 'T23:59:59Z';
			if (Utils.isDateDataType(data_type)) {
				minTimeSuffix = '';
				maxTimeSuffix = '';
			}
			const minDefaultDateValue = d.toISOString().slice(0, 10) + minTimeSuffix;
			const maxDefaultDateValue = new Date().toISOString().slice(0, 10) + maxTimeSuffix;
			return [
				{
					label: 'filter.op.between',
					filter_value: { type: 'range_timestamp', min: minDefaultDateValue, max: maxDefaultDateValue }
				},
				{
					label: 'filter.op.greaterThan',
					filter_value: { type: 'greater_than_timestamp', value: minDefaultDateValue }
				},
				{
					label: 'filter.op.greaterThanOrEquals',
					filter_value: { type: 'greater_than_or_equals_timestamp', value: minDefaultDateValue }
				},
				{
					label: 'filter.op.lessThan',
					filter_value: { type: 'less_than_timestamp', value: maxDefaultDateValue }
				},
				{
					label: 'filter.op.lessThanOrEquals',
					filter_value: { type: 'less_than_or_equals_timestamp', value: maxDefaultDateValue }
				},
				{
					label: 'filter.op.equals',
					filter_value: { type: 'equals_timestamp', value: maxDefaultDateValue }
				},
				{
					label: 'filter.op.notEquals',
					filter_value: { type: 'not_equals_timestamp', value: maxDefaultDateValue }
				}
			];
		} else {
			console.warn(`Unsupported data type for filters: ${Utils.dataTypeToString(data_type)}`);
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
				variant="outline"
				class="add-filter-trigger"
				{...props}
				role="combobox"
				aria-expanded={open}
				title={$t('filter.add')}
				aria-label={$t('filter.add')}
			>
				<FunnelPlusIcon class="add-filter-trigger-icon" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="add-filter-content">
		<SearchSelect.Root>
			<SearchSelect.Input placeholder={$t('filter.searchPlaceholder')} />
			<SearchSelect.List>
				<SearchSelect.Empty>{$t('filter.empty')}</SearchSelect.Empty>
				<SearchSelect.Group>
					{#each available_filters as filter, index (index)}
						<SearchSelect.Item
							value={$t(filterLabel(filter.filter_value))}
							onSelect={() => {
								selected_filters.push(filter);
								track('builder.filter.add', {
									props: { kind: filter.filter_value.type, dataType: Utils.dataTypeToString(data_type) }
								});
								open = false;
							}}
						>
							{$t(filterLabel(filter.filter_value))}
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
