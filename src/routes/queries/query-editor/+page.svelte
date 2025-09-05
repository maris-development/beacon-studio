<script lang="ts">
	import { onMount } from 'svelte';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';

	import { Button } from '$lib/components/ui/button/index.js';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import QueryEditor from '@/components/query-editor/QueryEditor.svelte';
	import { Utils } from '@/utils';
	import { goto } from '$app/navigation';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { addToast } from '@/stores/toasts';

	let sourceCode = $state(`{
		"query_parameters": [
			{
				"column_name": "TIME"
			},
			{
				"column_name": "DOXY"
			},
			{
				"column_name": "DEPH"
			},
			{
				"column_name": "LONGITUDE"
			},
			{
				"column_name": "LATITUDE"
			}
		],
		"filters": [
			{
				"for_query_parameter": "TIME",
				"min": "2019-11-01T00:00:00",
				"max": "2020-11-30T00:00:00"
			},
			{
				"for_query_parameter": "DEPH",
				"min": 0,
				"max": 5
			}
		],
		"output": {
			"format": "parquet"
		}
	}`);

	

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);
	});

	async function handleExecute() {
		try {
			const query: CompiledQuery = JSON.parse(sourceCode);
			const extension = BeaconClient.outputFormatToExtension(query);
			await client.queryToDownload(query, extension);

		} catch (error) {
			console.error('Error executing query:', error);
			addToast({
				message: `Error executing query: ${error.message}`,
				type: 'error'
			});
		}
	}

	async function handleInfo() {
		alert('Info action triggered (not implemented yet)');
	}

	async function handleAnalyze() {
		alert('Analyze action triggered (not implemented yet)');
	}

	async function handleMapVisualise() {
		const gzippedQuery = Utils.objectToGzipString(sourceCode);
		if (gzippedQuery) {
			goto(`/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleChartVisualise() {
		const gzippedQuery = Utils.objectToGzipString(sourceCode);
		if (gzippedQuery) {
			goto(`/visualisations/chart-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleTableVisualise() {
		const gzippedQuery = Utils.objectToGzipString(sourceCode);
		if (gzippedQuery) {
			goto(`/visualisations/table-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	onMount(() => {});
</script>

<div class="page-wrapper">
	<Cookiecrumb
		crumbs={[
			{ label: 'Queries', href: '/queries' },
			{ label: 'Query Editor', href: '/queries/query-editor' }
		]}
	></Cookiecrumb>
	<!-- Right: Shadcn Buttons -->

	<div class="page-container">
		<div class="actions">
			<div class="execute-query">
				<Button onclick={handleInfo}>
					Query Plan
					<TestTubeIcon />
				</Button>
				<Button onclick={handleAnalyze}>
					Analyze
					<SearchCodeIcon />
				</Button>
				<Button onclick={handleExecute}>
					Execute query
					<DownloadIcon />
				</Button>
			</div>

			<div class="view-query">
				<Button onclick={handleTableVisualise}>
					View as table
					<SheetIcon size="1rem" />
				</Button>

				<Button onclick={handleMapVisualise}>
					View on map
					<MapIcon size="1rem" />
				</Button>

				<Button onclick={handleChartVisualise}>
					View on chart
					<ChartPieIcon size="1rem" />
				</Button>
			</div>
		</div>

		<div class="editor">
			<QueryEditor bind:sourceCode height="100%" />
		</div>
	</div>
</div>

<style lang="scss">
	div.page-wrapper {
		height: 100%;
		display: flex;
		flex-direction: column;
		div.page-container {
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			gap: 0.5rem;

			div.actions {
				display: flex;
				flex-direction: row;
				gap: 0.5rem;
				justify-content: space-between;
			}

			div.editor {
				flex-grow: 1;
			}
		}
	}
</style>
