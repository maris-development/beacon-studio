<script lang="ts">
	import type { RangeFilterColumn } from '@/beacon-api/types';
	import Input from '@/components/ui/input/input.svelte';

	let {
		range_filter,
		min_value = $bindable(),
		max_value = $bindable()
	}: {
		range_filter: RangeFilterColumn;
		min_value: string | number;
		max_value: string | number;
	} = $props();

	let origin_filter = $state({ ...range_filter });

	let is_timestamp_filter = $state(isTimestamp(min_value) && isTimestamp(max_value));
	let is_number_filter = $state(isNumber(min_value) && isNumber(max_value));
	let is_string_filter = $state(isString(min_value) && isString(max_value));

	let timestamp_min_value = $state('');
	let timestamp_max_value = $state('');

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
		timestamp_min_value = toDatetimeLocalStringFromUTC(min_value);
	}
	if (typeof max_value === 'string' && isTimestamp(max_value)) {
		timestamp_max_value = toDatetimeLocalStringFromUTC(max_value);
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
		if (range_filter !== origin_filter) {
			min_value = range_filter.min;
			max_value = range_filter.max;

			is_timestamp_filter = isTimestamp(min_value) && isTimestamp(max_value);
			is_number_filter = isNumber(min_value) && isNumber(max_value);
			is_string_filter = isString(min_value) && isString(max_value);

			if (is_timestamp_filter) {
				if (typeof min_value === 'string') {
					timestamp_min_value = toDatetimeLocalStringFromUTC(min_value);
				}
				if (typeof max_value === 'string') {
					timestamp_max_value = toDatetimeLocalStringFromUTC(max_value);
				}
			}

			origin_filter = range_filter;
		}
	});
</script>

<div class="flex flex-col gap-2">
	<div class="flex justify-between gap-4">
		<p class="text-muted-foreground text-sm">From:</p>
		{#if is_timestamp_filter}
			<Input
				class="w-[200px]"
				type="datetime-local"
				bind:value={timestamp_min_value}
				onchange={(e) => (min_value = toUTCString(e.target.value))}
			/>
		{:else if is_number_filter}
			<Input type="number" lang="en" step="any" bind:value={min_value} class="w-[200px]" />
		{:else if is_string_filter}
			<Input type="text" bind:value={min_value} placeholder="Enter text" class="w-[200px]" />
		{/if}
	</div>
	<div class="flex justify-between gap-4">
		<p class="text-muted-foreground text-sm">To:</p>
		{#if is_timestamp_filter}
			<Input
				class="w-[200px]"
				type="datetime-local"
				bind:value={timestamp_max_value}
				onchange={(e) => (max_value = toUTCString(e.target.value))}
			/>
		{:else if is_number_filter}
			<div>
				<Input type="number" step="any" bind:value={max_value} class="w-[200px]" />
			</div>
		{:else if is_string_filter}
			<Input type="text" bind:value={max_value} placeholder="Enter text" class="w-[200px]" />
		{/if}
	</div>
</div>
