<!--
 QueryVisualisationView — the Visualise-mode content of the workbench.

 Runs the active block's query (via BeaconClient) and shows the result under
 Table / Chart / Map sub-tabs. Selecting a different block automatically runs it
 if it hasn't been run before (reusing the BeaconClient cache otherwise).

 Table is rendered inline; Chart and Map are placeholders that open the existing
 full-page explorers with the current query until inline versions are built.
-->
<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Button from '$lib/components/buttons/Button.svelte';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import MapIcon from '@lucide/svelte/icons/map';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Utils } from '@/utils';
	import { BeaconClient } from '@/beacon-api/client';
	import QueryVisualisationTable from './QueryVisualisationTable.svelte';
	import { QueryWorkspace } from './QueryWorkspace.svelte';

	let { workspace, onRunQuery }: { workspace: QueryWorkspace; onRunQuery?: () => Promise<void> } =
		$props();

	let subTab = $state<'table' | 'chart' | 'map'>('table');

	// The active block's compiled query, derived from its draft.
	const activeQuery = $derived(QueryWorkspace.getQuery(workspace.activeBlock));

	// Reactive run-state (drives loading + entry lookup below).
	const runState = $derived(workspace.getRunState(workspace.activeBlock));

	// The cached result of the active block after a run. The lookup uses the dataset
	// key of the block. The query store writes that key at the end of a run.
	const entry = $derived.by(() => {
		const block = workspace.activeBlock;
		if (!block?.datasetKey) return null;
		return BeaconClient.peekQueryByKey(block.datasetKey) ?? null;
	});

	/** Open the active block in a full-page explorer. The link uses the block id. */
	function openInExplorer(path: '/visualisations/chart-explorer' | '/visualisations/map-viewer') {
		const block = workspace.activeBlock;
		if (!activeQuery || !block) return;
		goto(`${resolve(path)}?q=${encodeURIComponent(block.id)}`);
	}
</script>

<div class="visualisation-view">
	{#if !activeQuery}
		<p class="empty">Please select a table and at least one column to visualise the query.</p>
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
