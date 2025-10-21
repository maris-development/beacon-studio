<script lang="ts">
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { onMount } from 'svelte';
	import type { PresetColumn } from '@/beacon-api/types';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Parameter from './parameter.svelte';
	import { QueryBuilder } from '@/beacon-api/query';
	import type { CompiledQuery, OutputFormat, TableDefinition } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import type { QueryFilterValue } from './filters/filter.svelte';
	import PageLoadingOverlay from '../loading-overlay/page-loading-overlay.svelte';
	import { Checkbox } from '../ui/checkbox';

	let { selected_table_name }: { selected_table_name: string } = $props();

	let isLoading: boolean = $state(false);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let selected_output_format: string = $state(BeaconClient.output_formats['Parquet']);
	let selected_table: TableDefinition | null = $derived(
		await fetchPresetTableType(selected_table_name)
	);
	let data_parameters: {
		selected: boolean;
		column: PresetColumn;
		filter_value: QueryFilterValue;
	}[] = $state([]);

	let metadata_parameters: {
		selected: boolean;
		column: PresetColumn;
		filter_value: QueryFilterValue;
	}[] = $state([]);

	let include_all_metadata_optional: boolean = $state(false);

	$effect(() => {
		if (!selected_table) {
			data_parameters = [];
			metadata_parameters = [];
			return;
		}

		let table_type = selected_table.table_type;
		if ('preset' in table_type) {
			// It's a preset table type
			let data_columns = table_type.preset.data_columns;
			data_parameters = data_columns.map((column) => ({
				selected: false,
				column,
				filter_value: null
			}));

			let metadata_columns = table_type.preset.metadata_columns;
			metadata_parameters = metadata_columns.map((column) => ({
				selected: false,
				column,
				filter_value: null
			}));
		}
	});

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);
	});

	async function fetchPresetTableType(table_name: string): Promise<TableDefinition | null> {
		if (!table_name || !client) {
			return null;
		}

		let preset_table_types = await client.getPresetTables();

		// Find the selected table type
		let selected_table_type = preset_table_types.find((t) => t.table_name === table_name) || null;

		console.log('Selected table type:', selected_table_type);

		return selected_table_type;
	}

	function setSelectAllMetadataOptional(value: boolean) {
		metadata_parameters = metadata_parameters.map((param) => ({
			...param,
			selected: value
		}));
	}

	function compileQuery(): CompiledQuery {
		let builder = new QueryBuilder();

		// get all the selected parameters
		let selected_data_parameters = data_parameters.filter((p) => p.selected).map((p) => p);
		let selected_metadata_parameters = metadata_parameters.filter((p) => p.selected).map((p) => p);

		let all_parameters = [...selected_data_parameters, ...selected_metadata_parameters];

		all_parameters.forEach((parameter) => {
			builder.addSelect({ column: parameter.column.alias, alias: null });

			if (parameter.filter_value) {
				let filter = parameter.filter_value;
				if ('min' in filter && 'max' in filter) {
					// ToDo: fix this to use the correct types
					builder.addFilter({
						for_query_parameter: parameter.column.alias,
						min: filter.min as string | number,
						max: filter.max as string | number
					});
				} else if ('options' in filter) {
					let or_filters = { or: [] };

					for (let option of filter.options) {
						or_filters.or.push({ eq: option, for_query_parameter: parameter.column.alias });
					}
					if (or_filters.or.length > 0) {
						builder.addFilter(or_filters);
					}
				}
			}
		});

		builder.setFrom(selected_table_name);
		builder.setOutput({ format: selected_output_format as OutputFormat });

		return builder.compile();;
	}

	function compileAndGZipQuery(): string | undefined {
		try {
			let compiledQuery = compileQuery();
			return Utils.objectToGzipString(compiledQuery);
		} catch (error) {
			console.error('Error compiling and gzipping query:', error);
			addToast({
				message: `Error compiling query: ${error.message}`,
				type: 'error'
			});
		}
	}

	async function handleSubmit() {
		let compiledQuery: CompiledQuery;

		try {
			compiledQuery = compileQuery();
		} catch (error) {
			console.error('Error compiling query:', error);
			addToast({
				message: `Error compiling query: ${error.message}`,
				type: 'error'
			});
			return;
		}

		if (compiledQuery) {
			isLoading = true;
			await client.queryToDownload(
				compiledQuery,
				BeaconClient.outputFormatToExtension(compiledQuery)
			);
			await Utils.sleep(500);
			isLoading = false;
		}
	}

	async function handleMapVisualise() {
		isLoading = true;
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(`${base}/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleChartVisualise() {
		isLoading = true;
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(`${base}/visualisations/chart-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleTableVisualise() {
		isLoading = true;
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(`${base}/visualisations/table-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleCopyQuery() {

		let compiledQuery: CompiledQuery;

		try {
			compiledQuery = compileQuery();
		} catch (error) {
			console.error('Error compiling query:', error);
			addToast({
				message: `Error compiling query: ${error.message}`,
				type: 'error'
			});
			return;
		} 

		let queryJson = JSON.stringify(compiledQuery, null, 2);

		addToast({
			message: 'Query JSON copied to clipboard',
			type: 'success'
		});

		Utils.copyToClipboard(queryJson);
	}
</script>

{#if isLoading}
	<PageLoadingOverlay text="Executing query..." />
{/if}

<div id="easy-query-builder">
	{#if selected_table}
		<h4>Collection Description</h4>
		{#if selected_table.description}
			<p>Selected table: <b>{selected_table_name}</b></p>
			<p>{selected_table.description}</p>
		{:else}
			<div class="text-gray-500">
				<p>No description available.</p>
			</div>
		{/if}
	{/if}

	<div>
		{#if selected_table === null}
			<div class=" text-gray-500">
				<p>Select a table to see available query parameters.</p>
			</div>
		{:else}
			<div class="grid gap-4">
				<Collapsible.Root class="space-y-2" open>
					<div class="flex items-center justify-between">
						<h4 class=" font-semibold">Select data columns</h4>
						<Collapsible.Trigger
							class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
						>
							<ChevronsUpDownIcon />
							<span class="sr-only">Toggle</span>
						</Collapsible.Trigger>
					</div>
					<Collapsible.Content class="space-y-2">
						<div class="parameter-grid">
							{#each data_parameters as _, i}
								<Parameter
									bind:column={data_parameters[i].column}
									bind:is_selected={data_parameters[i].selected}
									bind:filter_value={data_parameters[i].filter_value}
								/>
							{/each}
							{#if data_parameters.length === 0}
								<div class="text-gray-500">
									<p>No data columns available.</p>
								</div>
							{/if}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>

				<Collapsible.Root class="space-y-2" open>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<h4 class="font-semibold">Select metadata columns</h4>
							<div class="flex items-center gap-2">
								<p class=" text-gray-500">Include all metadata optional</p>
								<Checkbox
									bind:checked={include_all_metadata_optional}
									onclick={() => setSelectAllMetadataOptional(!include_all_metadata_optional)}
								/>
							</div>
						</div>

						<Collapsible.Trigger
							class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
						>
							<ChevronsUpDownIcon />
							<span class="sr-only">Toggle</span>
						</Collapsible.Trigger>
					</div>
					<Collapsible.Content class="space-y-2">
						<div class="parameter-grid">
							{#each metadata_parameters as _, i}
								<Parameter
									bind:column={metadata_parameters[i].column}
									bind:is_selected={metadata_parameters[i].selected}
									bind:filter_value={metadata_parameters[i].filter_value}
								/>
							{/each}
							{#if metadata_parameters.length === 0}
								<div class="text-gray-500">
									<p>No metadata columns available.</p>
								</div>
							{/if}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		{/if}
	</div>

	<h4>Select output format</h4>
	<Label for="outputFormat">Output format</Label>

	<Select.Root type="single" name="dataCollection" bind:value={selected_output_format}>
		<Select.Trigger>
			{selected_output_format}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				<Select.Label>Tables</Select.Label>
				{#each Object.entries(BeaconClient.output_formats) as [label, value]}
					<Select.Item {label} {value} />
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>

	<hr />

	<div class="flex flex-row justify-between gap-2">
		<div class="flex flex-row gap-2">
			<Button onclick={handleSubmit}>
				Execute query
				<DownloadIcon />
			</Button>

			<Button onclick={handleCopyQuery}>
				Copy query JSON
				<FileJson2Icon />
			</Button>
		</div>

		<div class="flex flex-row gap-2">
			<Button onclick={handleTableVisualise}>
				View as table
				<SheetIcon />
			</Button>

			<Button onclick={handleMapVisualise}>
				View on map
				<MapIcon />
			</Button>

			<Button onclick={handleChartVisualise}>
				View on chart
				<ChartPieIcon />
			</Button>
		</div>
	</div>

	<!-- <p>Or use the options below to visualise the data</p> -->
</div>

<style lang="scss">
	#easy-query-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		.parameter-grid {
			display: grid;
			gap: 1rem;
			grid-template-columns: 1fr 1fr;

			@media (max-width: 960px) {
				grid-template-columns: 1fr;
			}
		}
	}
</style>
