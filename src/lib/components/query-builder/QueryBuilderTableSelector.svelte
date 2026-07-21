<!-- script name still waiting for refactor -->

<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { onMount } from 'svelte';

	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
    import NewQueryBuilderBlock from './QueryBuilderParameterBlock.svelte';
    import type { QuerySelectionStatus } from './QuerySelectionStatus';
    import { type QuerySelectionActions, makeEmptyQuerySelectionActions } from './QuerySelectionActions';
    import type { CompiledQuery } from '@/beacon-api/types';
    import type { QueryDraft } from './QueryDraft';
	import Button from '../ui/button/button.svelte';
    import ListIcon from '@lucide/svelte/icons/list';
    import GridIcon from '@lucide/svelte/icons/grid';

    import { getCachedTables, getCachedDefaultTable } from '@/beacon-api/metadata-cache';

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

    type ViewMode = 'cards' | 'list';
    let viewMode = $state<ViewMode>('cards');

    let tables_length = $state<number>(-1); // use -1 as uninitialized value
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
		tables_length = tables.length;
		const seedTable = typeof pendingSeed?.from === 'string' ? pendingSeed.from : null;
		const draftTable = initialDraft?.tableName || null;
        selected_table_name = draftTable ?? seedTable ?? default_table;
		table_names = tables;

		viewMode = tables.length < 10 ? 'cards' : 'list';
	});

	$effect(() => {
		status.dataTable = selected_table_name;
        onTableChange?.(selected_table_name);
	});

</script>

<div class="flex items-center justify-between">
	<Label for="dataCollection">Select Data Table</Label>

	<div class="flex gap-2">
		<p>{tables_length === -1 ? 'Loading' : tables_length} tables</p>
		<Button
			variant={viewMode === 'cards' ? 'default' : 'outline'}
			onclick={() => (viewMode = 'cards')}
		>
			Cards
			<GridIcon />
		</Button>

		<Button
			variant={viewMode === 'list' ? 'default' : 'outline'}
			onclick={() => (viewMode = 'list')}
		>
			List
            <ListIcon />
		</Button>
	</div>
</div>

<div class="mt-4">
    {#if viewMode === 'cards'}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {#each table_names as table_name (table_name)}
                <Button
                    class={selected_table_name === table_name ? 'bg-primary text-primary-foreground' : ''}
                    variant={table_name === selected_table_name ? 'default' : 'outline'}
                    onclick={() => (selected_table_name = table_name)}>
                    {table_name}
                </Button>
            {/each}
        </div>
    {:else if viewMode === 'list'}
        <Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
            <Select.Trigger class="w-[180px]">
                {selected_table_name ?? 'Select a table'}
            </Select.Trigger>
            <Select.Content>
                <Select.Group>
                    <Select.Label>Tables</Select.Label>
                    {#each table_names as table_name (table_name)}
                        <Select.Item value={table_name} label={table_name}>
                            {table_name}
                        </Select.Item>
                    {/each}
                </Select.Group>
            </Select.Content>
        </Select.Root>
    {/if}
</div>

<!-- For now use the advanced query builder.
 How should we implement standard query params if each table can have different columns?
 Why should we split pre selected params and additional params?
 Why not keep them in the same block and reset the block when pressing the reset button? -->

<NewQueryBuilderBlock table_name={selected_table_name} {client} {initialDraft} {pendingSeed} {onDraftChange} bind:status bind:actions />
