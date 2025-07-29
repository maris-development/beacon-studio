<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		header?: Snippet;
		content?: Snippet;
		footer?: Snippet;
	}

	let { header, content, footer }: Props = $props();
</script>

<div class="card">
	{#if header}
		<div class="card-header">
			{@render header()}
		</div>
	{/if}

	{#if content}
		<div class="card-content">
			{@render content()}
		</div>
	{/if}

	{#if footer}
		<div class="card-footer">
			{@render footer()}
		</div>
	{/if}
</div>

<style lang="scss">
	.card {
		display: flex;
		flex-direction: column;
		border-radius: 0.625rem;
		padding: 1.5rem;
		box-shadow: var(--shadow-sm);
		border-style: var(--tw-border-style);
		border-width: 1px;
		color: var(--foreground);
		gap: 0.75rem;
	}
</style>
