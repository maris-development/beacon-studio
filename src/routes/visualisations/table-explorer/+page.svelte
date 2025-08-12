<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { Utils, VirtualPaginationArrowTableData } from '@/utils';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery, QueryResponse, QueryResponseKind } from '@/beacon-api/types';
	import DataTable from '@/components/data-table.svelte';
	import { Button } from '@/components/ui/button';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import { ArrowProcessingWorkerManagager } from '@/workers/ArrowProcessingWorkerManagager';
	import type { Column, SortDirection } from '@/util-types';

	const arrowWorker: ArrowProcessingWorkerManagager = new ArrowProcessingWorkerManagager();

	let query: CompiledQuery | undefined = $state(undefined);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let table: ApacheArrow.Table | null = $state(null); // The table data returned from the query
	let table_kind: QueryResponseKind | null = $state(null);



	let virtualPaginationData: VirtualPaginationArrowTableData = new VirtualPaginationArrowTableData();
	let columns: Column[] = $state([]);
	let displayRows: Record<string, any>[] = $state([]); //currently displayed rows

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let pageSize: number = $state(20);
	let isLoading = $state(true);
	let firstLoad = $state(true);

	// Modal for editing query
	let editQueryModalOpen = $state(false);
	let editQueryString = $state('');

	onMount(async () => {
		
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		getUrlSuppliedQuery();
	});

	async function getUrlSuppliedQuery(){
		const urlSuppliedQuery = page.url.searchParams.get('query');

		if (urlSuppliedQuery) {
			try {
				query = Utils.gzipStringToObject(urlSuppliedQuery);
				query.output.format = 'parquet';
			} catch (error) {
				console.error('Failed to decode query:', error);
			}
		}

		if (query) {
			// Use the decoded query for your logic
			executeAndDisplayQuery();

		} else {
			// TODO: Ask user for query json
			editQueryString = '{ "message": "Enter a JSON query" }';
			editQueryModalOpen = true;

		}
	}

	async function executeAndDisplayQuery() {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		try {
			await executeQuery();
			prepareTableForDisplay();
		} catch (error) {
			addToast({
				type: 'error',
				message: `Failed to execute query: ${error.message}`
			});
		}
		
	}

	async function executeQuery() {
		const result = await client.query(query);

		if (result.isErr()) {
			console.error(result.unwrapErr());
			addToast({
				type: 'error',
				message: `Failed to execute query: ${result.unwrapErr()}`
			});
		}

		const queryResponse: QueryResponse = result.unwrap();

		if (queryResponse.kind == 'error') {
			console.error(queryResponse.error_message);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${queryResponse.error_message}`
			});
			return;
		}

		if (!('arrow_table' in queryResponse)) {
			console.error('Unexpected query result format:', queryResponse);
			addToast({
				type: 'error',
				message: `Unexpected query result format`
			});
			return;
		}

		table = queryResponse.arrow_table;
		table_kind = queryResponse.kind;

		console.log('Query result:', table);
			
	}

	function prepareTableForDisplay(){
		if(!table){
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
			sortable: true
		}));

		getPage();
	}

	function onPageChange(newPageIndex: number) {
		pageIndex = newPageIndex;
		getPage();
	}

	async function onChangeSort(columnKey: string, direction: SortDirection) {
		console.log('Sorting by', columnKey, 'in', direction, 'order');
		
		displayRows = [];
		isLoading = true;

		try {
			const sortedTable = await arrowWorker.orderTableByColumn(table, columnKey, direction);

			virtualPaginationData.setData(sortedTable);

			getPage();

		} catch(error) {
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
	
	function setData(fields: Record<string, any>[]) {
        displayRows = fields;

        isLoading = false;
    }

	
	function updateQuery(newQuery){
		query = newQuery;
		firstLoad = true;
		isLoading = true;
		executeAndDisplayQuery();
	}


	function openEditQueryModal(){
		editQueryString = JSON.stringify(query, null, 2);
		editQueryModalOpen = true;
	}

	function closeEditQueryModal(save = true) {
		editQueryModalOpen = false;
		
		if (!save) {
			let confirmation = confirm('You have unsaved changes. Are you sure you want to close?');
			if (confirmation) {
				return;
			}
		}

		try {
			const parsedQuery = JSON.parse(editQueryString);
			updateQuery(parsedQuery);
		} catch (error) {
			addToast({
				type: 'error',
				message: `Failed to parse query JSON: ${error.message}`
			});
			return;
		}
	}


</script>	

<svelte:head>
	<title>Table explorer - Beacon Studio</title>
</svelte:head>


{#if editQueryModalOpen}
	<EditQueryJsonModal bind:editQueryString={editQueryString} onClose={closeEditQueryModal} />
{/if}

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Table explorer', href: '/visualisations/table-explorer' }
	]}
/>

<div class="page-container">
	<h1>Table explorer</h1>

	<Button onclick={openEditQueryModal}>
		Edit query JSON
		<FileJson2Icon size=1rem />
	</Button>

	<p>{table?.numRows ?? 0} rows selected.</p>

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

</div>
