<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { getSearchSelectContext } from './search-select-context';

	let {
		class: className,
		children,
		...restProps
	}: {
		class?: string;
		children: Snippet;
	} = $props();

	const context = getSearchSelectContext();
	const visibleItemCountStore = context.visibleItemCount;

	let isVisible = $derived($visibleItemCountStore === 0);
</script>

{#if isVisible}
	<div class={cn('search-select-empty', className)} data-slot="search-select-empty" {...restProps}>
		{@render children?.()}
	</div>
{/if}

<style lang="scss">
	.search-select-empty {
		padding: 0.75rem;
		text-align: center;
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}
</style>
