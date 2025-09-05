<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import { onMount } from 'svelte';
	import { Utils } from '@/utils';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery, QueryResponse, QueryResponseKind } from '@/beacon-api/types';
	import { Button } from '@/components/ui/button';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import GraphViewer from '@/components/graph-viewer/graph-viewer.svelte';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { goto } from '$app/navigation';

	let query: CompiledQuery | undefined = $state(undefined);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let table: ApacheArrow.Table | null = $state(null); // The table data returned from the query
	let table_kind: QueryResponseKind | null = $state(null);
	let queryDurationMs: number | null = $state(null);

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
			await executeQuery();
			prepareTableForDisplay();
		} catch (error) {
			addToast({
				type: 'error',
				message: `3 Failed to execute query: ${error.message}`
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
				message: `1 Failed to execute query: ${result.unwrapErr()}`
			});
		}

		const queryResponse: QueryResponse = result.unwrap();

		if (queryResponse.kind == 'error') {
			console.error(queryResponse.error_message);
			addToast({
				type: 'error',
				message: `2 Failed to execute query: ${queryResponse.error_message}`
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
			goto(`/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}


	async function handleTableVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if(gzippedQuery){
			goto(`/visualisations/table-explorer?query=${encodeURIComponent(gzippedQuery)}`);
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
				<FileJson2Icon size="1rem" />
			</Button>

			<span>or</span>

			<Button onclick={handleTableVisualise}>
				View as table
				<SheetIcon size="1rem" />
			</Button>

			<Button onclick={handleMapVisualise}>
				View on map
				<MapIcon size="1rem" />
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
