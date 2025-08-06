<script lang="ts">
	import type { PresetColumn } from '@/beacon-api/types';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	import Separator from '../ui/separator/separator.svelte';
	import Filter from './filters/filter.svelte';
	import { Utils } from '@/utils';

	let {
		column = $bindable(),
		is_selected = $bindable()
	}: { column: PresetColumn; is_selected: boolean } = $props();


</script>

<label class="parameter">
	<div class="parameter-details">
		<div class="checkbox-flex">
			<Checkbox bind:checked={is_selected} id={column.column_name}/>
			<h4>{column.alias}</h4>
		</div>		
		<Separator />
		{#each Object.entries(column).filter(([key, _]) => !['filter', 'alias', 'column_name'].includes(key)) as [key, value]}
			<div class="key-value">
				<strong>{Utils.ucfirst(key)}:</strong>
				{value}
			</div>
		{/each}
	</div>

	{#if column.filter}
		<Filter bind:filter={column.filter} />
	{/if}
</label>


<style lang="scss">
.parameter {
	display: flex;
	flex-direction: column;
	gap: 0.75rem; /* gap-3 */
	border-width: 1px;
	border-style: solid;
	padding: 0.75rem; /* p-3 */
	border-radius: 0.5rem; /* rounded-lg */
	transition: background-color 0.2s ease, border-color 0.2s ease;
	cursor: pointer;

	&:hover {
		background-color: color-mix(in oklab, var(--accent) 50%, transparent);
	}

	.parameter-details {
		display: flex;
		width: 100%;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.25rem; /* gap-1 */

		.checkbox-flex {
			display: flex;
			justify-items: space-between;
			align-items: center;
			gap: 0.5rem; /* gap-2 */

			h4 {
				margin: 0;
			}
		}

		.key-value {
			color: var(--muted-foreground);
			font-weight: normal;
		}
	}
}



:global(.parameter:has([aria-checked='true'])) {
  border-color: rgb(37 99 235);
}



</style>