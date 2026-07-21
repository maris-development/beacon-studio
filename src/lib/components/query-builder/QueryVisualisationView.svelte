<!--
 QueryVisualisationView — the Visualise-mode content of the workbench.

 Runs the active block's query (via queryStore) and shows the result under
 Table / Chart / Map sub-tabs. Selecting a different block automatically runs it
 if it hasn't been run before (reusing the queryStore cache otherwise).

 Table is rendered inline; Chart and Map are placeholders that open the existing
 full-page explorers with the current query until inline versions are built.
-->
<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import MapIcon from '@lucide/svelte/icons/map';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Utils } from '@/utils';
	import { queryStore } from '@/stores/query-store.svelte';
	import QueryVisualisationTable from './QueryVisualisationTable.svelte';
	import type { QueryWorkspace } from './QueryWorkspace.svelte';

	let { workspace, onRunQuery }: { workspace: QueryWorkspace; onRunQuery?: () => Promise<void> } =
		$props();

	let subTab = $state<'table' | 'chart' | 'map'>('table');

	// The active block's compiled query, derived from its draft.
	const activeQuery = $derived(workspace.queryFor(workspace.activeBlock));
	// Reactive run-state (drives loading + entry lookup below).
	const runState = $derived(workspace.runStateFor(workspace.activeBlock));
	// The cached result for the active query, once it has been run.
	const entry = $derived(
		activeQuery && runState.hasRun ? (queryStore.peek(activeQuery) ?? null) : null
	);

	// Run the active block whenever it changes — no-op if already run or running.
	// $effect(() => {
	//     const id = workspace.activeBlockId;
	//     const query = workspace.activeBlock?.query;
	//     if (!id || !query) return;
	//     const runState = workspace.runStateFor(workspace.activeBlock);
	//     if (runState.hasRun || runState.isRunning) return;
		
	//     workspace.markBlockRunning(id, true);
	//     queryStore.ensure(query)
	//         .then((entry) => workspace.markBlockRun(id, entry.rowCount))
	//         .catch(() => workspace.markBlockRunning(id, false));
	// });

	/** Opens the current query in a full-page explorer (chart/map placeholders). */
	function openInExplorer(path: '/visualisations/chart-explorer' | '/visualisations/map-viewer') {
		if (!activeQuery) return;
		const gz = Utils.objectToGzipString(activeQuery);
		if (gz) {
			goto(resolve(path) + `?query=${encodeURIComponent(gz)}`);
		}
	}
</script>

<div class="visualisation-view">
	{#if !activeQuery}
		<p class="empty">Build a query (pick a table and columns) to visualise it.</p>
	{:else}
		<Tabs.Root bind:value={subTab} class="w-full">
			<Tabs.List>
				<Tabs.Trigger value="table">Table</Tabs.Trigger>
				<Tabs.Trigger value="chart">Chart</Tabs.Trigger>
				<Tabs.Trigger value="map">Map</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="table">
				<div class="result-actions">
					<Button onclick={onRunQuery} disabled={runState.isRunning || !activeQuery}>
						{runState.isRunning ? 'Running…' : runState.hasRun ? 'Re-run query' : 'Run query'}
					</Button>
				</div>
				<p class="result-summary">
					{#if runState.isRunning}
						Running query…
					{:else if entry}
						{entry.rowCount} rows in {Utils.formatSecondsToReadableTime(entry.duration / 1000)}.
					{:else}
						Query has not produced a result yet.
					{/if}
				</p>
				<QueryVisualisationTable {entry} isLoading={runState.isRunning} />
			</Tabs.Content>

			<!-- Run button -->

			<Tabs.Content value="table">
			    <div class="result-actions">
			        <Button onclick={onRunQuery} disabled={runState.isRunning || !activeQuery}>
			            {runState.isRunning ? 'Running…' : runState.hasRun ? 'Re-run query' : 'Run query'}
			        </Button>
			    </div>
			    <p class="result-summary">
			        ...
			    </p>
			    <QueryVisualisationTable {entry} isLoading={runState.isRunning} />
			</Tabs.Content>

			<!-- Placeholder: reuse the full-page chart explorer until an inline chart exists. -->
			<Tabs.Content value="chart">
				<div class="placeholder">
					<p>Inline chart is not built yet.</p>
					<Button onclick={() => openInExplorer('/visualisations/chart-explorer')}>
						<ChartPieIcon />
						Open in chart explorer
						<ExternalLinkIcon />
					</Button>
				</div>
			</Tabs.Content>

			<!-- Placeholder: reuse the full-page map viewer until an inline map exists. -->
			<Tabs.Content value="map">
				<div class="placeholder">
					<p>Inline map is not built yet.</p>
					<Button onclick={() => openInExplorer('/visualisations/map-viewer')}>
						<MapIcon />
						Open in map viewer
						<ExternalLinkIcon />
					</Button>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>

<style lang="scss">
	.visualisation-view {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty {
		padding: 2rem;
		text-align: center;
		color: var(--muted-foreground);
	}

	.result-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.result-summary {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		border: 1px dashed var(--border);
		border-radius: 0.5rem;
		color: var(--muted-foreground);
	}
</style>
