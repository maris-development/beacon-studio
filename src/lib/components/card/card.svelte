<script lang="ts">
	import {  type Snippet } from 'svelte';
	import { cn } from "$lib/utils.js";

	interface Props {
		header?: Snippet;
		children?: Snippet;
		footer?: Snippet;
		class?: string;
		href?: string;
		onClick?: () => void;
	}

	let { header, children, footer, class: cardClass, href, onClick }: Props = $props();
	let card: HTMLElement = $state(null);


</script>

{#if href}
	<a class={cn("card clickable", cardClass)} href={href} bind:this={card}>
		{#if header}
			<div class="card-header">
				{@render header()}
			</div>
		{/if}

		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}

		{#if footer}
			<div class="card-footer">
				{@render footer()}
			</div>
		{/if}
	</a>
{:else if onClick}
	<button type="button" class={cn("card clickable", cardClass)} onclick={onClick} bind:this={card} >
		{#if header}
			<div class="card-header">
				{@render header()}
			</div>
		{/if}

		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}

		{#if footer}
			<div class="card-footer">
				{@render footer()}
			</div>
		{/if}
	</button>
{:else}
	<div class={cn("card", cardClass)} bind:this={card}>
		{#if header}
			<div class="card-header">
				{@render header()}
			</div>
		{/if}

		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}

		{#if footer}
			<div class="card-footer">
				{@render footer()}
			</div>
		{/if}
	</div>
{/if}

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

		&.clickable {
			cursor: pointer;
			transition: background-color 0.2s ease, box-shadow 0.2s ease;

			&:hover {
				background-color: color-mix(in oklab, var(--accent) 50%, transparent);
				box-shadow: var(--shadow-md);
			}
		}
	}
</style>
