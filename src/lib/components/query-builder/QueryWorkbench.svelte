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

    let { initialQuery = null }: { initialQuery?: CompiledQuery | null } = $props();

    const workspace = new QueryWorkspace(initialQuery);
    let client: BeaconClient | null = $state(null);

    onMount(() => {
        const instance = $currentBeaconInstance;
        if (instance) client = BeaconClient.new(instance);
    });

    // const status = $derived(workspace.statusFor(workspace.activeBlock));

    function compileQuery() {
        return QueryWorkspace.getQuery(workspace.activeBlock);
    }

    async function runActive(): Promise<void> {
        const block = workspace.activeBlock;
        const query = QueryWorkspace.getQuery(block);
        if (!block || !query) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return;
        }

        if (workspace.getRunState(block).isRunning) return;

        workspace.markBlockRunning(block.id, true);
        
        try {
            const entry = await BeaconClient.ensureQuery(query);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.markBlockRunning(block.id, false);
            addToast({ message: `Query failed: ${e?.message ?? e}`, type: 'error' });
        }
    }

    async function downloadData(): Promise<void> {
        const query = QueryWorkspace.getQuery(workspace.activeBlock);

        if (!query || !client) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return;
        }

        try {
            await client.queryToDownload(query, BeaconClient.outputFormatToExtension(query));
        } catch (e) {
            addToast({ message: `Download failed: ${e?.message ?? e}`, type: 'error' });
        }
    }

    async function handleVisualise(): Promise<void> {
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


</script>

<div class="workbench">
	
    <div class="page-container">
        <QueryActionBar
            {compileQuery}
            {downloadData}
            visualiseTable={handleVisualise}
            visualiseChart={handleVisualise}
            visualiseMap={handleVisualise}
            {resetQuery}
            {saveQuery}
        />

        <QueryBuilderSelectorBlock {workspace} />
    </div>

    <QueryWorkbenchPanes {workspace} />

</div>

<style lang="scss">
	.workbench {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
