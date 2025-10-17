<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';

	import Separator from '../ui/separator/separator.svelte';
	import type { DataType } from '@/beacon-api/types';
	import Button from '../ui/button/button.svelte';
	import AddAdvancedFilter, { type SelectedFilterType } from './add-advanced-filter.svelte';
	import AdvancedParameterFilter from './advanced-parameter-filter.svelte';

	let {
		column = $bindable(),
		remove_column = $bindable()
	}: {
		column: { name: string; type: DataType; selected_filters: SelectedFilterType[] };
		remove_column: (selected_field_name: string) => void;
	} = $props();
</script>

<Label class="grid items-center gap-3 rounded-lg border border-blue-600 bg-blue-50 p-3">
	<div class="flex w-full flex-row gap-4">
		<div class="flex w-full flex-row items-center justify-between gap-1">
			<div class="flex flex-col gap-1">
				<Label for={column.name} class="text-sm font-normal">{column.name}</Label>
			</div>
			<div class="flex flex-col gap-1">
				<span class="text-muted-foreground text-xs">{column.type}</span>
			</div>
		</div>
		<div>
			<AddAdvancedFilter data_type={column.type} bind:selected_filters={column.selected_filters} />
		</div>
		<div>
			<Button
				onclick={() => {
					console.log('Removing column.');
					remove_column(column.name);
				}}
				variant="destructive"><CircleXIcon /> Remove Column</Button
			>
		</div>
	</div>
	{#if column.selected_filters.length > 0}
		<Separator />
		<div class="flex flex-col gap-2 p-4">
			{#each column.selected_filters as filter}
				<div class="flex items-center justify-between">
					<span>{filter.label}</span>
					<div class="flex items-center gap-2">
						<AdvancedParameterFilter filter={filter.filter_value} />
						<Button
							variant="ghost"
							size="icon"
							onclick={() => {
								console.log('Removing filter:', filter);
								column.selected_filters = column.selected_filters.filter((f) => f !== filter);
							}}
						>
							<CircleXIcon />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Label>
