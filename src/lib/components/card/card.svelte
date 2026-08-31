<script lang="ts">
	import {  type Snippet } from 'svelte';
	import { cn } from "$lib/utils.js";

	interface Props {
		children?: Snippet;
		class?: string;
		href?: string;
		onclick?: () => void;
	}

	let { children, class: cardClass, href, onclick }: Props = $props();
	let card: HTMLElement = $state(null);

</script>

{#if href}
	<a class={cn("card clickable", cardClass)} href={href} bind:this={card}>
		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}
	</a>
{:else if onclick}
	<button type="button" class={cn("card clickable", cardClass)} onclick={onclick} bind:this={card} >
		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}
	</button>
{:else}
	<div class={cn("card", cardClass)} bind:this={card}>
		{#if children}
			<div class="card-content">
				{@render children()}
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	button.card {
		text-align: left; // Force left alignment for the button text
	}
	.card {
		display: flex;
		flex-direction: column;
		border-radius: 0.75rem;
		padding: 1rem;
		background-color: var(--card);
		border: 1px solid var(--card-border);
		color: var(--foreground);
		gap: 0.5rem;

		&.clickable {
			cursor: pointer;
			transition: background-color 0.2s ease;

			&:hover {
				background-color: color-mix(in oklab, var(--accent) 50%, transparent);
			}
		}
	}
</style>
