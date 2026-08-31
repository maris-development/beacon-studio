<script lang="ts">
	import { onMount } from 'svelte';
	import type { BeaconInstance } from '@/beacon-api/types';
	import { BeaconClient } from '@/beacon-api/client';
    import QueryBuilderInstanceSelector from './QueryBuilderInstanceSelector.svelte';
    import QueryBuilderParameterBlock from './QueryBuilderParameterBlock.svelte';
    import type { QuerySelectionStatus } from '@/query/selection-status';
    import type { QueryActions } from './QueryActions';
    import type { CompiledQuery } from '@/beacon-api/types';
    import type { QueryDraft } from '@/query/draft';
    import QueryBuilderTableSelector from './QueryBuilderTableSelector.svelte';
	import DownloadDataButton from '../buttons/DownloadDataButton.svelte';
	import VisualiseDataButton from '../buttons/VisualiseDataButton.svelte';
		

    let {
        instance,
        missingInstanceUrl = null,
        onInstanceChange,
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
	let table_names = $state<string[]>([]);

	onMount(async () => {
		// No node, no tables. The user picks a node in the first step, which
		// re-mounts this component with a client.
		if (!instance) return;

		client = BeaconClient.new(instance);

        let tables = await client.getCachedTables();
        let default_table = await client.getCachedDefaultTable();

		// By default, select the first table, or restore the table from the draft/seed.
		const seedTable = typeof pendingSeed?.from === 'string' ? pendingSeed.from : null;
		const draftTable = initialDraft?.tableName || null;
        selected_table_name = draftTable ?? seedTable ?? default_table;
		table_names = tables;
        loaded = true;
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

{#if instance && client}
	<QueryBuilderTableSelector {table_names} {loaded} {status} bind:selected_table_name />

	<QueryBuilderParameterBlock table_name={selected_table_name} {client} {initialDraft} {pendingSeed} {onDraftChange} bind:status bind:actions={queryActions} />

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
</style>