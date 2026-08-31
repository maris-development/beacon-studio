import type { BeaconInstance, CompiledQuery, InstanceRef } from '@/beacon-api/types';
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
    /**
     * The Beacon node of the active query, or null. The Python export needs the
     * URL and the token of that node. See `PythonQueryBuilder.toPythonCode`.
     *
     * The value is the resolved node. It is null when the instance list holds no
     * node for the query. Use {@link getInstanceRef} where a URL is enough.
     */
    getInstance?: () => BeaconInstance | null;
    /**
     * The node ref of the active query, or null. A ref keeps the URL of a node
     * that the app does not have. A share link therefore still names that node.
     * See `buildShareLink`.
     */
    getInstanceRef?: () => InstanceRef | null;
};

/**
 * Builds the workbench's query actions: compile, run, download and save the
 * active block, and navigate to a visualiser after a run.
 *
 * Every action reads the node from `workspace.activeInstance`. A query record
 * owns its node, so a switch of block switches the node with no extra work here.
 * The actions take no client: a client of the mount would go stale at the next
 * switch.
 */
export function getDefaultQueryActions(workspace: QueryWorkspace): QueryActions {
    function compileQuery() {
        return QueryWorkspace.getQuery(workspace.activeBlock);
    }

    function getInstance(): BeaconInstance | null {
        return workspace.activeInstance;
    }

    function getInstanceRef(): InstanceRef | null {
        return workspace.activeBlock?.instance ?? null;
    }

    /**
     * The node of the active block, or null with a toast. Every action that talks
     * to a node starts here. A missing node is a normal state: the block can come
     * from a share link, or the user can have removed the node.
     */
    function requireInstance(): BeaconInstance | null {
        const instance = workspace.activeInstance;
        if (instance) return instance;

        const missing = workspace.missingInstanceUrl;

        if (missing) {
            addToast({
                message: `Add the Beacon instance ${missing} to run this query.`,
                type: 'warning'
            });
        } else {
            addToast({ message: 'Pick a Beacon instance for this query first.', type: 'warning' });
        }

        return null;
    }

    async function runActive(): Promise<string | null> {
        const block = workspace.activeBlock;

        const query = QueryWorkspace.getQuery(block);

        if (!block || !query) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return null;
        }

        const instance = requireInstance();
        if (!instance) return null;

        if (workspace.getRunState(block).isRunning) return null;

        workspace.markBlockRunning(block.id, true);

        try {
            // With `storedQueryId` the store writes the cache key of the result to
            // this block. The visualisation pages then link to that block.
            const entry = await BeaconClient.ensureQuery(query, instance, block.id);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.markBlockRunning(block.id, false);

            // The app runs one query at a time. A newer run stopped this one. That
            // is the intent of the user, so it needs no error.
            if (BeaconClient.isQueryAbort(e)) return null;

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

        if (!block || !query) {
            addToast({ message: 'Can not create query, please select a table and at least one column.', type: 'warning' });
            return;
        }

        const instance = requireInstance();
        if (!instance) return;

        // Built here, and not at the mount of the page. The node of the active
        // block can differ from the node of the block at the mount.
        const client = BeaconClient.new(instance);

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
        saveQuery,
        getInstance,
        getInstanceRef
    };
}

