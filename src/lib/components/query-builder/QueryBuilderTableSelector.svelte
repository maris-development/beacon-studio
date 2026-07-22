<script lang="ts">
    import * as Select from '$lib/components/ui/select/index.js';
    import Button from '../ui/button/button.svelte';
    import ListIcon from '@lucide/svelte/icons/list';
    import GridIcon from '@lucide/svelte/icons/grid';

    let {
        table_names = [],
        loaded = false,
        selected_table_name = $bindable(''),
    }: {
        table_names?: string[];
        loaded?: boolean;
        selected_table_name?: string;
    } = $props();

    type ViewMode = 'cards' | 'list';
    let viewMode = $state<ViewMode>('cards');
    let viewModeInitialized = $state(false);

    $effect(() => {
        if (loaded && !viewModeInitialized) {
            viewMode = table_names.length < 10 ? 'cards' : 'list';
            viewModeInitialized = true;
        }
    });
</script>

<div class="flex items-center justify-between">
    <h3>Select Data Table</h3>

    <div class="flex gap-2">
        <p>{!loaded ? 'Loading' : table_names.length} tables</p>
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

<style lang="scss">

</style>