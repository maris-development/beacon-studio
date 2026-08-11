<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import MapIcon from '@lucide/svelte/icons/map';
	import TableIcon from '@lucide/svelte/icons/table';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';

	// Carry the active query along when switching modes: each page rehydrates
	// its QueryWorkspace from `q` (block id) or `query` (shared link) on mount.
	// Dropping the param on tab switch would lose the selected query.
	const preservedParam = $derived(
		page.url.searchParams.has('q')
			? `?q=${page.url.searchParams.get('q')}`
			: page.url.searchParams.has('query')
				? `?query=${page.url.searchParams.get('query')}`
				: ''
	);

	const tabs = $derived([
		{ label: 'Map', path: resolve('/visualisations/map-viewer'), icon: MapIcon },
		{ label: 'Table', path: resolve('/visualisations/table-explorer'), icon: TableIcon },
		{ label: 'Chart', path: resolve('/visualisations/chart-explorer'), icon: ChartPieIcon }
	]);
</script>

<div class="page-container">
	<div class="vertical-tabs">
		{#each tabs as tab (tab.path)}
			<a
				href={tab.path + preservedParam}
				class="tab {page.url.pathname === tab.path ? 'active' : ''}"
			>
				<tab.icon size="1rem" />
				{tab.label}
			</a>
		{/each}
	</div>
</div>

<style lang="scss">
	.page-container {
		display: flex;
		flex-direction: column;

		.vertical-tabs {
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			background-color: #f0f0f0;
			border-radius: 0.5rem;

			.tab {
				flex-grow: 1;
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.5rem;
				writing-mode: sideways-lr;
				padding: 0.5rem;
				text-align: center;

				&.active {
					background-color: #d0d0d0;
					border-radius: 0.5rem;
				}
			}
		}
	}
	
</style>
