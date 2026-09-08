<script lang="ts">
	import { page } from '$app/state';

	let {
		title,
		url = undefined,
		icon: Icon = undefined,
		target = undefined,
		onclick = undefined
	}: {
		title: string;
		url?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: any;
		target?: string;
		onclick?: () => void;
	} = $props();

	const isActive = $derived(
		!!url && (page.url.pathname === url || page.url.pathname.startsWith(url + '/'))
	);
</script>

{#if onclick}
	<button class="menu-item" type="button" {onclick}>
		{#if Icon}
			<span class="menu-icon"><Icon /></span>
		{/if}
		<span class="item-title">{title}</span>
	</button>
{:else}
	<a class="menu-item" class:active={isActive} href={url} {target}>
		{#if Icon}
			<span class="menu-icon"><Icon /></span>
		{/if}
		<span class="item-title">{title}</span>
	</a>
{/if}

<style lang="scss">
	.menu-item {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 0.5rem;
		border: none;
		border-left: 2px solid transparent;
		text-decoration: none;
		color: inherit;
		background: none;
		font: inherit;
		text-align: left;
		width: 100%;

		.menu-icon {
			display: flex;
			flex-shrink: 0;

			:global(svg) {
				width: 1rem;
				height: 1rem;
			}
		}

		&:hover {
			color: var(--primary);
			background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
		}

		&.active {
			color: var(--primary);
			border-left-color: var(--primary);
			background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
		}
	}
</style>
