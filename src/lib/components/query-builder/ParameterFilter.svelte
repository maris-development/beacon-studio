<script lang="ts">
	import { Input } from '../ui/input';
	import { cn } from '$lib/utils.js';
	import DateTimeInput from '../input/DateTimeInput.svelte';
	import type { ParameterFilterType } from '@/query/filter-types';

	const uid = $props.id();

	let {
		filter = $bindable(),
		class: className
	}: {
		class: string;
		filter: ParameterFilterType;
	} = $props();

</script>

<div class={cn("advanced-parameter-filter", className)}>

	{#if filter.type === 'range_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-numeric-min`} class="input-label">From (min)</label>
			<Input id={`${uid}-range-numeric-min`} type="number" bind:value={filter.min} />
		</div>
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-numeric-max`} class="input-label">To (max)</label>
			<Input id={`${uid}-range-numeric-max`} type="number" bind:value={filter.max} />
		</div>

	{:else if filter.type === 'range_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-string-min`} class="input-label">From (min)</label>
			<Input id={`${uid}-range-string-min`} type="text" bind:value={filter.min} />
		</div>
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-string-max`} class="input-label">To (max)</label>
			<Input id={`${uid}-range-string-max`} type="text" bind:value={filter.max} />
		</div>

	{:else if filter.type === 'range_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-timestamp-min`} class="input-label">From (min)</label>
			<DateTimeInput id={`${uid}-range-timestamp-min`} bind:value={filter.min}  />
		</div>
		<div class="advanced-parameter-row">
			<label for={`${uid}-range-timestamp-max`} class="input-label">To (max)</label>
			<DateTimeInput id={`${uid}-range-timestamp-max`} bind:value={filter.max} />
		</div>

	{:else if filter.type === 'greater_than_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-numeric`} class="input-label">Greater than</label>
			<Input id={`${uid}-greater-than-numeric`} type="text" bind:value={filter.value} />
		</div>
		
	{:else if filter.type === 'greater_than_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-string`} class="input-label">Greater than</label>
			<Input id={`${uid}-greater-than-string`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'greater_than_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-timestamp`} class="input-label">Greater than</label>
			<DateTimeInput id={`${uid}-greater-than-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'greater_than_or_equals_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-or-equals-numeric`} class="input-label">Greater or Equal than</label>
			<Input id={`${uid}-greater-than-or-equals-numeric`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'greater_than_or_equals_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-or-equals-string`} class="input-label">Greater or Equal than</label>
			<Input id={`${uid}-greater-than-or-equals-string`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'greater_than_or_equals_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-greater-than-or-equals-timestamp`} class="input-label">Greater or Equal than</label>
			<DateTimeInput id={`${uid}-greater-than-or-equals-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'equals_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-equals-numeric`} class="input-label">Equals</label>
			<Input id={`${uid}-equals-numeric`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'equals_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-equals-string`} class="input-label">Equals</label>
			<Input id={`${uid}-equals-string`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'equals_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-equals-timestamp`} class="input-label">Equals</label>
			<DateTimeInput id={`${uid}-equals-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'not_equals_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-not-equals-numeric`} class="input-label">Does NOT Equal</label>
			<Input id={`${uid}-not-equals-numeric`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'not_equals_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-not-equals-string`} class="input-label">Does NOT Equal</label>
			<Input id={`${uid}-not-equals-string`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'not_equals_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-not-equals-timestamp`} class="input-label">Does NOT Equal</label>
			<DateTimeInput id={`${uid}-not-equals-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'less_than_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-less-than-numeric`} class="input-label">Less than</label>
			<Input id={`${uid}-less-than-numeric`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'less_than_string'}
		<div class="advanced-parameter-row">
			
			<label for={`${uid}-less-than-string`} class="input-label">Less than</label>
			<Input id={`${uid}-less-than-string`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'less_than_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-less-than-timestamp`} class="input-label">Less than</label>
			<DateTimeInput id={`${uid}-less-than-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'less_than_or_equals_numeric'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-less-than-or-equals-numeric`} class="input-label">Less or Equal than</label>
			<Input id={`${uid}-less-than-or-equals-numeric`} type="text" bind:value={filter.value} />
		</div>

	{:else if filter.type === 'less_than_or_equals_string'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-less-than-or-equals-string`} class="input-label">Less or Equal than</label>
			<Input id={`${uid}-less-than-or-equals-string`} type="text" bind:value={filter.value} />
		</div>
		
	{:else if filter.type === 'less_than_or_equals_timestamp'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-less-than-or-equals-timestamp`} class="input-label">Less or Equal than</label>
			<DateTimeInput id={`${uid}-less-than-or-equals-timestamp`} bind:value={filter.value} />
		</div>

	{:else if filter.type === 'is_null'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-is_null`} class="input-label">Is NULL</label>
		</div>

	{:else if filter.type === 'is_not_null'}
		<div class="advanced-parameter-row">
			<label for={`${uid}-is_not_null`} class="input-label">Is NOT NULL</label>
		</div>

	{/if}
</div>

<style lang="scss">
	.advanced-parameter-filter {
		display: flex;
		flex-direction: row;
		gap: 0.5rem;
		flex-grow: 1;
	}

	.advanced-parameter-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex-grow: 1;
	}

	.input-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}
</style>
