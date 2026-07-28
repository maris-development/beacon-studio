<script lang="ts">
	import { Input } from '../ui/input';
	import { cn } from '$lib/utils.js';

	export type ParameterFilterType =
		| { min?: number; max?: number; type: 'range_numeric' }
		| { min?: string; max?: string; type: 'range_string' }
		| { min?: string | Date; max?: string | Date; type: 'range_timestamp' }
		| { value?: string; type: 'greater_than_string' }
		| { value?: number; type: 'greater_than_numeric' }
		| { value?: string | Date; type: 'greater_than_timestamp' }
		| { value?: string; type: 'less_than_string' }
		| { value?: number; type: 'less_than_numeric' }
		| { value?: string | Date; type: 'less_than_timestamp' }
		| { value?: string; type: 'greater_than_or_equals_string' }
		| { value?: number; type: 'greater_than_or_equals_numeric' }
		| { value?: string | Date; type: 'greater_than_or_equals_timestamp' }
		| { value?: string; type: 'less_than_or_equals_string' }
		| { value?: number; type: 'less_than_or_equals_numeric' }
		| { value?: string | Date; type: 'less_than_or_equals_timestamp' }
		| { value?: string; type: 'equals_string' }
		| { value?: number; type: 'equals_numeric' }
		| { value?: string | Date; type: 'equals_timestamp' }
		| { value?: string; type: 'not_equals_string' }
		| { value?: number; type: 'not_equals_numeric' }
		| { value?: string | Date; type: 'not_equals_timestamp' }
		| { type: 'is_null' }
		| { type: 'is_not_null' };

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
			<Input label="From (min)" type="number" bind:value={filter.min} />
		</div>
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="number" bind:value={filter.max} />
		</div>


	{:else if filter.type === 'range_string'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="text" bind:value={filter.min} />
		</div>
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="text" bind:value={filter.max} />
		</div>


	{:else if filter.type === 'range_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="datetime-local" bind:value={filter.min} />
		</div>
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="datetime-local" bind:value={filter.max} />
		</div>


	{:else if filter.type === 'greater_than_numeric'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="text" bind:value={filter.value} />
		</div>
		
	{:else if filter.type === 'greater_than_string'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'greater_than_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="datetime-local" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'greater_than_or_equals_numeric'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'greater_than_or_equals_string'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'greater_than_or_equals_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="From (min)" type="datetime-local" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'equals_numeric'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'equals_string'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'equals_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="datetime-local" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'not_equals_numeric'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'not_equals_string'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'not_equals_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="Equals" type="datetime-local" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_numeric'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_string'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="datetime-local" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_or_equals_numeric'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_or_equals_string'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="text" bind:value={filter.value} />
		</div>
	{:else if filter.type === 'less_than_or_equals_timestamp'}
		<div class="advanced-parameter-row">
			<Input label="To (max)" type="datetime-local" bind:value={filter.value} />
		</div>
	{/if}
</div>

<style lang="scss">
	.advanced-parameter-filter {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex-grow: 1;
	}

	.advanced-parameter-row {
		display: flex;
		flex-direction: row;
		gap: 0.5rem;
	}
</style>
