<script lang="ts">
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Utils } from '@/utils';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { BeaconClient } from '@/beacon-api/client';
	import { resolveUrlQuery } from '@/stores/query-library';
	import QuerySelectorHeader from '@/components/query-builder/QuerySelectorHeader.svelte';
	import { QueryWorkspace } from '@/components/query-builder/QueryWorkspace.svelte';
	import { currentBeaconInstance } from '@/stores/config';
	import { getDefaultQueryActions } from '@/components/query-builder/QueryActions';
	import VisualisationTabs from '@/components/visualisation/VisualisationTabs.svelte';
	import LoadingSpinner from '@/components/loading-overlay/LoadingSpinner.svelte';
	import PlotCanvas from '@/components/plots/PlotCanvas.svelte';
	import PlotConfigPanel from '@/components/plots/PlotConfigPanel.svelte';
	import PlotTabs from '@/components/plots/PlotTabs.svelte';
	import { ChartExplorerController } from '@/components/plots/ChartExplorerController.svelte';
	import { type ChartViewState } from '@/plots/plot-config';

	const workspace = $state(new QueryWorkspace());
	let client: BeaconClient | null = $state(null);

	// The controller owns the result, the plots and the numbers behind them. The
	// page keeps only the query effect and the markup.
	const charts = new ChartExplorerController(
		(running) => {
			const id = workspace.activeBlockId;
			if (id) workspace.markBlockRunning(id, running);
		},
		(rows) => {
			const id = workspace.activeBlockId;
			if (id) workspace.markBlockRun(id, rows);
		}
	);

	onMount(() => {
		const instance = $currentBeaconInstance;
		if (instance) client = BeaconClient.new(instance);

		// A deep-link opens one more block. `?q=` comes from "open in workbench"
		// and brings the saved builder state. `?query=` comes from a share link.
		workspace.openFromUrl(resolveUrlQuery(page.url));

		return () => workspace.destroy();
	});

	const queryActions = $derived(getDefaultQueryActions(workspace, client));

	// `workspace.activeBlock` is a new object on every write to the block
	// collection — including our own `markBlockRun` below. Tracking that object
	// (or `compiledQuery` derived from it) as an effect dependency would re-fire
	// the effect after every run, forever. Track primitives instead: the block id
	// and a content key for the compiled query.
	const activeBlockId = $derived(workspace.activeBlockId);
	const compiledQuery: CompiledQuery | null = $derived(
		QueryWorkspace.getQuery(workspace.activeBlock)
	);
	const queryKey = $derived(compiledQuery ? JSON.stringify(compiledQuery) : null);

	let lastRunKey: string | null = $state(null);
	/** The block of the last run. A new block brings its own plots. */
	let lastRunBlockId: string | null = $state(null);

	// Re-run only when the selected block, or its compiled query content, actually changes.
	$effect(() => {
		const blockId = activeBlockId;
		const key = queryKey;

		if (!blockId || !key) {
			charts.clearQueryResult();
			lastRunKey = null;
			return;
		}

		const runKey = `${blockId}:${key}`;
		if (runKey === lastRunKey) return;

		const isSameBlock = blockId === lastRunBlockId;
		lastRunKey = runKey;
		lastRunBlockId = blockId;

		// Read the live block/query untracked: we only want blockId+key above to
		// drive re-runs, not every downstream write this triggers.
		const { block, query } = untrack(() => ({
			block: workspace.activeBlock,
			query: compiledQuery
		}));
		if (!block || !query) return;

		// The saved plots of this block belong on the page again. A block with no
		// saved plots gets one default plot.
		if (!isSameBlock) {
			charts.applyViewState(block.id, block.view?.chart, block.draft?.spatialFilter ?? null);
		} else {
			// The same block can carry a new area, for example after the user applied
			// a cross section on the map. A cross section plot reads that line.
			charts.setSelection(block.draft?.spatialFilter ?? null);
		}

		// Show a cached result at once if the block already has one.
		charts.showQueryFromCache(block.datasetKey);

		charts.runAndShowQuery(query, block.id);
	});

	// Keep the plots with the block. Therefore a visit to the map or the table
	// page, and a reload, bring the same plots back.
	//
	// The write is delayed. It serialises every block into localStorage, which is
	// far too much work for one keystroke in a title field. The delay collects a
	// burst of edits into one write.
	//
	// `viewStateFor` returns null while the controller still holds the plots of
	// another block.
	const PERSIST_DELAY_MS = 400;

	let persistTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingWrite: { blockId: string; state: ChartViewState } | null = null;

	$effect(() => {
		const blockId = activeBlockId;
		const state = charts.viewStateFor(blockId);
		if (!blockId || !state) return;

		// The block id travels with the state. By the time the write runs, the user
		// can have selected another block, and this state belongs to the old one.
		pendingWrite = { blockId, state };

		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = setTimeout(flushPersist, PERSIST_DELAY_MS);
	});

	onDestroy(flushPersist);

	function flushPersist() {
		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = null;

		const write = pendingWrite;
		pendingWrite = null;
		if (!write) return;

		untrack(() => workspace.updateChartView(write.blockId, write.state));
	}

	// Rebuild the numbers of the plot when the choices behind them change.
	//
	// The reads below are the dependencies. The work itself is deferred past the
	// next paint, because it walks every row: at 600k rows a synchronous build
	// here would hold the navigation and leave the user on the previous page,
	// with a frozen window, until the whole chart was ready.
	$effect(() => {
		void [charts.seriesKey, charts.contourKey, charts.interpolationKey, charts.table];
		untrack(() => charts.schedulePrepare());
	});

	onDestroy(() => charts.cancelPrepare());

	// -- export --------------------------------------------------------------

	let plotCanvas: ReturnType<typeof PlotCanvas> | null = $state(null);

	function exportPng() {
		const plot = charts.activePlot;
		if (!plot || !plotCanvas) return;

		plotCanvas.exportPng(plot.title || plot.name);
	}
