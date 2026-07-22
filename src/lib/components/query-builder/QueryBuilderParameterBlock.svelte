<script lang="ts">
	/**
	 * QueryBuilderParametrBlock.svelte
	 * Author: Jasper van der Barg
	 * Description: Query Builder Parameter Block Component
	*/


	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as SearchSelect from '$lib/components/ui/search-select/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { BeaconClient } from '@/beacon-api/client';
	import type { CompiledQuery, DataType, Filter, OutputFormat } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import AdvancedParameter from './AdvancedParameter.svelte';
	import type { SelectedFilterType } from './AddAdvancedFilter.svelte';
	import { QueryBuilder } from '@/beacon-api/query';
	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	// import QueryActionBar from '$lib/components/query-buttons/QueryActionBar.svelte';
	import type { QuerySelectionStatus } from './QuerySelectionStatus';
    import type { QuerySelectionActions, ActionCallback } from './QuerySelectionActions';
	import { getCachedSchema } from '@/beacon-api/metadata-cache';
	import { type QueryDraft } from './QueryDraft';


	let {
		table_name,
		client,
		initialDraft = null,
		pendingSeed = null,
		onDraftChange,
		status = $bindable<QuerySelectionStatus>({
			dataTable: '',
			columns: 0,
			filters: 0,
			selection: 0,
		}),
        actions = $bindable<QuerySelectionActions>({
			compileQuery: compileQuery,
            downloadData: handleSubmit,
            visualiseTable: handleTableVisualise,
            visualiseChart: handleChartVisualise,
            visualiseMap: handleMapVisualise,
            saveQuery: undefined,
            savedQueries: undefined,
            reset: undefined
        }),
	}: {
		table_name: string;
		client: BeaconClient;
		initialDraft?: QueryDraft | null;
		pendingSeed?: CompiledQuery | null;
		/** Emitted on every builder edit with the current draft. */
		onDraftChange?: (draft: QueryDraft) => void;
		status?: QuerySelectionStatus;
        actions?: QuerySelectionActions; // todo
	} = $props();

	let searchInput;
	let searchQuery = $state('');
	let selected_output_format = $state(
		initialDraft?.outputFormat ?? BeaconClient.output_formats['Parquet']
	);
	let fields: {
		name: string;
		type: DataType;
		ref?: ReturnType<typeof SearchSelect.Item>; //ReturnType<typeof SearchSelect.Item>;
	}[] = $state([]);

	let selectedFields: { name: string; type: DataType; selected_filters: SelectedFilterType[] }[] =
		$state(initialDraft ? Utils.cloneObject(initialDraft.selectedFields) : []);
	/** Table the current selection belongs to; used to reset on a real table change. */
	let selectionTable = initialDraft?.tableName ?? null;
	let hasInitialisedTable = $state(false);

	let hasHydratedSeed = $state(!pendingSeed);
	let lastEmittedDraftKey = $state('');

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

	// $effect(() => {
	// 	status.outputFormat = selected_output_format;
	// });


	// Load the schema for the selected table (cached per instance). Needed for the
	// "Add Parameter" list and to parse a deep-link seed. Does NOT clear the current
	// selection — that only happens on a real table change (below).
	$effect(() => {
		if (!table_name || !client) {
			fields = [];
			return;
		}

		getCachedSchema(client, table_name).then((schema) => {
			fields = schema.fields.map((field) => ({
				name: field.name,
				type: field.data_type
			}));

			// Hydrate a one-time deep-link seed once the schema is available.
			if (pendingSeed && !hasHydratedSeed) {
				hydrateFromSeed();
				hasHydratedSeed = true;
			}
		});
	});

	// Reset the selected columns when the user actually switches to a different
	// table (columns from the old table don't apply). Skips the initial value so a
	// restored draft keeps its selection.
	$effect(() => {
		const table = table_name;

		if (!table) {
			return;
		}

		if (!hasInitialisedTable) {
			selectionTable = table;
			hasInitialisedTable = true;
			return;
		}

		if (table !== selectionTable) {
			selectedFields = [];
		}

		selectionTable = table;
	});

	$effect(() => {
		status.columns = selectedFields.length;
		status.filters = selectedFields.reduce((total, field) => {
			return total + field.selected_filters.length;
		}, 0);
	});

	// Emit the current draft upward on every edit so the active block, JSON view
	// and status badges stay in sync. Waits for a pending deep-link seed to be
	// parsed first, so it doesn't overwrite the block with an empty draft.
	$effect(() => {
		if (!table_name) {
			return;
		}

		if (pendingSeed && !hasHydratedSeed) {
			return;
		}
		const draft = {
			tableName: table_name,
			selectedFields: Utils.cloneObject(selectedFields),
			outputFormat: selected_output_format
		};
		const draftKey = JSON.stringify(draft);
		if (draftKey === lastEmittedDraftKey) {
			return;
		}
		lastEmittedDraftKey = draftKey;
		onDraftChange?.(draft);
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

	function resetBuilder() {
		selectedFields = [];
		selected_output_format = BeaconClient.output_formats['Parquet'];
	}

	// onReset = resetBuilder;
    actions.reset = resetBuilder;

	function compileQuery(): CompiledQuery {
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
	actions.compileQuery = compileQuery;

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
	actions.downloadData = handleSubmit;

	async function handleMapVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(resolve('/visualisations/map-viewer') + `?query=${encodeURIComponent(gzippedQuery)}`);
		}
	}
    actions.visualiseMap = handleMapVisualise;

	async function handleChartVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(
				resolve('/visualisations/chart-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`
			);
		}
	}
    actions.visualiseChart = handleChartVisualise;

	async function handleTableVisualise() {
		const gzippedQuery = compileAndGZipQuery();
		if (gzippedQuery) {
			goto(
				resolve('/visualisations/table-explorer') + `?query=${encodeURIComponent(gzippedQuery)}`
			);
		}
	}
    actions.visualiseTable = handleTableVisualise;


	function hydrateFromSeed() {
		const initialQuery = pendingSeed;
		if (!initialQuery || fields.length === 0) {
			return;
		}

		let droppedParts = 0;
		const normalizedSelectedFields: {
			name: string;
			type: DataType;
			selected_filters: SelectedFilterType[];
		}[] = [];

		const findSelectedField = (fieldName: string) => {
			return normalizedSelectedFields.find((field) => field.name === fieldName);
		};

		const addSelectedFieldIfMissing = (fieldName: string) => {
			const existingField = findSelectedField(fieldName);
			if (existingField) {
				return existingField;
			}

			const schemaField = fields.find((field) => field.name === fieldName);
			if (!schemaField) {
				return null;
			}

			const selectedField = {
				name: schemaField.name,
				type: schemaField.type,
				selected_filters: []
			};

			normalizedSelectedFields.push(selectedField);
			return selectedField;
		};

		if (typeof initialQuery.from !== 'string') {
			droppedParts += 1;
		}

		const normalizedQueryParameters = (initialQuery.query_parameters ?? []) as Array<{
			column?: string;
			column_name?: string;
			alias?: string | null;
		}>;

		for (const queryParameter of normalizedQueryParameters) {
			const columnName = queryParameter.column ?? queryParameter.column_name;

			if (!columnName) {
				droppedParts += 1;
				continue;
			}

			const selectedField = addSelectedFieldIfMissing(columnName);

			if (!selectedField) {
				droppedParts += 1;
				continue;
			}
		}

		const flattenFilters = (filters: Filter[]): Filter[] => {
			const result: Filter[] = [];

			for (const filter of filters ?? []) {
				if ('or' in filter) {
					droppedParts += 1;
					result.push(...flattenFilters(filter.or));
					continue;
				}

				if ('and' in filter) {
					droppedParts += 1;
					result.push(...flattenFilters(filter.and));
					continue;
				}

				result.push(filter);
			}

			return result;
		};

		const getFilterColumnName = (filter: Filter): string | null => {
			if ('for_query_parameter' in filter) {
				return filter.for_query_parameter;
			}

			if ('is_null' in filter) {
				return filter.is_null.for_query_parameter;
			}

			if ('is_not_null' in filter) {
				return filter.is_not_null.for_query_parameter;
			}

			return null;
		};

		const getFilterLabel = (filter: SelectedFilterType['filter_value']): string => {
			switch (filter.type) {
				case 'range_numeric':
				case 'range_string':
				case 'range_timestamp':
					return 'Between';
				case 'greater_than_numeric':
				case 'greater_than_string':
				case 'greater_than_timestamp':
					return 'Greater Than';
				case 'greater_than_or_equals_numeric':
				case 'greater_than_or_equals_string':
				case 'greater_than_or_equals_timestamp':
					return 'Greater Than or Equals';
				case 'less_than_numeric':
				case 'less_than_string':
				case 'less_than_timestamp':
					return 'Less Than';
				case 'less_than_or_equals_numeric':
				case 'less_than_or_equals_string':
				case 'less_than_or_equals_timestamp':
					return 'Less Than or Equals';
				case 'equals_numeric':
				case 'equals_string':
				case 'equals_timestamp':
					return 'Equals';
				case 'not_equals_numeric':
				case 'not_equals_string':
				case 'not_equals_timestamp':
					return 'Not Equals';
				case 'is_null':
					return 'Is Null';
				case 'is_not_null':
					return 'Is Not Null';
			}
		};

		for (const filter of flattenFilters(initialQuery.filters ?? [])) {
			const filterColumnName = getFilterColumnName(filter);

			if (!filterColumnName) {
				droppedParts += 1;
				continue;
			}

			let selectedField = findSelectedField(filterColumnName);

			if (!selectedField) {
				selectedField = addSelectedFieldIfMissing(filterColumnName);

				if (!selectedField) {
					droppedParts += 1;
					continue;
				}
			}

			const mappedFilter = Utils.filterToParameterFilterType(filter, selectedField.type);

			if (!mappedFilter) {
				droppedParts += 1;
				continue;
			}

			selectedField.selected_filters.push({
				label: getFilterLabel(mappedFilter),
				filter_value: mappedFilter
			});
		}

		const outputFormat = initialQuery.output?.format;

		if (typeof outputFormat === 'string') {
			selected_output_format = outputFormat;
		} else if (outputFormat) {
			droppedParts += 1;
		}

		selectedFields = normalizedSelectedFields;

		if (droppedParts > 0) {
			addToast({
				type: 'warning',
				message: `Loaded query with best effort. ${droppedParts} part(s) could not be represented in Advanced Builder.`
			});
		}
	}
</script>

<div id="new-query-builder">
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

	<!-- <hr /> -->

	<!-- <QueryActionBar
		onExecute={handleSubmit}
		onViewTable={handleTableVisualise}
		onViewMap={handleMapVisualise}
		onViewChart={handleChartVisualise}
		{compileQuery}
	/> -->
</div>

<style lang="scss">
	#new-query-builder {
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
