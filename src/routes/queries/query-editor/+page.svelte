<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import QueryEditor from '@/components/query-editor/QueryTextEditor.svelte';
	import QueryActionBar from '$lib/components/query-builder/QueryActionBar.svelte';
	import { Utils } from '@/utils';
	import { goto } from '$app/navigation';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import type { CompiledQuery } from '@/beacon-api/types';
	import { addToast } from '@/stores/toasts';
	import { resolveUrlQuery } from '@/stores/query-library';
	import { resolve } from '$app/paths';

	type RawQueryParameter = {
		column?: string;
		column_name?: string;
		alias?: string | null;
	};

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

		// Load a query from a deep-link. `?q=<record id>` comes from a page such as
		// the query history. `?query=<gzip>` comes from a share link.
		const { query: suppliedQuery } = resolveUrlQuery(page.url);

		if (suppliedQuery) {
			sourceCode = JSON.stringify(suppliedQuery, null, 2);
		}
	});

	async function handleExecute() {
		try {
			const query = parseSourceCodeToCompiledQuery();

			if (!query) {
				return;
			}

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

	/**
	 * Send the query to a visualiser. This page is the only source of a query with
	 * no library record, because the user types it here. Therefore the link uses
	 * the gzip form `?query=`, and not `?q=<id>`. A target page accepts both forms.
	 */
	function handOff(resolvedPath: string) {
		const query = parseSourceCodeToCompiledQuery();
		if (!query) {
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

	async function handleChartVisualise() {
		handOff(resolve('/visualisations/chart-explorer'));
	}

	async function handleTableVisualise() {
		handOff(resolve('/visualisations/table-explorer'));
	}

	function parseSourceCodeToCompiledQuery(): CompiledQuery | undefined {
		try {
			const parsed = JSON.parse(sourceCode) as Record<string, unknown> & {
				query_parameters?: RawQueryParameter[];
			};

			const normalizedQueryParameters = (parsed.query_parameters ?? []).map((parameter) => {
				const column = parameter.column ?? parameter.column_name;

				if (!column) {
					throw new Error('Every query parameter must include column or column_name.');
				}

				return {
					column,
					alias: parameter.alias ?? null
				};
			});

			return {
				...parsed,
				query_parameters: normalizedQueryParameters
			} as CompiledQuery;
		} catch (error) {
			addToast({
				message: `Failed to parse query JSON: ${error.message}`,
				type: 'error'
			});
		}
	}

	onMount(() => {});
</script>

<h1 class="sr-only">Query editor</h1>
<div class="page-wrapper">
	<Cookiecrumb
		crumbs={[
			{ label: 'Queries', href: resolve('/queries') },
			{ label: 'Query Editor', href: resolve('/queries/query-editor') }
		]}
	/>
	<!-- Right: Shadcn Buttons -->

	<div class="page-container">
		<QueryActionBar
			onQueryPlan={handleInfo}
			onAnalyze={handleAnalyze}
			onExecute={handleExecute}
			onViewTable={handleTableVisualise}
			onViewMap={handleMapVisualise}
			onViewChart={handleChartVisualise}
		/>

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

			div.editor {
				flex-grow: 1;
			}
		}
	}
</style>
