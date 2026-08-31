<script lang="ts">
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '@/beacon-api/types';
	import { BeaconClient } from '@/beacon-api/client';
    import QueryBuilderInstanceSelector from './QueryBuilderInstanceSelector.svelte';
    import QueryBuilderParameterBlock from './QueryBuilderParameterBlock.svelte';
    import QueryBuilderOutputFormatSelector from './QueryBuilderOutputFormatSelector.svelte';
    import type { QuerySelectionStatus } from '@/query/selection-status';
    import type { QueryActions } from './QueryActions';
    import type { CompiledQuery } from '@/beacon-api/types';
    import { defaultOutputFormat, type QueryDraft } from '@/query/draft';
    import QueryBuilderTableSelector from './QueryBuilderTableSelector.svelte';
	import Button from '../buttons/Button.svelte';
	import DownloadDataButton from '../buttons/DownloadDataButton.svelte';
	import VisualiseDataButton from '../buttons/VisualiseDataButton.svelte';
		

    let {
        instance,
        missingInstanceUrl = null,
        onInstanceChange,
        onSeedMismatch,
        initialDraft = null,
        pendingSeed = null,
        onDraftChange,
        onTableChange,
        status = $bindable<QuerySelectionStatus>({
            dataTable: '',
            columns: 0,
            filters: 0,
            selection: 0,
        }),
        actions: queryActions = $bindable<QueryActions>({}),
        workbenchActions,
    }: {
        /**
         * The Beacon node of this query, or null while it has none. The parent
         * re-mounts the builder when this changes, so the client below is built
         * once and never goes stale.
         */
        instance: BeaconInstance | null;
        /** The URL of a node that the instance list does not hold, or null. */
        missingInstanceUrl?: string | null;
        /** Called with the node the user picked in the first step. */
        onInstanceChange: (instance: BeaconInstance) => void;
        /**
         * Called when the node does not hold the query of a deep-link seed. The
         * builder finds this, because only the builder reads the tables and the
         * schema of the node. The parent writes the message.
         */
        onSeedMismatch?: (table: string, part: 'table' | 'columns') => void;
        initialDraft?: QueryDraft | null;
        pendingSeed?: CompiledQuery | null;
        onDraftChange?: (draft: QueryDraft) => void;
        onTableChange?: (tableName: string) => void;
        status?: QuerySelectionStatus;
        /** Bound to the parent. The builder puts `compileQuery` here. */
        actions?: QueryActions;
        /**
         * The download and visualise handlers of the workbench. Navigation needs
         * the id of the StoredQuery block. Only the workbench holds that id.
         * Therefore these handlers come from the parent.
         */
        workbenchActions: QueryActions;
    } = $props();

    let client: BeaconClient | null = $state(null);

    let loaded = $state(false);
    let selected_table_name = $state(initialDraft?.tableName ?? '');
    let selected_output_format = $state(initialDraft?.outputFormat ?? defaultOutputFormat());
	let table_names = $state<string[]>([]);

    /**
     * The reason why the node gave no tables, or null. A node can be down, and a
     * token can be wrong. The builder then names the reason, and offers a retry.
     * Without this the user sees an empty builder and no cause.
     */
    let loadError: string | null = $state(null);

    /**
     * True when this node does not hold the table of the seed. The seed of one
     * node does not fit the schema of another, so the builder must not hydrate
     * it. The block keeps its compiled query. The user then picks another node,
     * or edits the query. See {@link handleDraftChange}.
     */
    let seedBlocked = $state(false);

	onMount(() => {
		void loadTables();
	});

	/**
	 * Read the tables of the node, and pick the table to show.
	 *
	 * The retry button calls this method again. The metadata cache drops a failed
	 * request, so a retry does reach the node.
	 */
	async function loadTables(): Promise<void> {
		// No node, no tables. The user picks a node in the first step, which
		// re-mounts this component with a client.
		if (!instance) return;

		loadError = null;
		loaded = false;
		client = BeaconClient.new(instance);

		let tables: string[];
		let default_table: string;

		try {
			tables = await client.getCachedTables();
			default_table = await client.getCachedDefaultTable();
		} catch (error) {
			console.error('Could not read the tables of the Beacon instance.', error);
			loadError = (error as Error)?.message || 'The Beacon instance did not answer.';
			loaded = true;
			return;
		}

		// By default, select the first table, or restore the table from the draft/seed.
		const seedTable = typeof pendingSeed?.from === 'string' ? pendingSeed.from : null;
		const draftTable = initialDraft?.tableName || null;
        let wanted = draftTable ?? seedTable ?? default_table;

        // This node does not have the table that the query reads. Show the default
        // table, so the builder stays usable. Without the fallback the schema
        // request answers 404, and the builder shows no columns at all.
        if (wanted && !tables.includes(wanted)) {
            // Hold the seed back. Its columns belong to another schema, so the
            // hydration finds none, and the empty draft destroys the query of the
            // block. Keep the query, and let the user decide.
            seedBlocked = !!pendingSeed;

            onSeedMismatch?.(wanted, 'table');
            wanted = default_table;
        }

        selected_table_name = wanted;
		table_names = tables;
        loaded = true;
	}

	/**
	 * Pass a draft of the builder to the parent.
	 *
	 * A blocked seed needs one guard. The parameter block emits an empty draft at
	 * its mount, and that draft compiles to nothing. The parent then drops the
	 * compiled query of the block. Therefore drop an empty draft while the seed is
	 * blocked. The first real edit of the user has columns, and that edit takes
	 * the block over.
	 */
	function handleDraftChange(draft: QueryDraft): void {
		if (seedBlocked) {
			if (draft.selectedFields.length === 0) return;
			seedBlocked = false;
		}

		onDraftChange?.(draft);
	}

	/**
	 * The seed for the parameter block. A blocked seed passes nothing, so the
	 * block hydrates no column of another schema. See {@link loadTables}.
	 */
	const activeSeed = $derived.by(() => {
		if (seedBlocked) return null;
		return pendingSeed;
	});

	$effect(() => {
		status.dataTable = selected_table_name;
        onTableChange?.(selected_table_name);
	});

