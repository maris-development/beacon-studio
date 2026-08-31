<script lang="ts">
	/**
	 * QueryBuilderParametrBlock.svelte
	 * Author: Jasper van der Barg
	 * Description: Query Builder Parameter Block Component
	*/


	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as SearchSelect from '$lib/components/ui/search-select/index.js';
	import Button from '$lib/components/buttons/Button.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { BeaconClient } from '@/beacon-api/client';
	import type { CompiledQuery, DataType, OutputFormat } from '@/beacon-api/types';
	import { Utils } from '@/utils';
	import Parameter from './Parameter.svelte';
	import type { SelectedFilterType } from '@/query/filter-types';
	import { QueryBuilder } from '@/beacon-api/query';
	import { addToast } from '@/stores/toasts';
	import type { QuerySelectionStatus } from '@/query/selection-status';
    import type { QueryActions } from './QueryActions';
	import { defaultOutputFormat, type QueryDraft } from '@/query/draft';
	import MapPinnedIcon from '@lucide/svelte/icons/map-pinned';
	import XIcon from '@lucide/svelte/icons/x';
	import { describeSelection, type SpatialSelection } from '@/geo/spatial-selection';
	import { hydrateDraftFromQuery } from '@/query/seed-hydration';


	let {
		table_name,
		client,
		initialDraft = null,
		pendingSeed = null,
		onDraftChange,
		onSeedMismatch,
		// The output format control lives in the parent, next to the other
		// query wide settings. This block still reads and writes the value.
		selected_output_format = $bindable<string>(defaultOutputFormat()),
		status = $bindable<QuerySelectionStatus>({
			dataTable: '',
			columns: 0,
			filters: 0,
			selection: 0,
		}),
        // Only the query actions live here. The workbench owns navigation, because
        // it holds the StoredQuery block id for visualisation links.
        actions = $bindable<QueryActions>({
			compileQuery: compileQuery,
            downloadData: handleSubmit,
            resetQuery: undefined
        }),
	}: {
		table_name: string;
		client: BeaconClient;
		initialDraft?: QueryDraft | null;
		pendingSeed?: CompiledQuery | null;
		/** Emitted on every builder edit with the current draft. */
		onDraftChange?: (draft: QueryDraft) => void;
		/**
		 * Called when the schema of the node holds no column of a deep-link seed.
		 * The parent writes the message: it knows whether the app guessed the node.
		 */
		onSeedMismatch?: (table: string, part: 'table' | 'columns') => void;
		/** Bound to the parent, which shows the output format control. */
		selected_output_format?: string;
		status?: QuerySelectionStatus;
        actions?: QueryActions; // todo
	} = $props();

	let searchInput;
	let searchQuery = $state('');
	let fields: {
		name: string;
		type: DataType;
		ref?: ReturnType<typeof SearchSelect.Item>; //ReturnType<typeof SearchSelect.Item>;
	}[] = $state([]);

	let selectedFields: { name: string; type: DataType; selected_filters: SelectedFilterType[] }[] =
		$state(initialDraft ? Utils.cloneObject(initialDraft.selectedFields) : []);
	/**
	 * The area drawn on the map viewer. The builder shows it, and can remove it,
	 * but it cannot draw one. It applies to the latitude and the longitude column
	 * together, so it has no card of its own.
	 */
	let spatialFilter: SpatialSelection | null = $state(initialDraft?.spatialFilter ?? null);
	/** Table the current selection belongs to; used to reset on a real table change. */
	let selectionTable = initialDraft?.tableName ?? null;
	let hasInitialisedTable = $state(false);

	let hasHydratedSeed = $state(!pendingSeed);
	let lastEmittedDraftKey = $state('');
	let lastReceivedDraftKey = $state(initialDraft ? JSON.stringify(initialDraft) : '');

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

	// Reload local controls when the workspace replaces this block's draft.
	// Ignore drafts emitted by this component to prevent a write loop.
	$effect(() => {
		if (!initialDraft) {
			return;
		}

		const draftKey = JSON.stringify(initialDraft);
		if (draftKey === lastReceivedDraftKey) {
			return;
		}
		lastReceivedDraftKey = draftKey;

		if (draftKey === lastEmittedDraftKey) {
			return;
		}

		selectedFields = Utils.cloneObject(initialDraft.selectedFields);
		selected_output_format = initialDraft.outputFormat;
		spatialFilter = initialDraft.spatialFilter
			? Utils.cloneObject(initialDraft.spatialFilter)
			: null;
		selectionTable = initialDraft.tableName;
	});


	// Load the schema for the selected table (cached per instance). Needed for the
	// "Add Parameter" list and to parse a deep-link seed. Does NOT clear the current
	// selection — that only happens on a real table change (below).
	$effect(() => {
		if (!table_name || !client) {
			fields = [];
			return;
		}

		const table = table_name;

		client
			.getCachedSchema(table)
			.then((schema) => {
				fields = schema.fields.map((field) => ({
					name: field.name,
					type: field.data_type
				}));

				// Hydrate a one-time deep-link seed once the schema is available.
				if (pendingSeed && !hasHydratedSeed) {
					hydrateFromSeed(table);
					hasHydratedSeed = true;
				}
			})
			.catch((error) => {
				// A node answers 404 for a table it does not have. The parent already
				// falls back to the default table, so this is the rest of the guard.
				// Without the catch the browser reports an unhandled rejection, and
				// the builder shows an empty column list with no reason.
				console.warn(`Could not read the schema of the table "${table}".`, error);

				fields = [];

				if (pendingSeed && !hasHydratedSeed) {
					hasHydratedSeed = true;
					onSeedMismatch?.(table, 'table');
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
			outputFormat: selected_output_format,
			spatialFilter: spatialFilter ? Utils.cloneObject(spatialFilter) : null
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
		selected_output_format = defaultOutputFormat();
	}

	// onReset = resetBuilder;
    actions.resetQuery = resetBuilder;

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

	// Navigation does not belong here. The builder emits drafts. Only the workbench
	// knows the StoredQuery block that the user edits. Visualisation links carry
	// that id as `?q=`. A handler here must put the full query on the URL instead.
	// The parent binds `actions`, so such a handler also replaces the one of the
	// workbench without a warning.

	function hydrateFromSeed(table: string) {
		const seed = hydrateDraftFromQuery(pendingSeed, fields);

		spatialFilter = seed.spatialFilter;
		selectedFields = seed.selectedFields;

		if (seed.outputFormat) {
			selected_output_format = seed.outputFormat;
		}

		// The seed asked for columns, and the schema of this node holds none of
		// them. The table therefore belongs to another node. The parent reports it,
		// because it knows whether the app guessed the node. The generic
		// "best effort" message below would hide the true cause.
		const wantedColumns = pendingSeed?.query_parameters?.length ?? 0;

		if (wantedColumns > 0 && seed.selectedFields.length === 0) {
			onSeedMismatch?.(table, 'columns');
			return;
		}

		if (seed.droppedParts > 0) {
			addToast({
				type: 'warning',
				message: `Loaded query with best effort. ${seed.droppedParts} part(s) could not be represented in Advanced Builder.`
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
								<span class="search-columns-item-details">{Utils.dataTypeToString(field.type)}</span>
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

	{#if spatialFilter}
		<div class="area-filter">
			<MapPinnedIcon size={16} />
			<span class="area-filter-label">Area: {describeSelection(spatialFilter)}</span>
			<span class="area-filter-hint">Drawn on the map viewer</span>
			<Button
				variant="ghost"
				title="Remove the area filter"
				onclick={() => (spatialFilter = null)}
			>
				<XIcon size={16} />
			</Button>
		</div>
	{/if}

	<div class="parameters-grid">
		{#if selectedFields.length > 0}
			{#each Utils.range(0, selectedFields.length) as index (index)}
				<Parameter bind:column={selectedFields[index]} remove_column={removeColumnSelection} />
			{/each}
		{:else}
			<h4 class="no-selection">No parameters selected, use the 'Add Parameter' button above.</h4>
		{/if}
	</div>

</div>

<style lang="scss">

	.area-filter {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.25rem 0.25rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;

		.area-filter-label {
			font-weight: 600;
		}

		.area-filter-hint {
			flex-grow: 1;
			font-size: 0.8rem;
			color: var(--muted-foreground);
		}
	}

	.parameters-grid {
		display: grid;
		gap: 0.5rem;

		grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));


		// // sm: ≥ 640px
		// @media (min-width: 640px) {
		// 	grid-template-columns: repeat(1, minmax(0, 1fr));
		// }

		// // md: ≥ 768px
		// @media (min-width: 768px) {
		// 	grid-template-columns: repeat(2, minmax(0, 1fr));
		// }

		// lg: ≥ 1024px
		// @media (min-width: 1024px) {
		// 	grid-template-columns: repeat(2, minmax(0, 1fr));
		// }
	}
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
	.no-selection {
		color: hsl(0, 0%, 50%);
	}
</style>
