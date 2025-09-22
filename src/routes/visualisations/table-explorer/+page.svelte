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
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import MapIcon from '@lucide/svelte/icons/map';

	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import { ArrowProcessingWorkerManager } from '@/workers/ArrowProcessingWorkerManager';
	import type { Column, SortDirection } from '@/util-types';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { goto } from '$app/navigation';
  	import { base } from '$app/paths';

	const arrowWorker: ArrowProcessingWorkerManager = new ArrowProcessingWorkerManager();

	let query: CompiledQuery | undefined = $state(undefined);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let table: ApacheArrow.Table | null = $state(null); // The table data returned from the query
	let table_kind: QueryResponseKind | null = $state(null);
    let queryDurationMs: number | null = $state(null);


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

	let noQueryAvailableModalOpen = $state(false);

	$inspect(query);


	onMount(async () => {
		
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		getUrlSuppliedQuery();
	});

	async function getUrlSuppliedQuery(){
		query = Utils.getUrlSuppliedQuery();

		if (query) {
			// Use the decoded query for your logic
			executeAndDisplayQuery();

		} else {
			// TODO: Ask user for query json
			editQueryString = '{ "message": "Enter a JSON query" }';
			noQueryAvailableModalOpen = true;

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


		const startTime = performance.now();
		const result = await client.query(query);
        const endTime = performance.now();
        
        queryDurationMs = endTime - startTime;

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

		// console.log('Query result:', table);
			
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
			sortable: field.typeId != ApacheArrow.Type.Struct // Disable sorting for geometry columns
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

	async function handleChartVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if(gzippedQuery){
			goto(`${base}/visualisations/chart-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleMapVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if(gzippedQuery){
			goto(`${base}/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}


</script>	

<svelte:head>
	<title>Table explorer - Beacon Studio</title>
</svelte:head>


{#if editQueryModalOpen}
	<EditQueryJsonModal bind:editQueryString={editQueryString} onClose={closeEditQueryModal} />
{/if}

{#if noQueryAvailableModalOpen}
	<NoQueryAvailableModal onCancel={() => noQueryAvailableModalOpen = false} openQueryJsonEditor={() => { noQueryAvailableModalOpen = false; openEditQueryModal(); }} />
{/if}


<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Table explorer', href: '/visualisations/table-explorer' }
	]}
/>

<div class="page-container">
	<h1>Table explorer</h1>

	<div class="buttons-header">
		<Button onclick={openEditQueryModal}>
			Edit query JSON
			<FileJson2Icon size=1rem />
		</Button>
		
		<span>or</span>

		<Button onclick={handleChartVisualise}>
			View on chart
			<ChartPieIcon />
		</Button>

		<Button onclick={handleMapVisualise}>
			View on map
			<MapIcon />
		</Button>
	</div>

	<p>
		{table?.numRows ?? 0} rows selected in {Utils.formatSecondsToReadableTime(queryDurationMs / 1000)}.
	</p>

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
