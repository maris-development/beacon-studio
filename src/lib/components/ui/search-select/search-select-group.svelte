<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import {
		getSearchSelectContext,
		setSearchSelectGroupContext
	} from './search-select-context';

	let {
		heading,
		value,
		class: className,
		children,
		...restProps
	}: {
		heading?: string;
		value?: string;
		class?: string;
		children: Snippet;
	} = $props();

	const context = getSearchSelectContext();
	const groupCountsStore = context.visibleGroupCounts;
	const queryStore = context.searchQuery;

	const groupId = value ?? heading ?? `search-select-group-${Math.random().toString(36).slice(2)}`;
	setSearchSelectGroupContext(groupId);

	let isHidden = $state(false);

	$effect(() => {
		const query = $queryStore.trim();
		const count = $groupCountsStore.get(groupId) ?? 0;
		isHidden = query.length > 0 && count === 0;
	});
</script>

<div
	class={cn('search-select-group', className)}
	data-slot="search-select-group"
	hidden={isHidden}
	{...restProps}
>
	{#if heading}
		<div class="search-select-group-heading" data-slot="search-select-group-heading">{heading}</div>
	{/if}
	<div class="search-select-group-items" data-slot="search-select-group-items">
		{@render children?.()}
	</div>
</div>

<style lang="scss">
	.search-select-group {
		padding: 0.25rem;
	}

	.search-select-group-heading {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.search-select-group-items {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
</style>
