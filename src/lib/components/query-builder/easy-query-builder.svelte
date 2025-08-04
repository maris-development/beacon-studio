<script lang="ts">
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import type { TableDefinition } from '@/beacon-api/models/misc';
	import { onMount } from 'svelte';
	import type { PresetColumn, PresetTableType } from '@/beacon-api/models/preset_table';

	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Parameter from './parameter.svelte';
	import { QueryBuilder } from '@/beacon-api/query';

	const output_formats = ['Parquet', 'CSV', 'JSON', 'Arrow', 'NetCDF'];

	let selected_output_format = $state(output_formats[0]);

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

	async function handleSubmit() {
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
					// ToDo: fix this to use the correct types
					builder.addFilter({
						for_query_parameter: parameter.alias,
						min: filter.min,
						max: filter.max
					});
				}
			}
		});

		builder.setFrom(selected_table_name);
		builder.setOutput({ format: 'parquet' });

		let compiled_query = builder.compile().unwrap();

		console.debug('Compiled Query:', compiled_query);

		await client.queryToDownload(compiled_query);
	}
</script>

<Label for="dataCollection">Selected Data Collection</Label>
<Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
	<Select.Trigger class="w-[180px]">
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
	<p class="text-sm text-gray-500">{selected_table.description}</p>
{/if}
<div>
	{#if selected_preset_table_type === null}
		<div class="mt-4 text-sm text-gray-500">
			<p>Select a table to see available query parameters.</p>
		</div>
	{:else}
		<div class="mt-4 grid gap-4">
			<Collapsible.Root class="space-y-2" open>
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">Data Columns</h4>
					<Collapsible.Trigger
						class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
					>
						<ChevronsUpDownIcon />
						<span class="sr-only">Toggle</span>
					</Collapsible.Trigger>
				</div>
				<Collapsible.Content class="space-y-2">
					<div class="grid grid-cols-2 gap-4">
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
					<h4 class="text-sm font-semibold">Metadata Columns</h4>
					<Collapsible.Trigger
						class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
					>
						<ChevronsUpDownIcon />
						<span class="sr-only">Toggle</span>
					</Collapsible.Trigger>
				</div>
				<Collapsible.Content class="space-y-2">
					<div class="grid grid-cols-2 gap-4">
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
	<Select.Trigger class="w-[180px]">
		{selected_output_format}
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			<Select.Label>Tables</Select.Label>
			{#each output_formats as format (format)}
				<Select.Item value={format} label={format}>
					{format}
				</Select.Item>
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>

<div class="flex flex-row gap-2">
	<Button onclick={handleSubmit}>Run Query</Button>
	<Button>Explore Data</Button>
	<Button>Visualize on Map</Button>
</div>
