<script lang="ts">
	import { Input } from '../ui/input';
	import { Label } from '../ui/label';

	export type ParameterFilterType =
		| { min?: number; max?: number; type: 'range_numeric' }
		| { min?: string; max?: string; type: 'range_string' }
		| { min?: Date; max?: Date; type: 'range_timestamp' }
		| { value?: string; type: 'greater_than_string' }
		| { value?: number; type: 'greater_than_numeric' }
		| { value?: Date; type: 'greater_than_timestamp' }
		| { value?: string; type: 'less_than_string' }
		| { value?: number; type: 'less_than_numeric' }
		| { value?: Date; type: 'less_than_timestamp' }
		| { value?: string; type: 'greater_than_or_equals_string' }
		| { value?: number; type: 'greater_than_or_equals_numeric' }
		| { value?: Date; type: 'greater_than_or_equals_timestamp' }
		| { value?: string; type: 'less_than_or_equals_string' }
		| { value?: number; type: 'less_than_or_equals_numeric' }
		| { value?: Date; type: 'less_than_or_equals_timestamp' }
		| { value?: string; type: 'equals_string' }
		| { value?: number; type: 'equals_numeric' }
		| { value?: Date; type: 'equals_timestamp' }
		| { value?: string; type: 'not_equals_string' }
		| { value?: number; type: 'not_equals_numeric' }
		| { value?: Date; type: 'not_equals_timestamp' }
		| { type: 'is_null' }
		| { type: 'is_not_null' };

	let {
		filter = $bindable()
	}: {
		filter: ParameterFilterType;
	} = $props();
</script>

{#if filter.type === 'range_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="number" bind:value={filter.min} />
		</div>
		<div class="flex flex-row gap-2">
			<Label for="max">And</Label>
			<Input id="max" type="number" bind:value={filter.max} />
		</div>
	</div>
{:else if filter.type === 'range_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.min} />
		</div>
		<div class="flex flex-row gap-2">
			<Label for="max">And</Label>
			<Input id="max" type="text" bind:value={filter.max} />
		</div>
	</div>
{:else if filter.type === 'range_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.min} />
		</div>
		<div class="flex flex-row gap-2">
			<Label for="max">And</Label>
			<Input id="max" type="datetime-local" bind:value={filter.max} />
		</div>
	</div>
{:else if filter.type === 'greater_than_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'greater_than_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'greater_than_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'greater_than_or_equals_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'greater_than_or_equals_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'greater_than_or_equals_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'equals_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'equals_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'equals_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'not_equals_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'not_equals_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'not_equals_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_or_equals_numeric'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_or_equals_string'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="text" bind:value={filter.value} />
		</div>
	</div>
{:else if filter.type === 'less_than_or_equals_timestamp'}
	<div class="flex flex-row gap-2">
		<div class="flex flex-row gap-2">
			<Input id="min" type="datetime-local" bind:value={filter.value} />
		</div>
	</div>
{/if}
