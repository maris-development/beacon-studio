<script lang="ts">
	import { cn } from '$lib/utils.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { get } from 'svelte/store';
	import { getSearchSelectContext } from './search-select-context';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		placeholder = 'Search... ',
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		onKeydown = $bindable((event: KeyboardEvent) => {}),
		...restProps
	}: {
		ref?: HTMLInputElement | null;
		value?: string;
		class?: string;
		placeholder?: string;
		onKeydown?: (event: KeyboardEvent) => void;
	} = $props();

	const context = getSearchSelectContext();
	const queryStore = context.searchQuery;

	$effect(() => {
		if (value !== get(queryStore)) {
			queryStore.set(value);
		}
	});

	$effect(() => {
		const next = $queryStore;
		if (next !== value) {
			value = next;
		}
	});

	function onInput(event: Event) {
		const nextValue = (event.currentTarget as HTMLInputElement).value;
		value = nextValue;
		queryStore.set(nextValue);
	}
</script>

<div class="search-select-input-wrapper" data-slot="search-select-input-wrapper">
	<SearchIcon class="search-select-input-icon" />
	<input
		onkeydown={onKeydown}
		bind:this={ref}
		type="text"
		value={value}
		oninput={onInput}
		class={cn('search-select-input', className)}
		data-slot="search-select-input"
		{placeholder}
		{...restProps}
	/>
</div>

<style lang="scss">
	.search-select-input-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.search-select-input-icon {
		width: 1rem;
		height: 1rem;
		opacity: 0.5;
		color: var(--muted-foreground);
		flex-shrink: 0;
	}

	.search-select-input {
		width: 100%;
		border: 0;
		background: transparent;
		outline: none;
		font-size: 0.875rem;
		color: inherit;

		&::placeholder {
			color: var(--muted-foreground);
		}
	}
</style>
