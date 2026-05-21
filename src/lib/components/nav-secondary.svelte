<script lang="ts">
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import ExternalLink from "$lib/components/external-link.svelte";
	import type { Component, ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		items,
		...restProps
	}: {
		items: {
			title: string;
			url: string;
			icon: Component;
			target?: string;
		}[];
	} & ComponentProps<typeof Sidebar.Group> = $props();

	const shouldOpenExternally = (item: { url: string; target?: string }) =>
		item.target === '_blank' || /^https?:\/\//.test(item.url);
</script>

<Sidebar.Group bind:ref {...restProps}>
	<Sidebar.GroupContent>
		<Sidebar.Menu>
			{#each items as item (item.title)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="sm">
						{#snippet child({ props })}
							{#if shouldOpenExternally(item)}
								<ExternalLink href={item.url} target={item.target} {...props}>
									<item.icon />
									<span>{item.title}</span>
								</ExternalLink>
							{:else}
								<a href={item.url} target={item.target} {...props}>
									<item.icon />
									<span>{item.title}</span>
								</a>
							{/if}
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.GroupContent>
</Sidebar.Group>
