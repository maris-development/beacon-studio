<script lang="ts">
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { BeaconClient } from '@/beacon-api/client';
	import type { CompiledQuery, DataType, OutputFormat } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import AdvancedParameter from './advanced-parameter.svelte';
	import type { SelectedFilterType } from './add-advanced-filter.svelte';
	import { QueryBuilder } from '@/beacon-api/query';

	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import FileJson2Icon from '@lucide/svelte/icons/file-json-2';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	let {
		table_name,
		client
	}: {
		table_name: string;
		client: BeaconClient;
	} = $props();

	let previous_table_name = '';
	let selected_output_format = $state(BeaconClient.output_formats['Parquet']);
	let fields: { name: string; type: DataType }[] = $state([]);
	let selected_fields: { name: string; type: DataType; selected_filters: SelectedFilterType[] }[] =
		$state([]);

	function remove_selected_field(field_name: string) {
		selected_fields = selected_fields.filter((f) => f.name !== field_name);
	}

	$effect(() => {
		if (table_name && client && table_name !== previous_table_name) {
			console.log('Fetching schema for table:', table_name);
			client.getTableSchema(table_name).then((schema) => {
				previous_table_name = table_name;
				fields = schema.fields.map((field) => {
					return {
						name: field.name,
						type: field.data_type
					};
				});
				selected_fields = [];
			});
		} else {
			fields = []; // Reset fields if no table or client is available
			selected_fields = []; // Reset selected fields
		}
	});

	let open = $state(false);

	function select_deselect_column(field_name: string) {
		const index = selected_fields.findIndex((f) => f.name === field_name);
		if (index === -1) {
			const field = fields.find((f) => f.name === field_name);
			if (field) {
				selected_fields.push({ name: field.name, type: field.type, selected_filters: [] });
			}
		} else {
			selected_fields.splice(index, 1);
		}
	}

	function compileQuery() {
		let builder = new QueryBuilder();

		for (const field of selected_fields) {
			builder.addSelect({ column: field.name, alias: null });
			for (const filter of field.selected_filters) {
				let bfilter = Utils.parameterFilterTypeToFilter(filter.filter_value, field.name);
				if (bfilter) {
					builder.addFilter(bfilter);
				}
			}
		}

		builder.setFrom(table_name);
		builder.setOutput({ format: selected_output_format as OutputFormat });

		let compiledQuery = builder.compile();

		if (compiledQuery.isErr()) {
			throw new Error('Failed to compile query: ' + compiledQuery.unwrapErr());
		}

		console.debug('Compiled Query:', compiledQuery);

		return compiledQuery.unwrap();
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
			await client.queryToDownload(
				compiledQuery,
				BeaconClient.outputFormatToExtension(compiledQuery)
			);
		}
	}

	async function handleMapVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(`${base}/visualisations/map-viewer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleChartVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(`${base}/visualisations/chart-explorer?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleTableVisualise() {
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

<!-- <svelte:document onkeydown={handleKeydown} /> -->
<div id="advanced-query-builder">
	<div class="flex flex-row items-center justify-between">
		<h3>Query Parameters</h3>
		<Button variant="outline" onclick={() => (open = true)}>
			Add Parameter
			<PlusIcon />
		</Button>
	</div>

	<Command.Dialog bind:open>
		<Command.Input placeholder="Type a column or search..." />
		<Command.List>
			<Command.Empty>No columns found.</Command.Empty>
			<Command.Group heading="Available Columns">
				{#each fields as field (field.name)}
					<Command.Item
						value={field.name}
						onclick={() => {
							console.log('Selected field:', field.name);
							select_deselect_column(field.name);
							console.log('Selected fields:', selected_fields);
						}}
					>
						<span class="font-semibold">{field.name}</span>
						<span class="text-muted-foreground text-sm">{field.type}</span>
						<span class="absolute right-2 flex size-3.5 items-center justify-center">
							{#if selected_fields.find((f) => f.name === field.name)}
								<CheckIcon class="size-4" />
							{/if}
						</span>
					</Command.Item>
				{/each}
			</Command.Group>
			<Command.Separator />
		</Command.List>
	</Command.Dialog>

	<div class="flex flex-col gap-2">
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
			{#each selected_fields as field (field.name)}
				<AdvancedParameter column={field} remove_column={remove_selected_field} />
			{/each}
		</div>
	</div>

	<Label for="outputFormat">Selected Output Format</Label>
	<Select.Root type="single" name="outputFormat" bind:value={selected_output_format}>
		<Select.Trigger class="w-[180px]">
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
</div>

<style lang="scss">
	#advanced-query-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}
</style>
