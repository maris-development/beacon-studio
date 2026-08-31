<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { Utils, VirtualPaginationArrowTableData } from '@/utils';
	import { addToast } from '@/stores/toasts';
	import type { BeaconInstance, CompiledQuery } from '@/beacon-api/types';
	import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
	import { queryStore } from '@/stores/query-store.svelte';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import type { Column, SortDirection } from '@/util-types';
	import { resolveUrlQuery } from '@/stores/query-library';
	import QuerySelectorHeader from '@/components/query-builder/QuerySelectorHeader.svelte';
	import { QueryWorkspace } from '@/components/query-builder/QueryWorkspace.svelte';
	import type { StoredQuery } from '@/stores/stored-query';
	import { getDefaultQueryActions } from '@/components/query-builder/QueryActions';
	import VisualisationTabs from '@/components/visualisation/VisualisationTabs.svelte';
	import { Input } from '@/components/ui/input';

	let entry = $state.raw<DatasetEntry | null>(null);
	let table: ApacheArrow.Table | null = $derived(entry?.table ?? null);
	let queryDurationMs: number | null = $derived(entry?.duration ?? 0);

	let virtualPaginationData: VirtualPaginationArrowTableData =
		new VirtualPaginationArrowTableData();
	let columns: Column[] = $state([]);
	let displayRows: Record<string, string>[] = $state([]); //currently displayed rows

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let pageSize: number = $state(30);
	let isLoading = $state(true);

	const workspace = $state(new QueryWorkspace());

	onMount(() => {
		// A deep-link opens one more block. `?q=` comes from "open in workbench"
		// and brings the saved builder state. `?query=` comes from a share link.
		workspace.openFromUrl(resolveUrlQuery(page.url));

		return () => workspace.destroy();
	});

	const queryActions = $derived(getDefaultQueryActions(workspace));

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

	// The node of the active block. A block owns its node, so a switch of block
	// switches the node. The URL is a primitive, so the run effect below can track
	// it. It is null while the block names no node, and while the instance list
	// holds no node for its ref. The effect then runs nothing.
	//
	// The URL also belongs in the run key. A user can add a node that a share link
	// asked for. The query must then run, with no other change to the block.
	const activeInstanceUrl = $derived(workspace.activeInstance?.url ?? null);

	let lastRunKey: string | null = $state(null);

	// Re-run only when the selected block, or its compiled query content, actually changes.
	$effect(() => {
		const blockId = activeBlockId;
		const key = queryKey;
		const instanceUrl = activeInstanceUrl;

		if (!blockId || !key || !instanceUrl) {
			entry = null;
			columns = [];
			displayRows = [];
			totalRows = 0;
			isLoading = false;
			lastRunKey = null;
			return;
		}

		const runKey = `${blockId}:${instanceUrl}:${key}`;
		if (runKey === lastRunKey) return;
		lastRunKey = runKey;

		// Read the live block/query untracked: we only want blockId+key above to
		// drive re-runs, not every downstream write this triggers.
		const { block, query, instance } = untrack(() => ({
			block: workspace.activeBlock,
			query: compiledQuery,
			instance: workspace.activeInstance
		}));
		if (!block || !query || !instance) return;

		// Show a cached result at once if the block already has one.
		entry = BeaconClient.peekQueryByKey(block.datasetKey) ?? null;
		if (entry) prepareTableForDisplay();

		executeAndDisplayQuery(block, query, instance);
	});

	async function executeAndDisplayQuery(
		block: StoredQuery,
		query: CompiledQuery,
		instance: BeaconInstance
	) {
		isLoading = true;
		workspace.markBlockRunning(block.id, true);

		try {
			entry = await BeaconClient.ensureQuery(query, instance, block.id);
			workspace.markBlockRun(block.id, entry.rowCount);

			if (entry.rowCount === 0) {
				isLoading = false;
				columns = [];
				displayRows = [];
				totalRows = 0;
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}

			prepareTableForDisplay();
		} catch (error) {
			isLoading = false;
			workspace.markBlockRunning(block.id, false);

			// The app runs one query at a time. A newer run stopped this one, so it
			// is no error.
			if (BeaconClient.isQueryAbort(error)) return;

			console.error('Failed to execute query:', error);
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

		totalRows = table.numRows;
		virtualPaginationData.setData(table);

		columns = table.schema.fields.map((field) => ({
			key: field.name,
			header: Utils.ucfirst(field.name),
			sortable: field.typeId != ApacheArrow.Type.Struct // Disable sorting for geometry columns
		}));

		getPage();
	}

	function onPageChange(newPageIndex: number) {
		pageIndex = newPageIndex;
		getPage();
	}

	async function onChangeSort(columnKey: string, direction: SortDirection) {
		if (!entry) return;

		// console.log('Sorting by', columnKey, 'in', direction, 'order');

		displayRows = [];
		isLoading = true;

		try {
			const sortedTable = await queryStore.sort(entry, columnKey, direction);

			virtualPaginationData.setData(sortedTable);

			getPage();
		} catch (error) {
			console.error('Error sorting table:', error);
			addToast({
				type: 'error',
				message: `Failed to sort table: ${error.message}`
			});
		}
	}

	function getPage() {
		offset = (pageIndex - 1) * pageSize;

		const data = virtualPaginationData.getPageData(offset, pageSize);

		setData(data);

		Utils.setPageUrlParameter(pageIndex);
	}

	function setData(fields: Record<string, string>[]) {
		displayRows = fields;

		isLoading = false;
	}
</script>

<svelte:head>
	<title>Table explorer - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Table explorer', href: '/visualisations/table-explorer' }
	]}
/>

<div class="page-wrapper">
	<QuerySelectorHeader {workspace} {queryActions} mode="view" />

	<div class="vertical-tabs-wrapper">
		<VisualisationTabs />

		<div class="content page-container">
			{#if !compiledQuery}
				<p>Select a valid query above to see its data.</p>
			{:else}
				<div class="top-bar">
					<p>
						{#if table?.numRows == null}
							Loading rows…
						{:else}
							{table.numRows} rows selected in {Utils.formatSecondsToReadableTime(
								queryDurationMs / 1000
							)}.
						{/if}
					</p>

					<div class="page-size-input">
						<label for="page-size">Rows per page:</label>
						<Input
							id="page-size"
							type="number"
							min="10"
							step="10"
							bind:value={pageSize}
							onchange={() => {
								pageIndex = 1;
								getPage();
							}}
						/>
					</div>
				</div>

				<DataTable
					{onPageChange}
					{onChangeSort}
					{columns}
					rows={displayRows}
					{totalRows}
					{pageSize}
					{pageIndex}
					{isLoading}
				/>
			{/if}
		</div>
	</div>
</div>

<style lang="scss">
	.page-wrapper {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
	}

	.vertical-tabs-wrapper {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
		gap: 1rem;

		.content.page-container {
			flex-grow: 1;
			min-height: 0;

			display: flex;
			flex-direction: column;

			.top-bar {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 0.5rem;

				.page-size-input {
					// width: 4rem;
				}
			}
		}
	}
</style>
