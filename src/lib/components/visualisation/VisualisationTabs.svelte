<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import MapIcon from '@lucide/svelte/icons/map';
	import TableIcon from '@lucide/svelte/icons/table';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import { t, type MessageKey } from '@/i18n';

	const tabs: Array<{ labelKey: MessageKey; path: string; icon: typeof MapIcon }> = $derived([
		{ labelKey: 'map.headTitle', path: resolve('/visualisations/map-viewer'), icon: MapIcon },
		{ labelKey: 'visualisation.tab.table', path: resolve('/visualisations/table-explorer'), icon: TableIcon },
		{ labelKey: 'visualisation.tab.chart', path: resolve('/visualisations/chart-explorer'), icon: ChartPieIcon }
	]);
</script>

<div class="page-container">
	<div class="vertical-tabs">
		{#each tabs as tab (tab.path)}
			<a
				href={tab.path}
				class="tab {page.url.pathname === tab.path ? 'active' : ''}"
			>
				<tab.icon size="1rem" />
				{$t(tab.labelKey)}
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
