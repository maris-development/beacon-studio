<script lang="ts">
	import { page } from '$app/state';

	let {
		title,
		url,
		icon: Icon = undefined,
		target = undefined,
	}: {
		title: string;
		url: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: any;
		target?: string;
	} = $props();

	const isActive = $derived(
		page.url.pathname === url || page.url.pathname.startsWith(url + '/')
	);
</script>

<a class="menu-item" class:active={isActive} href={url} {target}>
	{#if Icon}
		<Icon class="size-4" />
	{/if}
	<span class="item-title">{title}</span>
</a>

<style lang="scss">
	.menu-item {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 0.5rem;
		border-left: 2px solid transparent;
		text-decoration: none;
		color: inherit;

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
