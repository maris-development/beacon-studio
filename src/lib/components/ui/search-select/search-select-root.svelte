<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { cn } from '$lib/utils.js';
	import {
		createSearchSelectContext,
		setSearchSelectContext,
		type SearchSelectContext
	} from './search-select-context';

	let {
		query = $bindable(''),
		value = $bindable(''),
		class: className,
		children,
		...restProps
	}: {
		query?: string;
		value?: string;
		class?: string;
		children: Snippet;
	} = $props();

	const context: SearchSelectContext = createSearchSelectContext();
	setSearchSelectContext(context);

	const unsubQuery = context.searchQuery.subscribe((next) => {
		if (next !== query) {
			query = next;
		}
	});

	const unsubValue = context.selectedValue.subscribe((next) => {
		if (next !== value) {
			value = next;
		}
	});

	$effect(() => {
		if (get(context.searchQuery) !== query) {
			context.searchQuery.set(query);
		}
	});

	$effect(() => {
		if (get(context.selectedValue) !== value) {
			context.selectedValue.set(value);
		}
	});

	onDestroy(() => {
		unsubQuery();
		unsubValue();
	});
</script>

<div class={cn('search-select-root', className)} data-slot="search-select" {...restProps}>
	{@render children?.()}
</div>

<style lang="scss">
	.search-select-root {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--popover);
		color: var(--popover-foreground);
		border-radius: 0.5rem;
	}
</style>
