<script lang="ts">
	import type { PresetColumn } from '@/beacon-api/models/preset_table';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	import Separator from '../ui/separator/separator.svelte';
	import Filter from './filters/filter.svelte';

	let {
		column = $bindable(),
		is_selected = $bindable()
	}: { column: PresetColumn; is_selected: boolean } = $props();


</script>

<Label
	class="hover:bg-accent/50 flex items-center gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
>
	<Checkbox
		bind:checked={is_selected}
		id={column.column_name}
		class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
	/>
	<div class="flex w-full flex-row items-center justify-between gap-1">
		<div class="flex flex-col gap-1">
			<Label for={column.column_name} class="text-sm font-normal">{column.alias}</Label>
			{#each Object.entries(column).filter(([key, _]) => !['filter', 'alias', 'column_name'].includes(key)) as [key, value]}
				<Separator />
				<div class="text-muted-foreground justify-end text-xs">
					<strong>{key}:</strong>
					{value}
				</div>
			{/each}
		</div>

		{#if column.filter}
			<Filter bind:filter={column.filter} />
		{/if}
	</div>
</Label>
