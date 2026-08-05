<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Utils } from '@/utils';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
	import GraphViewer from '@/components/graph-viewer/GraphViewer.svelte';
	import { resolveUrlQuery } from '@/stores/query-library';
	import QuerySelectorHeader from '@/components/query-builder/QuerySelectorHeader.svelte';
	import { QueryWorkspace } from '@/components/query-builder/QueryWorkspace.svelte';
	import type { StoredQuery } from '@/stores/stored-query';
	import { currentBeaconInstance } from '@/stores/config';
	import { getDefaultQueryActions } from '@/components/query-builder/QueryActions';
	import VisualisationTabs from '@/components/visualisation/VisualisationTabs.svelte';

	let entry = $state.raw<DatasetEntry | null>(null);
	let table: ApacheArrow.Table | null = $derived(entry?.table ?? null);
	let queryDurationMs: number | null = $derived(entry?.duration ?? 0);

	const workspace = $state(new QueryWorkspace());

	let client: BeaconClient | null = $state(null);

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
	const compiledQuery: CompiledQuery | null = $derived(QueryWorkspace.getQuery(workspace.activeBlock));
	const queryKey = $derived(compiledQuery ? JSON.stringify(compiledQuery) : null);

	let lastRunKey: string | null = $state(null);

	// Re-run only when the selected block, or its compiled query content, actually changes.
	$effect(() => {
		const blockId = activeBlockId;
		const key = queryKey;

		if (!blockId || !key) {
			entry = null;
			lastRunKey = null;
			return;
		}

		const runKey = `${blockId}:${key}`;
		if (runKey === lastRunKey) return;
		lastRunKey = runKey;

		// Read the live block/query untracked: we only want blockId+key above to
		// drive re-runs, not every downstream write this triggers.
		const { block, query } = untrack(() => ({
			block: workspace.activeBlock,
			query: compiledQuery
		}));
		if (!block || !query) return;

		// Show a cached result at once if the block already has one.
		entry = BeaconClient.peekQueryByKey(block.datasetKey) ?? null;

		executeAndDisplayQuery(block, query);
	});

	async function executeAndDisplayQuery(block: StoredQuery, query: CompiledQuery) {
		workspace.markBlockRunning(block.id, true);

		try {
			entry = await BeaconClient.ensureQuery(query, block.id);
			workspace.markBlockRun(block.id, entry.rowCount);

			if (entry.rowCount === 0) {
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}

			prepareTableForDisplay();
		} catch (error) {
			console.error('Failed to execute query:', error);
			workspace.markBlockRunning(block.id, false);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${error.message}`
			});
		}
	}

	function prepareTableForDisplay() {
		if (!table) {
			addToast({
				type: 'error',
				message: 'No table data available to display.'
			});
			return;
		}

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
				<div class="header">
					<p>
						{#if table?.numRows == null}
							Loading rows…
						{:else}
							{table.numRows} rows selected in {Utils.formatSecondsToReadableTime(
								queryDurationMs / 1000
							)}.
						{/if}
					</p>

					<p>
						Below you can find a <a
							href="https://perspective.finos.org/"
							target="blank"
							rel="noopener noreferrer">Perspective viewer</a
						> that allows you to explore the query results interactively. By default it opens a table, but
						you can adjust it's behaviour by modifying the viewer's configuration options using the 'Configure'
						button in the top right.
					</p>
				</div>
			{/if}

			<!--
				GraphViewer must stay mounted once created: `@finos/perspective-viewer`
				registers its custom element inside `init_client()`, which GraphViewer
				calls from `onMount`. A second mount re-registers the same tag name and
				throws. Toggling this with `{#if}` (destroy/recreate) is what caused
				that; a `hidden` class only hides it instead.
			-->
			<div class="viewer" class:hidden={!compiledQuery}>
				<GraphViewer class="flex-1" {table} />
			</div>
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
			gap: 1rem;
		}

		.content {
			flex-grow: 1;
		}

		.viewer {
			flex-grow: 1;
			display: flex;
			flex-direction: column;

			&.hidden {
				display: none;
			}
		}
	}
</style>