</script>

<svelte:head>
	<title>Chart explorer - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Chart explorer', href: '/visualisations/chart-explorer' }
	]}
/>

<div class="page-wrapper">
	<QuerySelectorHeader {workspace} {queryActions} mode="view" />

	<div class="vertical-tabs-wrapper">
		<VisualisationTabs />

		<div class="content page-container">
			{#if !compiledQuery}
				<p>Select a valid query above to see it on a chart.</p>
			{:else}
				<p class="result-summary">
					{#if charts.isLoading && !charts.entry}
						Loading rows…
					{:else}
						{charts.rowCount} rows selected in {Utils.formatSecondsToReadableTime(
							charts.durationMs / 1000
						)}{#if charts.series?.skippedRows}, {charts.series.skippedRows} without a value on every
							axis{/if}.
					{/if}
				</p>

				<PlotTabs controller={charts} onExport={exportPng} />

				<div class="plot-layout">
					<PlotConfigPanel controller={charts} />

					<div class="plot-area">
						{#if charts.activePlot}
							<PlotCanvas
								bind:this={plotCanvas}
								plot={charts.activePlot}
								series={charts.displaySeries}
								contours={charts.contours}
								interpolation={charts.interpolation}
								message={charts.message}
								onBusyChange={(busy) => charts.setCanvasBusy(busy)}
							/>
						{/if}

						{#if charts.isLoading || charts.isBusy}
							<div class="loading-overlay">
								<LoadingSpinner></LoadingSpinner>

								{#if charts.isLoading}
									<h3>Running the query…</h3>
								{:else}
									<h3>Drawing the plot…</h3>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style lang="scss">
	.page-wrapper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		flex-grow: 1;
		min-height: 0;
	}

	.vertical-tabs-wrapper {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
		gap: 1rem;

		.page-container {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			min-height: 0;
		}

		.content {
			flex-grow: 1;
		}
	}

	.result-summary {
		font-size: 0.875rem;
	}

	.plot-layout {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
		gap: 1rem;
	}

	.plot-area {
		flex-grow: 1;
		min-width: 0;
		min-height: 0;
		// Stack the canvas and the overlay in one cell, instead of positioning the
		// overlay absolutely.
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);

		// `:global` is required. Svelte scopes a bare `> *` to this component, and
		// the root element of PlotCanvas carries that component's scope class, not
		// this one. The rule would skip the canvas, which would then land in an
		// implicit second row and sit below the spinner instead of behind it.
		> :global(*) {
			grid-column: 1;
			grid-row: 1;
		}

		.loading-overlay {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			align-items: center;
			justify-content: center;
			background-color: rgba(255, 255, 255, 0.6);
			border-radius: 0.5rem;
			z-index: 2;
		}
	}
</style>
