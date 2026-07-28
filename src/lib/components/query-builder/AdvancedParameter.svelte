<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';

	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import Button from '../buttons/Button.svelte';
	import AddAdvancedFilter, { type SelectedFilterType } from './AddAdvancedFilter.svelte';
	import AdvancedParameterFilter from './AdvancedParameterFilter.svelte';
	import { Utils } from '@/utils';

	let {
		column = $bindable(),
		remove_column = $bindable()
	}: {
		column: { name: string; type: DataType; selected_filters: SelectedFilterType[] };
		remove_column: (selected_field_name: string) => void;
	} = $props();
</script>

<div class="parameter-card">
	<div class="parameter-card-header">
		<div class="parameter-title">
			<Label for={column.name} class="font-bold">{column.name}</Label>
			<span class="text-muted-foreground text-xs">{Utils.dataTypeToString(column.type)}</span>
		</div>

		<AddAdvancedFilter data_type={column.type} bind:selected_filters={column.selected_filters} />

		<Button
			onclick={() => {
				// console.log('Removing column.');
				remove_column(column.name);
			}}
			title="Remove column"
			variant="ghost"
		>
			<CircleXIcon />
		</Button>
	</div>

	{#if column.selected_filters.length > 0}
		<Separator />
		<div class="parameter-filters">
			{#each column.selected_filters as filter, index (index)}

				<div class="filter-wrapper">
			
					<AdvancedParameterFilter class="advanced-filter" filter={filter.filter_value} />
			
					<Button variant="ghost" size="icon" onclick={() => { column.selected_filters = column.selected_filters.filter((f) => f !== filter); }}>
						<CircleXIcon class="circle-x" />
					</Button>

				</div>
			
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.parameter-card {
		display: grid;
		align-items: center;
		gap: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid #2563eb;
		background-color: var(--selected-background);
		padding: 0.6rem;
		align-items: start;

		.parameter-card-header {
			display: flex;
			flex-direction: row;
			gap: .5rem;
			
			.parameter-title {
				display: flex;
				width: 100%;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: 0.25rem;
			}

		}

		.parameter-filters {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			// padding: 1rem;

			.filter-wrapper {
				display: flex;
				flex-direction: row;
				// align-items: center;
				gap: 0.5rem;
				padding: 0.5rem;
				border-radius: 0.5rem;
				background-color: white;
			}
		}
	}
</style>
