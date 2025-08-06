<script lang="ts">
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { onMount } from 'svelte';
	import type { PresetColumn, PresetTableType } from '@/beacon-api/types';

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

	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';




	const output_formats: Record<string, string> = {
		Parquet: 'parquet',
		CSV: 'csv',
		Arrow: 'arrow',
		NetCDF: 'netcdf'
	};

	const output_format_extensions = {
		parquet: 'parquet',
		csv: 'csv',
		arrow: 'ipc',
		netcdf: 'nc'
	};

	let selected_output_format: string = $state(output_formats['Parquet']);

	let easy_tables = $state<Array<TableDefinition>>([]);
	let selected_table_name = $state('');

	const selected_table = $derived.by(() => {
		return easy_tables.find((t) => t.table_name === selected_table_name) || null;
	});

	let selected_preset_table_type: PresetTableType = $derived.by(() => {
		let easy_table_type = selected_table?.table_type;
		if (easy_table_type === undefined || easy_table_type === null) {
			return null;
		}
		if ('preset' in easy_table_type) {
			// ‣ here TS knows table: { preset: PresetTableType }
			console.log('Selected Preset Table Type:', easy_table_type.preset);
			return easy_table_type.preset;
		}
		// extract preset table type from the easy_table_type
		return null;
	});

	let data_parameters: { selected: boolean; column: PresetColumn }[] = $state([]);
	let metadata_parameters: { selected: boolean; column: PresetColumn }[] = $state([]);

	$effect(() => {
		if (!selected_preset_table_type) return;

		data_parameters = selected_preset_table_type.data_columns.map((column) => ({
			selected: false,
			column
		}));

		metadata_parameters = selected_preset_table_type.metadata_columns.map((column) => ({
			selected: false,
			column
		}));
	});

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		let preset_tables = await client.getPresetTables();

		easy_tables = preset_tables;

		// By default, select the first table if available
		if (easy_tables.length > 0) {
			selected_table_name = easy_tables[0].table_name;
		}
	});

	function compileQuery(): null|CompiledQuery {
		let builder = new QueryBuilder();

		// get all the selected parameters
		let selected_data_parameters = data_parameters.filter((p) => p.selected).map((p) => p.column);
		let selected_metadata_parameters = metadata_parameters
			.filter((p) => p.selected)
			.map((p) => p.column);

		let all_parameters = [...selected_data_parameters, ...selected_metadata_parameters];
		all_parameters.forEach((parameter) => {
			builder.addSelect({ column: parameter.alias, alias: null });

			if (parameter.filter) {
				let filter = parameter.filter;
				if ('min' in filter && 'max' in filter) {
					builder.addFilter({
						for_query_parameter: parameter.alias,
						min: filter.min as string | number,
						max: filter.max as string | number
					});
				}
			}
		});

		builder.setFrom(selected_table_name);
		builder.setOutput({ format: selected_output_format as OutputFormat });

		let compiled_query = builder.compile();

		if(compiled_query.isErr()){
			let errorMessage = compiled_query.unwrapErr();
			console.error('Error compiling query:', errorMessage);
			addToast({
				message: `Error compiling query: ${errorMessage}`,
				type: 'error'
			})
			return null;
		}

		console.debug('Compiled Query:', compiled_query);

		return compiled_query.unwrap();
	}

	async function handleSubmit() {
		let compiled_query = compileQuery();

		await client.queryToDownload(compiled_query, output_format_extensions[selected_output_format]);
	}

	async function handleMapVisualise(){
		let compiled_query = compileQuery();

		if(!compiled_query) return;

		const gzippedQuery = Utils.objectToGzipString(compiled_query);

		goto(`/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
	}

	async function handleTableVisualise(){
		let compiled_query = compileQuery();

		if(!compiled_query) return;

		const gzippedQuery = Utils.objectToGzipString(compiled_query);
		
		goto(`/visualisations/table-explorer?query=${encodeURIComponent(gzippedQuery)}`);
	}

	async function handleCopyQuery(){
		let compiled_query = compileQuery();

		if(!compiled_query) return;

		let query_json = JSON.stringify(compiled_query, null, 2);

		addToast({
			message: 'Query JSON copied to clipboard',
			type: 'success',
		});

		Utils.copyToClipboard(query_json);
	}
</script>

<div id="easy-query-builder"  >
	<Label for="dataCollection">Selected Data Collection</Label>
	<Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
		<Select.Trigger>
			{selected_table?.table_name ?? 'Select a table'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				<Select.Label>Tables</Select.Label>
				{#each easy_tables as table (table.table_name)}
					<Select.Item value={table.table_name} label={table.table_name}>
						{table.table_name}
					</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	{#if selected_table}
		<h3>Collection Description</h3>
		<p>{selected_table.description ?? 'No description available.'}</p>
	{/if}
	<div>
		{#if selected_preset_table_type === null}
			<div class="mt-4  text-gray-500">
				<p>Select a table to see available query parameters.</p>
			</div>
		{:else}
			<div class="mt-4 grid gap-4">
				<Collapsible.Root class="space-y-2" open>
					<div class="flex items-center justify-between">
						<h3 class=" font-semibold">Select data columns</h3>
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
								/>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>

				<Collapsible.Root class="space-y-2">
					<div class="flex items-center justify-between">
						<h3 class=" font-semibold">Select metadata columns</h3>
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
								/>
							{/each}
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			</div>
		{/if}
	</div>
	<Label for="dataCollection">Selected Output Format</Label>
	<Select.Root type="single" name="dataCollection" bind:value={selected_output_format}>
		<Select.Trigger>
			{selected_output_format}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				<Select.Label>Tables</Select.Label>
				{#each Object.entries(output_formats) as [label, value]}
					<Select.Item {label} {value}/>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>

	<div class="flex flex-row gap-2">
		<Button onclick={handleSubmit}>
			Run query
			<DownloadIcon size=1rem />

		</Button>
		<Button onclick={handleTableVisualise}>
			Explore data
			<SheetIcon size=1rem />
		</Button>
		<Button onclick={handleMapVisualise}>
			Visualize on map
			<MapIcon size=1rem />
		</Button>
		<Button onclick={handleCopyQuery}>
			Copy query JSON
			<FileJson2Icon size=1rem />
		</Button>
	</div>
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