<script lang="ts">
	import type { RangeFilterColumn } from '@/beacon-api/models/preset_table';
	import Input from '@/components/ui/input/input.svelte';

	const { filter } = $props<{
		filter: RangeFilterColumn;
	}>();

	let min_value = $state(filter.min ?? '');
	let max_value = $state(filter.max ?? '');
	function isTimestamp(value: unknown): boolean {
		return typeof value === 'string' && !isNaN(Date.parse(value));
	}

	function isNumber(value: unknown): boolean {
		return typeof value === 'number';
	}

	function isString(value: unknown): boolean {
		return typeof value === 'string' && isNaN(Date.parse(value));
	}

	let min_timestamp_display = $derived.by(() => {
		if (isTimestamp(min_value)) {
			return toDatetimeLocalStringFromUTC(min_value);
		}
		return '';
	});

	let max_timestamp_display = $derived.by(() => {
		if (isTimestamp(max_value)) {
			return toDatetimeLocalStringFromUTC(max_value);
		}
		return '';
	});

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
</script>

<div class="flex flex-col gap-2">
	<div class="flex gap-4">
		<p class="text-muted-foreground text-sm">From:</p>
		{#if isTimestamp(min_value)}
			<Input
				type="datetime-local"
				bind:value={min_timestamp_display}
				on:change={(e) => min_value.set(toUTCString(e.target.value))}
			/>
		{:else if isNumber(min_value)}
			<Input type="number" lang="en" bind:value={min_value} />
		{:else if isString(min_value)}
			<Input type="text" bind:value={min_value} placeholder="Enter text" />
		{/if}
	</div>
	<div class="flex gap-4">
		<p class="text-muted-foreground text-sm">To:</p>
		{#if isTimestamp(max_value)}
			<Input
				type="datetime-local"
				bind:value={max_timestamp_display}
				on:change={(e) => max_value.set(toUTCString(e.target.value))}
			/>
		{:else if isNumber(max_value)}
			<Input type="number" lang="en" bind:value={max_value} />
		{:else if isString(max_value)}
			<Input type="text" bind:value={max_value} placeholder="Enter text" />
		{/if}
	</div>
</div>
