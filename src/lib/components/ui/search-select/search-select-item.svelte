<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onDestroy, onMount } from 'svelte';
	import { cn } from '$lib/utils.js';
	import {
		getSearchSelectContext,
		getSearchSelectGroupContext,
		matchesSearch
	} from './search-select-context';

	let {
		value,
		keywords = [],
		onSelect,
		onclick,
		disabled = false,
		class: className,
		children,
		hidden = $bindable(false),
		...restProps
	}: {
		value?: string;
		keywords?: string[];
		onSelect?: (() => void) | undefined;
		onclick?: ((event: MouseEvent) => void) | undefined;
		disabled?: boolean;
		class?: string;
		children: Snippet;
		hidden?: boolean;
	} = $props();

	const context = getSearchSelectContext();
	const queryStore = context.searchQuery;
	const groupId = getSearchSelectGroupContext();

	let ref: HTMLButtonElement | null = $state(null);
	let resolvedValue = $state(value ?? '');
	const itemId = `search-select-item-${Math.random().toString(36).slice(2)}`;

	onMount(() => {
		context.registerItem(itemId, groupId);
	});

	onDestroy(() => {
		context.unregisterItem(itemId);
	});

	$effect(() => {
		if (value && value.length > 0) {
			resolvedValue = value;
			return;
		}

		if (ref) {
			resolvedValue = ref.textContent?.trim() ?? '';
		}
	});

	$effect(() => {
		hidden = !matchesSearch(resolvedValue, $queryStore, keywords);
		context.setItemVisible(itemId, !hidden);
	});

	function handleClick(event: MouseEvent) {
		if (disabled || hidden) {
			return;
		}

		context.selectedValue.set(resolvedValue);
		onclick?.(event);
		onSelect?.();
	}

</script>

<button
	bind:this={ref}
	type="button"
	role="option"
	class={cn('search-select-item', className)}
	data-slot="search-select-item"
	hidden={hidden}
	disabled={disabled}
	onclick={handleClick}
	{...restProps}
>
	{@render children?.()}
</button>

<style lang="scss">
	.search-select-item {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font-size: 0.875rem;

		&:hover {
			background: var(--accent);
			color: var(--accent-foreground);
		}

		&:focus-visible {
			outline: 2px solid var(--ring);
			outline-offset: 1px;
		}

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}
</style>
