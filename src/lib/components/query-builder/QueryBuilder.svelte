<script lang="ts">
	import { onMount } from 'svelte';

	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
    import NewQueryBuilderBlock from './QueryBuilderParameterBlock.svelte';
    import type { QuerySelectionStatus } from './QuerySelectionStatus';
    import { type QuerySelectionActions, makeEmptyQuerySelectionActions } from './QuerySelectionActions';
    import type { CompiledQuery } from '@/beacon-api/types';
    import type { QueryDraft } from './QueryDraft';
    import { getCachedTables, getCachedDefaultTable } from '@/beacon-api/metadata-cache';
    import QueryBuilderTableSelector from './QueryBuilderTableSelector.svelte';

    let {
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
        actions = $bindable<QuerySelectionActions>(makeEmptyQuerySelectionActions()),
    }: {
        initialDraft?: QueryDraft | null;
        pendingSeed?: CompiledQuery | null;
        onDraftChange?: (draft: QueryDraft) => void;
        onTableChange?: (tableName: string) => void;
        status?: QuerySelectionStatus;
        actions?: QuerySelectionActions;
    } = $props();

    let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
    let client: BeaconClient = $state(null);

    let loaded = $state(false);
    let selected_table_name = $state(initialDraft?.tableName ?? '');
	let table_names = $state<string[]>([]);

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		// let tables = await client.getTables();
		// let default_table = await client.getDefaultTable();

        let tables = await getCachedTables(client);
        let default_table = await getCachedDefaultTable(client);

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

<QueryBuilderTableSelector {table_names} {loaded} bind:selected_table_name />

<!-- For now use the advanced query builder.
 How should we implement standard query params if each table can have different columns?
 Why should we split pre selected params and additional params?
 Why not keep them in the same block and reset the block when pressing the reset button? -->

<NewQueryBuilderBlock table_name={selected_table_name} {client} {initialDraft} {pendingSeed} {onDraftChange} bind:status bind:actions />
