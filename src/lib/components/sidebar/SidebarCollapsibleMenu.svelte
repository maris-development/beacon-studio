<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import Button from '@/components/buttons/Button.svelte';
	import SidebarMenuItem from './SidebarMenuItem.svelte';

	let {
		title,
		url,
		icon: Icon,
		items,
	}: {
		title: string;
		url: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
		items: { title: string; url: string }[];
	} = $props();

	function isActive(itemUrl: string): boolean {
		return page.url.pathname === itemUrl || page.url.pathname.startsWith(itemUrl + '/');
	}

	const isHeaderActive = $derived(isActive(url));
	const storageKey = $derived(`beacon-studio.sidebar-menu.${url}.open`);

	let open = $state(true);

	onMount(() => {
		const savedOpen = localStorage.getItem(storageKey);
		if (savedOpen !== null) {
			open = savedOpen === 'true';
		}
	});

	function toggleOpen(): void {
		open = !open;
		localStorage.setItem(storageKey, String(open));
	}
</script>

<div class="collapsible-menu" class:open>
	<div class="collapsible-menu-header">
		<a class:active={isHeaderActive} href={url}>
			<span class="menu-icon"><Icon /></span>
			<span class="submenu-title">{title}</span>
		</a>
		<Button variant="ghost" size="xs" onclick={toggleOpen}>
			<span class="chevron"><ChevronDownIcon /></span>
		</Button>
	</div>

	{#if open}
		<div class="collapsible-menu-items">
			{#each items as item (item.url)}
				<SidebarMenuItem title={item.title} url={item.url} />
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.collapsible-menu {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		.collapsible-menu-header {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;

			a {
				flex-grow: 1;
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

			.chevron {
				display: flex;
				transition: transform 0.2s ease;

				:global(svg) {
					width: 1rem;
					height: 1rem;
				}
			}
		}

		&.open .collapsible-menu-header .chevron {
			transform: rotate(180deg);
		}

		.collapsible-menu-items {
			margin-left: 1.5rem;
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
		}
	}
</style>
