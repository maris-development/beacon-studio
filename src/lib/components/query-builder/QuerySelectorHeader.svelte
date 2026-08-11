<script lang="ts">
    import QueryActionBar from '@/components/query-builder/QueryActionBar.svelte';
    import QueryBuilderSelectorBlock from './QueryBuilderSelectorBlock.svelte';
    import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
    import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
    import Button from '../buttons/Button.svelte';
	import { goto } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

    type QuerySelectorMode = 'view' | 'edit';

    let { 
        workspace, 
        queryActions,
        mode = 'edit' as QuerySelectorMode
     } = $props();

    let showQuerySelectionBlock = $state(true);

    let queryActionsForBar = $derived({
        ...queryActions,
        editQuery: mode === 'view' ? gotoQueryEditor : undefined
    });

    function gotoQueryEditor(){
        const currentQueryId = workspace.activeBlockId;
        if(currentQueryId){
            const params = new SvelteURLSearchParams();
            params.set('q', currentQueryId);
            goto(`/queries/workbench?${params.toString()}`);
        }
    }
</script>

<div class="page-container">
    <div class="action-bar-wrapper">
        <div class="title-bar">
            <Button class="selection-block-toggle" onclick={() => (showQuerySelectionBlock = !showQuerySelectionBlock)} variant="ghost">
                {#if showQuerySelectionBlock}
                    <ChevronUpIcon class="size-4" />
                {:else}
                    <ChevronDownIcon class="size-4" />
                {/if}
            </Button>
            <div class="page-title">
                <h2>{mode === 'edit' ? 'Editing' : 'Viewing'} {workspace.activeBlock.name}</h2>
            </div>
        </div>
        <QueryActionBar queryActions={queryActionsForBar} />
    </div>

    {#if showQuerySelectionBlock}
        <div class="selection-block-wrapper">
            <QueryBuilderSelectorBlock {workspace} />
        </div>
    {/if}

</div>

<style lang="scss">
    .page-container {
        padding: 0;

        .action-bar-wrapper {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem;
            gap: 0.5rem;

            .title-bar {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 0.5rem;

                .page-title {
                    flex-grow: 1;
                }
                h2 {
                    margin: 0;
                }
            }

            @media (max-width: 1024px) {
                flex-direction: column;
                align-items: flex-start;
            }

        }
        .selection-block-wrapper {
            border-top: 1px solid var(--border);
            padding: 0.5rem;
        }
    }
</style>
