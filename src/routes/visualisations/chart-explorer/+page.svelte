<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import { onMount } from 'svelte';
	import { Utils } from '@/utils';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient, NoDataInResponseError } from '@/beacon-api/client';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery, ParquetQueryResponse} from '@/beacon-api/types';
	import { Button } from '@/components/ui/button';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import GraphViewer from '@/components/graph-viewer/graph-viewer.svelte';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { goto } from '$app/navigation';
  	import { resolve } from '$app/paths';

	let query: CompiledQuery | undefined = $state(undefined);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	let queryResponse: ParquetQueryResponse | null = $state(null);
	let table: ApacheArrow.Table | null = $derived(queryResponse?.arrow_table); 
	let queryDurationMs: number | null = $derived(queryResponse?.duration ?? 0);

	let totalRows: number = $state(0);
	let isLoading = $state(true);
	let firstLoad = $state(true);

	// Modal for editing query
	let editQueryModalOpen = $state(false);
	let editQueryString = $state('');

	let noQueryAvailableModalOpen = $state(false);

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		getUrlSuppliedQuery();
	});

	function getUrlSuppliedQuery() {
		query = Utils.getUrlSuppliedQuery();

		if (query) {
			query.output.format = 'parquet'; // Ensure the output format is set to parquet

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

			queryResponse = await client.query(query);

			prepareTableForDisplay();

		} catch (error) {

			if(error instanceof NoDataInResponseError){
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}

			addToast({
				type: 'error',
				message: `3 Failed to execute query: ${error.message}`
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
	}

	function updateQuery(newQuery) {
		query = newQuery;
		firstLoad = true;
		isLoading = true;
		executeAndDisplayQuery();
	}

	function openEditQueryModal() {
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

	async function handleMapVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if(gzippedQuery){
			goto(resolve('/visualisations/map-viewer') + `?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}


	async function handleTableVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if(gzippedQuery){
			goto(resolve('/visualisations/table-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}
</script>

<svelte:head>
	<title>Chart explorer - Beacon Studio</title>
</svelte:head>

{#if editQueryModalOpen}
	<EditQueryJsonModal bind:editQueryString onClose={closeEditQueryModal} />
{/if}

{#if noQueryAvailableModalOpen}
	<NoQueryAvailableModal onCancel={() => noQueryAvailableModalOpen = false} openQueryJsonEditor={() => { noQueryAvailableModalOpen = false; openEditQueryModal(); }} />
{/if}

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Chart explorer', href: '/visualisations/chart-explorer' }
	]}
/>

<div class="page-container">
	<div class="header">
		<h1>Chart explorer</h1>

		<div class="buttons-header">
			<Button onclick={openEditQueryModal}>
				Edit query JSON
				<FileJson2Icon />
			</Button>

			<span>or</span>

			<Button onclick={handleTableVisualise}>
				View as table
				<SheetIcon />
			</Button>

			<Button onclick={handleMapVisualise}>
				View on map
				<MapIcon />
			</Button>

		</div>

		<p>
			{table?.numRows ?? 0} rows selected in {Utils.formatSecondsToReadableTime(
				queryDurationMs / 1000
			)}.
		</p>

		<p>
			Below you can find a <a href="https://perspective.finos.org/" target="blank" rel="noopener noreferrer">Perspective viewer</a> that allows you to explore the query results interactively.

			By default it opens a table, but you can adjust it's behaviour by modifying the viewer's configuration options using the 'Configure' button in the top right.
		</p>
	</div>

	<div class="viewer">
		<GraphViewer class="flex-1" {table} />
	</div>
</div>

<style lang="scss">
	.page-container {
		flex-grow: 1;
		display: flex;
		flex-direction: column;

		.viewer {
			flex-grow: 1;
			display: flex;
			flex-direction: column;
		}
	}
</style>
