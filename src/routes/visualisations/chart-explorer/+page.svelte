<script lang="ts">
	import * as ApacheArrow from 'apache-arrow';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Utils } from '@/utils';
	import { addToast } from '@/stores/toasts';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import GraphViewer from '@/components/graph-viewer/GraphViewer.svelte';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { resolveUrlQuery } from '@/stores/query-library';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '@/components/buttons/Button.svelte';

	let query: CompiledQuery | undefined = $state(undefined);
	/** Library record this page was opened from, so runs are attributed back to it. */
	let storedQueryId: string | undefined = $state(undefined);

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
		// Internal navigation uses `?q=<record id>`. A share link uses `?query=<gzip>`.
		const resolved = resolveUrlQuery(page.url);
		query = resolved.query ?? undefined;
		storedQueryId = resolved.storedQueryId;

		if (query) {
			// Show a cached result at once if the record already has one.
			entry = BeaconClient.peekQueryByKey(resolved.entry?.datasetKey) ?? null;
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
			entry = await BeaconClient.ensureQuery(query, storedQueryId);

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

	/**
	 * Send the current query to another page. The link uses `?q=<record id>`. The
	 * target page then reads the same library record and its cached result.
	 *
	 * If this page opened from a share link, it has no record. The link then
	 * carries the query as gzip.
	 */
	function handOff(resolvedPath: string) {
		if (storedQueryId) {
			goto(`${resolvedPath}?q=${encodeURIComponent(storedQueryId)}`);
			return;
		}

		const gzippedQuery = Utils.objectToGzipString(query);
		if (gzippedQuery) {
			goto(`${resolvedPath}?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleMapVisualise() {
		handOff(resolve('/visualisations/map-viewer'));
	}

	async function handleTableVisualise() {
		handOff(resolve('/visualisations/table-explorer'));
	}

	async function handleEditQuery() {
		if (!query) {
			goto(resolve('/queries/workbench'));
			return;
		}

		handOff(resolve('/queries/workbench'));
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

<div class="page-wrapper">
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

		<div class="viewer">
			<GraphViewer class="flex-1" {table} />
		</div>
	</div>
</div>

<style lang="scss">
	:global(.page-wrapper) {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
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
