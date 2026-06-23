<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		children,
		...restProps
	}: {
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
    tabindex="-1"
    class={cn('search-select-list', className)}
    data-slot="search-select-list"
    {...restProps}
>
	{@render children?.()}
</div>

<style lang="scss">
	.search-select-list {
		max-height: 18.75rem;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.25rem;
	}
</style>
