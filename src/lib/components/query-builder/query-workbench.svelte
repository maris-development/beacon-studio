<!--
 QueryWorkbench — the combined query builder + visualiser.

 Owns the single QueryWorkspace and lays out the always-visible top section:
     [A] action bar + [B] query blocks (selector-block)
 then a Build | Visualise mode switch whose content is the builder or the viewer.
 A + B stay visible in both modes.
-->
 
<script lang="ts">
    import { onMount } from 'svelte';
    import * as Tabs from '$lib/components/ui/tabs/index.js';
    import NewQueryActionBar from '@/components/query-buttons/NewQueryActionBar.svelte';
    import QueryBlock from './new-query-builder-selector-block.svelte';
    import QueryBuilderPane from './query-builder-pane.svelte';
    import QueryVisualisationView from './query-visualisation-view.svelte';
    import type { CompiledQuery } from '@/beacon-api/types';
    import { QueryWorkspace } from './query-workspace.svelte';
    import { currentBeaconInstance } from '@/stores/config';
    import { BeaconClient } from '@/beacon-api/client';
    import { queryStore } from '@/stores/query-store.svelte';
    import { addToast } from '@/stores/toasts';

    let { initialQuery = null }: { initialQuery?: CompiledQuery | null } = $props();

    const workspace = new QueryWorkspace(initialQuery);
    let mode = $state<'build' | 'visualise'>('build');
    let client: BeaconClient | null = $state(null);

    onMount(() => {
        const instance = $currentBeaconInstance;
        if (instance) client = BeaconClient.new(instance);
    });

    const status = $derived(workspace.statusFor(workspace.activeBlock));

    function compileQuery() {
        return workspace.queryFor(workspace.activeBlock);
    }

    async function runActive(): Promise<void> {
        const block = workspace.activeBlock;
        const query = workspace.queryFor(block);
        if (!block || !query) {
            addToast({ message: 'Build a query first — select a table and at least one column.', type: 'warning' });
            return;
        }
        if (workspace.runStateFor(block).isRunning) return;
        workspace.markBlockRunning(block.id, true);
        try {
            const entry = await queryStore.ensure(query);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.markBlockRunning(block.id, false);
            addToast({ message: `Query failed: ${e?.message ?? e}`, type: 'error' });
        }
    }

    async function handleDownload(): Promise<void> {
        const query = workspace.queryFor(workspace.activeBlock);
        if (!query || !client) {
            addToast({ message: 'Build a query first — select a table and at least one column.', type: 'warning' });
            return;
        }
        try {
            await client.queryToDownload(query, BeaconClient.outputFormatToExtension(query));
        } catch (e) {
            addToast({ message: `Download failed: ${e?.message ?? e}`, type: 'error' });
        }
    }

    async function handleVisualise(): Promise<void> {
        mode = 'visualise';
        await runActive();
    }

    function handleReset() {
        workspace.resetActive();
    }

    function handleSaveQuery() {
        console.log('TODO: save active query', workspace.queryFor(workspace.activeBlock));
    }

    function handleSavedQueries() {
        console.log('TODO: open saved queries');
    }
</script>

<div class="workbench">
	

	<!-- [A] Action bar — always visible -->
	<!-- TODO: Action bar floats on top of screen when scrolling -->
	<NewQueryActionBar
		{compileQuery}
		downloadData={handleDownload}
		visualiseTable={handleVisualise}
		visualiseChart={handleVisualise}
		visualiseMap={handleVisualise}
		saveQuery={handleSaveQuery}
		savedQueries={handleSavedQueries}
		reset={handleReset}
	/>

	<!-- [B] Query blocks — always visible -->
	<QueryBlock {workspace} />

	<!-- Mode switch: A + B stay above this, content swaps below -->
	<Tabs.Root bind:value={mode} class="w-full">
		<Tabs.List class="self-center">
			<Tabs.Trigger value="build">Build</Tabs.Trigger>
			<Tabs.Trigger value="visualise">Visualise</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="build">
			<!-- Table + parameter selection on the left, live JSON on the right. -->
			<QueryBuilderPane {workspace} />
		</Tabs.Content>

		<Tabs.Content value="visualise">
			<!-- Runs the active block and shows Table / Chart / Map. -->
			<QueryVisualisationView {workspace} onRunQuery={runActive} />
		</Tabs.Content>
	</Tabs.Root>
</div>

<style lang="scss">
	.workbench {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
