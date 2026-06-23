<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';
	import type { CompiledQuery } from '@/beacon-api/types';
	import CopyQueryJsonButton from './CopyQueryJsonButton.svelte';
	import CopyQueryPythonButton from './CopyQueryPythonButton.svelte';

	type ActionCallback = (() => void | Promise<void>) | undefined;

	let {
		onQueryPlan,
		onAnalyze,
		onExecute,
		onViewTable,
		onViewMap,
		onViewChart,
		compileQuery
	}: {
		onQueryPlan?: ActionCallback;
		onAnalyze?: ActionCallback;
		onExecute?: ActionCallback;
		onViewTable?: ActionCallback;
		onViewMap?: ActionCallback;
		onViewChart?: ActionCallback;
		compileQuery?: (() => CompiledQuery) | undefined;
	} = $props();
</script>

<div class="query-action-bar">
	{#if onQueryPlan || onAnalyze || onExecute || compileQuery}
		<div class="action-group">
			{#if onQueryPlan}
				<Button onclick={onQueryPlan}>
					Query Plan
					<TestTubeIcon />
				</Button>
			{/if}

			{#if onAnalyze}
				<Button onclick={onAnalyze}>
					Analyze
					<SearchCodeIcon />
				</Button>
			{/if}

			{#if onExecute}
				<Button onclick={onExecute}>
					Execute query
					<DownloadIcon />
				</Button>
			{/if}

			{#if compileQuery}
				<CopyQueryJsonButton {compileQuery} />
				<CopyQueryPythonButton {compileQuery} />
			{/if}
		</div>
	{/if}

	{#if onViewTable || onViewMap || onViewChart}
		<div class="action-group">
			{#if onViewTable}
				<Button onclick={onViewTable}>
					View as table
					<SheetIcon />
				</Button>
			{/if}

			{#if onViewMap}
				<Button onclick={onViewMap}>
					View on map
					<MapIcon />
				</Button>
			{/if}

			{#if onViewChart}
				<Button onclick={onViewChart}>
					View on chart
					<ChartPieIcon />
				</Button>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.query-action-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.action-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>