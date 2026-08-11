<script lang="ts">
    import * as Select from '$lib/components/ui/select/index.js';
    import Button from '../buttons/Button.svelte';
    import ListIcon from '@lucide/svelte/icons/list';
    import GridIcon from '@lucide/svelte/icons/grid';
    import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Card from '../card/Card.svelte';
	import type { QuerySelectionStatus } from '@/query/selection-status';

    let {
        table_names = [],
        loaded = false,
        selected_table_name = $bindable(''),
        status
    }: {
        table_names?: string[];
        loaded?: boolean;
        selected_table_name?: string;
        status?: QuerySelectionStatus;
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

    function pickTable(table_name: string) {
        if(status.columns > 0) {
            const confirmChange = confirm('Changing the table will reset your column selections. Continue?');
            if (!confirmChange) {
                return;
            }
        }
        selected_table_name = table_name;
    }
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
        <div class="cards-view">
            {#each table_names as table_name (table_name)}
                <Card class={selected_table_name === table_name ? 'selected' : ''}
                    onclick={() => pickTable(table_name)}>
                    <div class="table-header">
                        <h4>{table_name}</h4>
                        {#if selected_table_name === table_name}
                            <CircleCheck class="check" size="1rem"/>
                        {/if}
                    </div>
                    <p class="table-description">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </p>
                    

                </Card>
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
    .cards-view {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
        gap: 0.5rem;

        :global(.card){
            padding: 0.6rem;
            
        }

        :global(.card.selected) {
            border-color: var(--primary);
            background-color: var(--selected-background);
            
            :global(.check) {
                color: var(--primary);
                align-self: flex-start; /* Options: flex-start, flex-end, center, baseline, stretch */
            }
        }

        div.table-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        p.table-description {
            font-size: 0.875rem;
            color: hsl(0, 0%, 50%);
            margin: 0;
            // Onlys how one lien and elippse the rest of the text:
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;

        }
    }

    
</style>