</script>

<QueryBuilderInstanceSelector
	selected={instance}
	missingUrl={missingInstanceUrl}
	onPick={onInstanceChange}
/>

<hr>

{#if instance && loadError}
	<!--
		The node gave no tables. Name the reason, and offer a retry. The picker
		above stays, so the user can also pick another node.
	-->
	<div class="load-error" role="alert">
		<p class="load-error-title">Could not read the tables of "{instance.name || instance.url}".</p>
		<p class="load-error-reason">{loadError}</p>
		<Button variant="secondary" onclick={() => loadTables()}>Try again</Button>
	</div>

	<hr>
{:else if instance && client}
	<QueryBuilderTableSelector {table_names} {loaded} {status} bind:selected_table_name />

    <hr>

	<!--
		`pendingSeed` is null while the seed is blocked. This node does not hold the
		table of that seed, so a hydration finds no column. See `loadTables`.
	-->
	<QueryBuilderParameterBlock table_name={selected_table_name} {client} {initialDraft} pendingSeed={activeSeed} onDraftChange={handleDraftChange} {onSeedMismatch} bind:status bind:actions={queryActions} bind:selected_output_format />

	<hr>

	<QueryBuilderOutputFormatSelector bind:selected_output_format />

	<hr>
{/if}

<DownloadDataButton downloadData={workbenchActions.downloadData} />


<VisualiseDataButton
    visualiseTable={workbenchActions.visualiseTable}
    visualiseChart={workbenchActions.visualiseChart}
    visualiseMap={workbenchActions.visualiseMap}
/>

<style lang="scss">
    hr {
        margin: 1rem 0;
    }

    .load-error {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;

        padding: 1rem;
        border: 1px solid var(--destructive);
        border-radius: 0.375rem;

        .load-error-title {
            margin: 0;
            font-weight: 600;
        }

        .load-error-reason {
            margin: 0;
            font-size: 0.875rem;
            color: var(--muted-foreground);
        }
    }
</style>