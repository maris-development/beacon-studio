<!--
 QueryVisualisationTable — renders a run query result (Arrow table) as a paginated,
 sortable data grid. Reuses the same DataTable + pagination  helpers
 as the standalone table-explorer page, but driven by an in-memory DatasetEntry
 instead of the ?query= URL.
-->
<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { Utils, VirtualPaginationArrowTableData } from '@/utils';
	import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
	import { addToast } from '@/stores/toasts';
	import type { Column, SortDirection } from '@/util-types';

	let { entry, isLoading = false }: { entry: DatasetEntry | null; isLoading?: boolean } = $props();

	// Client-side pagination over the Arrow table (no re-fetch when paging).
	const pagination = new VirtualPaginationArrowTableData();

	let columns = $state<Column[]>([]);
	let displayRows = $state<Record<string, string>[]>([]);
	let totalRows = $state(0);
	let pageIndex = $state(1);
	const pageSize = 20;
	let sorting = $state(false);

	// Re-prepare the grid whenever the result entry changes (new run / new block).
	$effect(() => {
		const table = entry?.table ?? null;
		if (!table) {
			columns = [];
			displayRows = [];
			totalRows = 0;
			return;
		}

		totalRows = table.numRows;
		pagination.setData(table);
		columns = table.schema.fields.map((field) => ({
			key: field.name,
			header: Utils.ucfirst(field.name),
			// Geometry/struct columns aren't sortable.
			sortable: field.typeId != ApacheArrow.Type.Struct
		}));
		pageIndex = 1;
		showPage();
	});

	function showPage() {
		const offset = (pageIndex - 1) * pageSize;
		displayRows = pagination.getPageData(offset, pageSize);
	}

	function onPageChange(newPageIndex: number) {
		pageIndex = newPageIndex;
		showPage();
	}

	// Sorting is delegated to the shared worker via BeaconClient.sortQueryTable
	async function onChangeSort(columnKey: string, direction: SortDirection) {
		if (!entry) return;
		sorting = true;
		try {
			const sorted = await BeaconClient.sortQueryTable(entry, columnKey, direction);
			pagination.setData(sorted);
			showPage();
		} catch (error) {
			addToast({ type: 'error', message: `Failed to sort table: ${error.message}` });
		} finally {
			sorting = false;
		}
	}
</script>

<DataTable
	{onPageChange}
	{onChangeSort}
	{columns}
	rows={displayRows}
	{totalRows}
	{pageSize}
	{pageIndex}
	isLoading={isLoading || sorting}
/>
