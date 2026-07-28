<script lang="ts">
	import { onMount } from 'svelte';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
    import QueryBuilderParameterBlock from './QueryBuilderParameterBlock.svelte';
    import type { QuerySelectionStatus } from './QuerySelectionStatus';
    import { type QuerySelectionActions, makeEmptyQuerySelectionActions } from './QuerySelectionActions';
    import type { CompiledQuery } from '@/beacon-api/types';
    import type { QueryDraft } from './QueryDraft';
    import QueryBuilderTableSelector from './QueryBuilderTableSelector.svelte';
	import Button from '../buttons/Button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import TableIcon from '@lucide/svelte/icons/table';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
    import MapIcon from '@lucide/svelte/icons/map';
    import VisualiseIcon from '@lucide/svelte/icons/eye';
	import DownloadDataButton from '../buttons/DownloadDataButton.svelte';
		

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

<QueryBuilderTableSelector {table_names} {loaded} {status} bind:selected_table_name />

<QueryBuilderParameterBlock table_name={selected_table_name} {client} {initialDraft} {pendingSeed} {onDraftChange} bind:status bind:actions />

<hr>

<DownloadDataButton downloadData={actions.downloadData} />


<!-- dropdown for visualisations -->
<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        <Button>
            <VisualiseIcon />
            Visualise Query
        </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-48">
        <DropdownMenu.Item onclick={actions.visualiseTable}>
            <TableIcon class="text-muted-foreground" />
            <span>Table</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={actions.visualiseChart}>
            <ChartPie class="text-muted-foreground" />
            <span>Chart</span>
        </DropdownMenu.Item>
        <!-- <DropdownMenu.Separator /> -->
        <DropdownMenu.Item onclick={actions.visualiseMap}>
            <MapIcon class="text-muted-foreground" />
            <span>Map</span>
        </DropdownMenu.Item>
    </DropdownMenu.Content>
</DropdownMenu.Root>

<style lang="scss">
    hr {
        margin: 1rem 0;
    }
</style>