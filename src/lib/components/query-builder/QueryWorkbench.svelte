<!--
 QueryWorkbench — the combined query builder + visualiser.

 Owns the single QueryWorkspace and lays out the always-visible top section:
     [A] action bar + [B] query blocks (selector-block)
 then a Build | Visualise mode switch whose content is the builder or the viewer.
 A + B stay visible in both modes.
-->
 
<script lang="ts">
    import { onMount } from 'svelte';
    import QueryActionBar from '@/components/query-builder/QueryActionBar.svelte';
    import QueryBuilderSelectorBlock from './QueryBuilderSelectorBlock.svelte';
    import QueryWorkbenchPanes from './QueryWorkbenchPanes.svelte';
    import type { CompiledQuery } from '@/beacon-api/types';
    import { QueryWorkspace } from './QueryWorkspace.svelte';
    import { currentBeaconInstance } from '@/stores/config';
    import { BeaconClient } from '@/beacon-api/client';
    import { addToast } from '@/stores/toasts';
    import { addSavedQuery } from '@/stores/saved-queries';
    import { get } from 'svelte/store';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import Button from '../buttons/Button.svelte';
	import { Utils } from '@/utils';

	const initialQuery: CompiledQuery | null = Utils.getUrlSuppliedQuery();
    const workspace = $state(new QueryWorkspace(initialQuery));

    let client: BeaconClient | null = $state(null);
    let showQuerySelectionBlock = $state(true);

    onMount(() => {
        const instance = $currentBeaconInstance;
        if (instance) client = BeaconClient.new(instance);
    });

    // const status = $derived(workspace.statusFor(workspace.activeBlock));

    function compileQuery() {
        return QueryWorkspace.getQuery(workspace.activeBlock);
    }

    async function runActive(): Promise<string|null> {
        const block = workspace.activeBlock;

        const query = QueryWorkspace.getQuery(block);

        if (!block || !query) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return null;
        }

        if (workspace.getRunState(block).isRunning) return null;

        workspace.markBlockRunning(block.id, true);
        
        try {
            const entry = await BeaconClient.ensureQuery(query);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.markBlockRunning(block.id, false);
            addToast({ message: `Query failed: ${e?.message ?? e}`, type: 'error' });
        }

        return block.id;
    }

    async function downloadData(): Promise<void> {
        const block = workspace.activeBlock;

        const query = QueryWorkspace.getQuery(workspace.activeBlock);

        if (!query || !client) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return;
        }

        if (workspace.getRunState(block).isRunning) return;

        workspace.markBlockRunning(block.id, true);

        addToast({ message: 'Downloading dataset...', type: 'info' });

        try {
            const outputExtension = BeaconClient.outputFormatToExtension(query);
            await client.queryToDownload(query, outputExtension);
            addToast({
                message: `Dataset downloaded directly as ${outputExtension}. This does not populate the visualisation cache; use Visualise Query to run and cache this query.`,
                type: 'success'
            });
        } catch (e) {
            addToast({ message: `Download failed: ${e?.message ?? e}`, type: 'error' });
        } finally {
            workspace.markBlockRunning(block.id, false);
        }
    }

    async function visualiseTable(): Promise<void> {
        await runActive();
    }

    async function visualiseChart(): Promise<void> {
        await runActive();
    }

    async function visualiseMap(): Promise<void> {
        await runActive();
    }

    function resetQuery() {
        workspace.resetActive();
    }

    function saveQuery(): void {
        const block = workspace.activeBlock;
        
        const query = QueryWorkspace.getQuery(block);

        if (!block || !query) {
            addToast({ message: 'Can not save: please select a table and at least one column.', type: 'warning' });
            return;
        }

        const instance = get(currentBeaconInstance);
        try {
            addSavedQuery({
                name: block.name,
                query,
                instanceId: instance?.id ?? '',
                instanceName: instance?.name ?? '',
                instanceUrl: instance?.url ?? ''
            });
            addToast({ message: `Query "${block.name}" saved.`, type: 'success' });
        } catch (e) {
            addToast({ message: `Failed to save query: ${e?.message ?? e}`, type: 'error' });
        }
    }


    let queryActions = {
        compileQuery,
        downloadData,
        visualiseTable,
        visualiseChart,
        visualiseMap,
        resetQuery,
        saveQuery
    }

</script>

<div class="workbench">
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
                    <h2>Editing {workspace.activeBlock.name}</h2>
                </div>
            </div>
            <QueryActionBar {queryActions} />
        </div>

        {#if showQuerySelectionBlock}
            <div class="selection-block-wrapper">
                <QueryBuilderSelectorBlock {workspace} />
            </div>
        {/if}
    
    </div>

    <QueryWorkbenchPanes {workspace} {queryActions} />

</div>

<style lang="scss">
	.workbench {
		display: flex;
		flex-direction: column;
		gap: 1rem;

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
	}
</style>
