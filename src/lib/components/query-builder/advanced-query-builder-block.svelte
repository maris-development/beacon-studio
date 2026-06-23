<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as SearchSelect from '$lib/components/ui/search-select/index.js';
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
	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import QueryActionBar from '$lib/components/query-buttons/QueryActionBar.svelte';

	let {
		table_name,
		client
	}: {
		table_name: string;
		client: BeaconClient;
	} = $props();

	let searchInput;
	let searchQuery = $state('');
	let previous_table_name = '';
	let selected_output_format = $state(BeaconClient.output_formats['Parquet']);
	let fields: {
		name: string;
		type: DataType;
		ref?: ReturnType<typeof SearchSelect.Item>; //ReturnType<typeof SearchSelect.Item>;
	}[] = $state([]);

	let selectedFields: { name: string; type: DataType; selected_filters: SelectedFilterType[] }[] =
		$state([]);

	const firstVisibleItem = $derived(fields.find((item) => !(item.ref as {hidden: boolean})?.hidden));

	const firstVisibleMatchingItem = $derived.by(() => {
		const normalized = searchQuery.trim().toLowerCase();

		if (!normalized) {
			return firstVisibleItem;
		}

		return fields.find(
			(item) => item.name.toLowerCase().includes(normalized)
		);
	});


	$effect(() => {
		if (table_name && client && table_name !== previous_table_name) {
			console.log('Fetching schema for table:', table_name);

			client.getTableSchema(table_name).then((schema) => {
				previous_table_name = table_name;
				fields = schema.fields.map((field) => {
					return {
						name: field.name,
						type: field.data_type,
					};
				});
				selectedFields = [];
			});
		} else {
			fields = []; // Reset fields if no table or client is available
			selectedFields = []; // Reset selected fields
		}
	});

	let open = $state(false);

	async function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && searchInput) {
			event.preventDefault();
			event.stopPropagation();

			if (firstVisibleMatchingItem) {
				toggleColumnSelection(firstVisibleMatchingItem.name);
			}
		}
	}

	function toggleColumnSelection(field_name: string) {
		const index = fields.findIndex((f) => f.name === field_name);

		if (index !== -1) {
			const selectedIndex = selectedFields.findIndex((f) => f.name === field_name);
			
			if (selectedIndex === -1) {
				selectedFields.push({
					name: fields[index].name,
					type: fields[index].type,
					selected_filters: []
				});
			} else {
				selectedFields.splice(selectedIndex, 1);
			}
		} else {
			console.warn('Field not found:', field_name);
		}
	}

	function removeColumnSelection(field_name: string) {
		selectedFields = selectedFields.filter((f) => f.name !== field_name);
	}

	function compileQuery() {
		let builder = new QueryBuilder();

		for (const field of selectedFields) {
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

		return builder.compile();
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
			goto(resolve('/visualisations/map-viewer') + `?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}

	async function handleChartVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(
				resolve('/visualisations/chart-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`
			);
		}
	}

	async function handleTableVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(
				resolve('/visualisations/table-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`
			);
		}
	}
</script>

<div id="advanced-query-builder">
	<div class="flex flex-row items-center justify-between">
		<h3>Query Parameters</h3>
		<Button variant="outline" onclick={() => (open = true)}>
			Add Parameter
			<PlusIcon />
		</Button>
	</div>

	<Dialog.Root bind:open>
		<Dialog.Content class="search-columns-dialog" showCloseButton={false}>
			<Dialog.Header class="sr-only">
				<Dialog.Title>Add Query Parameter</Dialog.Title>
				<Dialog.Description>Search and select a column to add it to the query.</Dialog.Description>
			</Dialog.Header>

			<SearchSelect.Root bind:query={searchQuery}>
				<SearchSelect.Input
					placeholder="Type a column or search..."
					bind:this={searchInput}
					onKeydown={handleKeydown}
				/>
				<SearchSelect.List>
					<SearchSelect.Empty>
						No columns found for table <span class="search-columns-empty-table">{table_name}</span>.
					</SearchSelect.Empty>

					<SearchSelect.Group heading={`Available Columns (${fields.length})`}>
						{#each fields as field (field.name)}
							<SearchSelect.Item
								value={field.name}
								class="search-columns-item"
								onSelect={() => {
									toggleColumnSelection(field.name);
								}}
								bind:this={field.ref}
							>
								<span class="search-columns-item-name">{field.name}</span>
								<span class="search-columns-item-details">{Utils.toString(field.type)}</span>
								{#if selectedFields.find((f) => f.name === field.name)}
									<CheckIcon class="search-columns-item-icon" />
								{/if}
							</SearchSelect.Item>
						{/each}
					</SearchSelect.Group>
				</SearchSelect.List>
			</SearchSelect.Root>
		</Dialog.Content>
	</Dialog.Root>

	<div class="flex flex-col gap-2">
		<div class="grid grid-cols-1 gap-2 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
			{#each Utils.range(0, selectedFields.length) as index (index)}
				<AdvancedParameter bind:column={selectedFields[index]} remove_column={removeColumnSelection} />
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
				{#each Object.entries(BeaconClient.output_formats) as [label, value], index (index)}
					<Select.Item {label} {value} />
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>

	<hr />

	<QueryActionBar
		onExecute={handleSubmit}
		onViewTable={handleTableVisualise}
		onViewMap={handleMapVisualise}
		onViewChart={handleChartVisualise}
		{compileQuery}
	/>
</div>

<style lang="scss">
	#advanced-query-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 1rem;
	}

	:global(.search-columns-dialog) {
		padding: 0;
		max-width: 42rem;
	}

	.search-columns-empty-table {
		font-weight: 600;
	}

	:global(.search-columns-item) {
		display: flex;
	}

	.search-columns-item-name {
		font-weight: 600;
		flex-grow: 1;
	}

	:global(.search-columns-item-icon) {
		width: 1rem;
		height: 1rem;
	}
</style>
