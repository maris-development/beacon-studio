import type { CompiledQuery } from '@/beacon-api/types';
import { QueryWorkspace } from './QueryWorkspace.svelte';
import { BeaconClient } from '@/beacon-api/client';
import { addToast } from '@/stores/toasts';
import { saveQueryFrom } from '@/stores/saved-queries';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

export type ActionCallback = (() => void | Promise<void>) | undefined;

export type QueryActions = {
    compileQuery?: (() => CompiledQuery) | undefined;   // returns function compile query
    downloadData?: ActionCallback;   // returns function download data
    visualiseTable?: ActionCallback; // links to visualise data in table page
    visualiseChart?: ActionCallback; // links to visualise data in chart page
    visualiseMap?: ActionCallback;   // links to visualise data in map page
    saveQuery?: ActionCallback;   // links to visualise data in map page
    resetQuery?: ActionCallback;          // reset query selection
    editQuery?: ActionCallback;           // edit query selection
};

/**
 * Builds the workbench's query actions: compile, run, download and save the
 * active block, and navigate to a visualiser after a run. `client` is used
 * for direct downloads; `workspace` holds the active block and run state.
 */
export function getDefaultQueryActions(workspace: QueryWorkspace, client: BeaconClient | null): QueryActions {
    function compileQuery() {
        return QueryWorkspace.getQuery(workspace.activeBlock);
    }

    async function runActive(): Promise<string | null> {
        const block = workspace.activeBlock;

        const query = QueryWorkspace.getQuery(block);

        if (!block || !query) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return null;
        }

        if (workspace.getRunState(block).isRunning) return null;

        workspace.markBlockRunning(block.id, true);

        try {
            // With `storedQueryId` the store writes the cache key of the result to
            // this block. The visualisation pages then link to that block.
            const entry = await BeaconClient.ensureQuery(query, block.id);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.markBlockRunning(block.id, false);
            addToast({ message: `Query failed: ${e?.message ?? e}`, type: 'error' });
            return null;
        }

        return block.id;
    }

    /** Run the active block, then open a visualiser with the persisted selection. */
    async function visualiseOn(resolvedPath: string): Promise<void> {
        const blockId = await runActive();
        if (!blockId) return;
        await goto(resolvedPath);
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
        await visualiseOn(resolve('/visualisations/table-explorer'));
    }

    async function visualiseChart(): Promise<void> {
        await visualiseOn(resolve('/visualisations/chart-explorer'));
    }

    async function visualiseMap(): Promise<void> {
        await visualiseOn(resolve('/visualisations/map-viewer'));
    }

    function resetQuery() {
        workspace.resetActive();
    }

    /**
     * Save the active block as an independent copy in the saved queries. It is a
     * copy, not a reference. A later edit to the block must not change the saved
     * query. The copy holds the draft of the block. Therefore a second open
     * restores the exact builder state, and not a state from the compiled query.
     */
    function saveQuery(): void {
        const block = workspace.activeBlock;

        if (!block || !QueryWorkspace.getQuery(block)) {
            addToast({ message: 'Can not save: please select a table and at least one column.', type: 'warning' });
            return;
        }

        try {
            saveQueryFrom(block);
            addToast({ message: `Query "${block.name}" saved.`, type: 'success' });
        } catch (e) {
            addToast({ message: `Failed to save query: ${e?.message ?? e}`, type: 'error' });
        }
    }

    return {
        compileQuery,
        downloadData,
        visualiseTable,
        visualiseChart,
        visualiseMap,
        resetQuery,
        saveQuery
    };
}

