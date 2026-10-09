import type { BeaconNode, CompiledQuery } from '@/beacon-api/types';
import { QueryWorkspace } from './QueryWorkspace.svelte';
import { BeaconClient } from '@/beacon-api/client';
import { addToast } from '@/stores/toasts';
import { saveQueryFrom } from '@/stores/saved-queries';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { runBlockReason } from '@/query/query-guard';
import type { ShareableQuery } from '@/stores/stored-query';
import type { Message } from '@/i18n';

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
     * The value is the resolved node. It is null when the node list holds no
     * node for the query. A share link uses the ref of {@link getShareableQuery}.
     */
    getNode?: () => BeaconNode | null;
    /** The active query as a share link carries it, or null. See `buildShareLink`. */
    getShareableQuery?: () => ShareableQuery | null;
    /**
     * The reason that the active query must not run, or null. The action bar
     * disables the run and download buttons with it, and names the reason.
     *
     * The value is a snapshot. A component that must react to a change of the
     * safeguard switch reads `$settings` beside this call.
     */
    runBlockReason?: () => Message | null;
};

/**
 * Builds the workbench's query actions: compile, run, download and save the
 * active block, and navigate to a visualiser after a run.
 *
 * Every action reads the node from `workspace.activeNode`. A query record
 * owns its node, so a switch of block switches the node with no extra work here.
 * The actions take no client: a client of the mount would go stale at the next
 * switch.
 */
export function getDefaultQueryActions(workspace: QueryWorkspace): QueryActions {
    function compileQuery() {
        return QueryWorkspace.getQuery(workspace.activeBlock);
    }

    function getNode(): BeaconNode | null {
        return workspace.activeNode;
    }

    function getShareableQuery(): ShareableQuery | null {
        const block = workspace.activeBlock;
        if (!block) return null;

        return {
            compiled: QueryWorkspace.getQuery(block),
            name: block.name,
            node: block.node,
            coordinateColumns: block.coordinateColumns ?? null
        };
    }
  
    /** The reason that the active query must not run. See {@link runBlockReason}. */
    function activeRunBlockReason(): Message | null {
        return runBlockReason(QueryWorkspace.getQuery(workspace.activeBlock));
    }

    /**
     * True when the safeguard stops this query. The caller must not talk to the
     * node. A query with no filter reads a whole table.
     */
    function isBlocked(query: CompiledQuery): boolean {
        const reason = runBlockReason(query);
        if (!reason) return false;

        addToast({ key: reason.key, values: reason.values, type: 'warning' });
        return true;
    }

    /**
     * The node of the active block, or null with a toast. Every action that talks
     * to a node starts here. A missing node is a normal state: the block can come
     * from a share link, or the user can have removed the node.
     */
    function requireNode(): BeaconNode | null {
        const node = workspace.activeNode;
        if (node) return node;

        const missing = workspace.missingNodeUrl;

        if (missing) {
            addToast({
                key: 'workbench.toast.addMissingNode',
                values: { url: missing },
                type: 'warning'
            });
        } else if (!workspace.nodesReady) {
            // The public list is still on its way, so the node can still arrive.
            addToast({ key: 'workbench.toast.waitForNodes', type: 'warning' });
        } else {
            addToast({ key: 'workbench.toast.pickNode', type: 'warning' });
        }

        return null;
    }

    async function runActive(): Promise<string | null> {
        const block = workspace.activeBlock;

        const query = QueryWorkspace.getQuery(block);

        if (!block || !query) {
            addToast({ key: 'workbench.toast.noQuery', type: 'warning' });
            return null;
        }

        if (isBlocked(query)) return null;

        const node = requireNode();
        if (!node) return null;

        if (workspace.getRunState(block).isRunning) return null;

        // The number names this run. A newer run of the same block takes the
        // spinner over, and `endBlockRun` then leaves it alone.
        const token = workspace.beginBlockRun(block.id);

        try {
            // With `storedQueryId` the store writes the cache key of the result to
            // this block. The visualisation pages then link to that block.
            const entry = await BeaconClient.ensureQuery(query, node, block.id);
            workspace.markBlockRun(block.id, entry.rowCount);
        } catch (e) {
            workspace.endBlockRun(block.id, token);

            // The app runs one query at a time. A newer run stopped this one. That
            // is the intent of the user, so it needs no error.
            if (BeaconClient.isQueryAbort(e)) return null;

            addToast({ key: 'workbench.toast.runFailed', message: String(e?.message ?? e), type: 'error' });
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
            addToast({ key: 'workbench.toast.noQuery', type: 'warning' });
            return;
        }

        if (isBlocked(query)) return;

        const node = requireNode();
        if (!node) return;

        // Built here, and not at the mount of the page. The node of the active
        // block can differ from the node of the block at the mount.
        const client = BeaconClient.new(node);

        if (workspace.getRunState(block).isRunning) return;

        const token = workspace.beginBlockRun(block.id);

        addToast({ key: 'download.toast.started', type: 'info' });

        try {
            const outputExtension = BeaconClient.outputFormatToExtension(query);
            await client.queryToDownload(query, outputExtension);
            addToast({
                key: 'download.toast.directDone',
                values: { extension: outputExtension },
                type: 'success'
            });
        } catch (e) {
            addToast({ key: 'download.toast.failed', message: String(e?.message ?? e), type: 'error' });
        } finally {
            workspace.endBlockRun(block.id, token);
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
            addToast({ key: 'saved.toast.noQuery', type: 'warning' });
            return;
        }

        try {
            saveQueryFrom(block);
            addToast({ key: 'saved.toast.saved', values: { name: block.name }, type: 'success' });
        } catch (e) {
            addToast({ key: 'saved.toast.saveFailed', message: String(e?.message ?? e), type: 'error' });
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
        getNode,
        getShareableQuery,
        runBlockReason: activeRunBlockReason
    };
}

