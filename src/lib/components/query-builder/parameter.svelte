<script lang="ts">
	import CircleXIcon from '@lucide/svelte/icons/circle-x';

	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import Button from '../buttons/Button.svelte';
	import AddFilterInput from './AddFilterDropdown.svelte';
	import ParameterFilter from './ParameterFilter.svelte';
	import type { SelectedFilterType } from '@/query/filter-types';
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
			<h4>{column.name}</h4>
			<span>{Utils.dataTypeToString(column.type)}</span>
		</div>

		<div class="parameter-buttons">
			<AddFilterInput data_type={column.type} bind:selected_filters={column.selected_filters} />

			<Button
				onclick={() => {
					// console.log('Removing column.');
					remove_column(column.name);
				}}
				title="Remove column"
				aria-label="Remove column"
				variant="outline"
			>
				<CircleXIcon />
			</Button>
		</div>
	</div>

	{#if column.selected_filters.length > 0}
		<Separator />
		<div class="parameter-filters">
			{#each column.selected_filters as filter, index (index)}

				<div class="filter-wrapper">
			
					<ParameterFilter class="advanced-filter" bind:filter={filter.filter_value} />
			
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
		align-items: start;
		gap: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid #2563eb;
		background-color: var(--selected-background);
		padding: 0.6rem;
		
		.parameter-card-header {
			display: flex;
			flex-direction: row;
			align-items: flex-start;
			gap: 0.5rem;
			min-width: 0;
		
			.parameter-title {
				display: flex;
				flex: 1 1 auto;
				min-width: 0;
				flex-direction: column;
				gap: 0.25rem;
			
				h4 {
					margin: 0;
					overflow-wrap: anywhere;
					word-break: break-word;
				}
			
				span {
					color: var(--muted-foreground);
					font-size: 0.75rem;
					line-height: 1rem;
				
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
			}
		
			.parameter-buttons {
				display: flex;
				flex-direction: row;
				gap: 0.25rem;
				flex-shrink: 0;
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
