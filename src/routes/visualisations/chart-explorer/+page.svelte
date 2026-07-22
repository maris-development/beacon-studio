<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { onMount } from 'svelte';
	import { Utils } from '@/utils';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { queryStore, type DatasetEntry } from '@/stores/query-store.svelte';
	import { Button } from '@/components/ui/button';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import GraphViewer from '@/components/graph-viewer/GraphViewer.svelte';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let query: CompiledQuery | undefined = $state(undefined);

	let entry = $state.raw<DatasetEntry | null>(null);
	let table: ApacheArrow.Table | null = $derived(entry?.table ?? null);
	let queryDurationMs: number | null = $derived(entry?.duration ?? 0);

	let isLoading = $state(true);
	let firstLoad = $state(true);

	// Modal for editing query
	let editQueryModalOpen = $state(false);
	let editQueryString = $state('');

	let noQueryAvailableModalOpen = $state(false);

	onMount(() => {
		getUrlSuppliedQuery();
	});

	function getUrlSuppliedQuery() {
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
			entry = await queryStore.ensure(query);

			if (entry.rowCount === 0) {
				isLoading = false;
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}

			prepareTableForDisplay();
		} catch (error) {
			isLoading = false;
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

		isLoading = false;
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
		if (gzippedQuery) {
			goto(resolve('/visualisations/map-viewer') + `?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleTableVisualise() {
		const gzippedQuery = Utils.objectToGzipString(query);
		if (gzippedQuery) {
			goto(
				resolve('/visualisations/table-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`
			);
		}
	}

	async function handleEditQuery() {
		if (!query) {
			addToast({
				type: 'error',
				message: 'No query available to edit.'
			});
			return;
		}

		const gzippedQuery = Utils.objectToGzipString(query);
		if (gzippedQuery) {
			goto(resolve('/queries/query-builder') + `?query=${encodeURIComponent(gzippedQuery)}`);
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
	<NoQueryAvailableModal
		onCancel={() => (noQueryAvailableModalOpen = false)}
		openQueryJsonEditor={() => {
			noQueryAvailableModalOpen = false;
			openEditQueryModal();
		}}
	/>
{/if}

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Chart explorer', href: '/visualisations/chart-explorer' }
	]}
/>

<div class="page-container">
	<div class="header">
		<h2>Chart explorer</h2>

		<div class="buttons-header">
			<Button onclick={handleEditQuery}>
				Edit query
				<PencilIcon />
			</Button>

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

		<!-- turn the loading into a func? -->
		<p>
			{#if table?.numRows == null}
				Loading rows…
			{:else}
				{table.numRows} rows selected in {Utils.formatSecondsToReadableTime(queryDurationMs / 1000)}.
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
