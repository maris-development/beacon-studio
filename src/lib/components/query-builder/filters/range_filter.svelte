<script lang="ts">
	import type { RangeFilterColumn } from '@/beacon-api/models/preset_table';
	import Input from '@/components/ui/input/input.svelte';

	let {
		min_value = $bindable(),
		max_value = $bindable()
	}: { min_value: string | number; max_value: string | number } = $props();

	let is_timestamp_filter = isTimestamp(min_value) || isTimestamp(max_value);
	let is_number_filter = isNumber(min_value) || isNumber(max_value);
	let is_string_filter = isString(min_value) || isString(max_value);

	function isTimestamp(value: unknown): boolean {
		return typeof value === 'string' && !isNaN(Date.parse(value));
	}

	function isNumber(value: unknown): boolean {
		return typeof value === 'number';
	}

	function isString(value: unknown): boolean {
		return typeof value === 'string' && isNaN(Date.parse(value));
	}

	if (typeof min_value === 'string' && isTimestamp(min_value)) {
		var timestamp_min_value = $state(toDatetimeLocalStringFromUTC(min_value));
	}
	if (typeof max_value === 'string' && isTimestamp(max_value)) {
		var timestamp_max_value = $state(toDatetimeLocalStringFromUTC(max_value));
	}

	function toDatetimeLocalStringFromUTC(value: string): string {
		if (!value) return '';
		const date = new Date(value);
		return date.toISOString().slice(0, 16); // Strip seconds, keep local format
	}

	function toUTCString(localString: string): string {
		const localDate = new Date(localString);
		const utcDate = new Date(localDate.getTime() + localDate.getTimezoneOffset() * 60000);
		return utcDate.toISOString();
	}

	$effect(() => {
		console.log('min_value changed:', min_value);
	});
</script>

<div class="flex flex-col gap-2">
	<div class="flex justify-between gap-4">
		<p class="text-muted-foreground text-sm">From:</p>
		{#if is_timestamp_filter}
			<Input
				class="w-fit"
				type="datetime-local"
				bind:value={timestamp_min_value}
				onchange={(e) => (min_value = toUTCString(e.target.value))}
			/>
		{:else if is_number_filter}
			<Input type="number" lang="en" step="any" bind:value={min_value} />
		{:else if is_string_filter}
			<Input type="text" bind:value={min_value} placeholder="Enter text" />
		{/if}
	</div>
	<div class="flex justify-between gap-4">
		<p class="text-muted-foreground text-sm">To:</p>
		{#if is_timestamp_filter}
			<Input
				class="w-fit"
				type="datetime-local"
				bind:value={timestamp_max_value}
				onchange={(e) => (max_value = toUTCString(e.target.value))}
			/>
		{:else if is_number_filter}
			<div>
				<Input type="number" step="any" bind:value={max_value} />
			</div>
		{:else if is_string_filter}
			<Input type="text" bind:value={max_value} placeholder="Enter text" />
		{/if}
	</div>
</div>
