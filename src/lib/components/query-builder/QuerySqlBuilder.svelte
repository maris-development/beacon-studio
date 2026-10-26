<!--
	SQL mode of a query: the node, the SQL text and the output format.

	The component shows values and reports changes. The parent writes them to the workspace.
	The Run button lives in the Preview pane, and Ctrl+Enter in the editor asks the parent to run.
-->
<script lang="ts" module>
    import { CatalogCache } from "@/sql/catalog";

    // One cache for the page life, so a mode switch does not load the tables again.
    const cache = new CatalogCache();
</script>

<script lang="ts">
    import { untrack } from "svelte";
    import LockIcon from "@lucide/svelte/icons/lock";
    import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
    import type { BeaconNode } from "@/beacon-api/types";
    import CatalogTree from "@/components/sql-editor/CatalogTree.svelte";
    import SqlEditor from "@/components/sql-editor/SqlEditor.svelte";
    import { CatalogState } from "@/components/sql-editor/CatalogState.svelte";
    import DownloadDataButton from "../buttons/DownloadDataButton.svelte";
    import VisualiseDataButton from "../buttons/VisualiseDataButton.svelte";
    import QueryBuilderNodeSelector from "./QueryBuilderNodeSelector.svelte";
    import QueryBuilderOutputFormatSelector from "./QueryBuilderOutputFormatSelector.svelte";
    import QueryBuilderStep from "./QueryBuilderStep.svelte";
    import type { QueryActions } from "./QueryActions";
    import { t, type Message } from "@/i18n";

    let {
        node,
        missingNodeUrl = null,
        nodesReady = true,
        onNodeChange,
        blockId,
        blockIds,
        sql,
        onSqlChange,
        outputFormat,
        onOutputFormatChange,
        reason,
        onRun,
        workbenchActions
    }: {
        /** The node of the query, or null while it has none. */
        node: BeaconNode | null;
        /** The URL of a node that the node list does not hold, or null. */
        missingNodeUrl?: string | null;
        /** False while the app still reads the public node list. */
        nodesReady?: boolean;
        onNodeChange: (node: BeaconNode) => void;
        /** The block of the query. The editor keeps one text model, with its undo history, per block. */
        blockId: string;
        blockIds: string[];
        sql: string;
        onSqlChange: (blockId: string, sql: string) => void;
        outputFormat: string;
        onOutputFormatChange: (format: string) => void;
        /** The reason that the SQL must not run, or null. See `QueryWorkspace.blockReason`. */
        reason: Message | null;
        /** Ctrl+Enter in the editor. */
        onRun: () => void;
        workbenchActions: QueryActions;
    } = $props();

    const catalog = new CatalogState(cache);

    let editor: SqlEditor | undefined = $state();

    // The node object changes on every health check. The URL changes only on a real switch.
    let nodeUrl = $derived(node?.url ?? null);
    let completions = $derived(catalog.completions(true));

    let hasSql = $derived(sql.trim() !== "");
    let sqlReady = $derived(!!node && hasSql && !reason);
    let downloadReady = $derived(sqlReady && !!outputFormat);

    $effect(() => {
        if (!nodeUrl) {
            untrack(() => catalog.reset());
            return;
        }

        untrack(() => {
            if (node) void catalog.load(node);
        });
    });

    function downloadTitle(): string {
        if (downloadReady) return "";
        if (reason) return $t(reason);
        return $t("query.steps.incomplete");
    }
</script>

<QueryBuilderNodeSelector
    step={1}
    done={!!node}
    selected={node}
    missingUrl={missingNodeUrl}
    {nodesReady}
    onPick={onNodeChange}
/>

<hr />

<QueryBuilderStep
    step={2}
    done={sqlReady}
    title={$t("workbench.sql.stepTitle")}
    description={$t("workbench.sql.stepDescription")}
>
    {#snippet actions()}
        <span class="read-only" title={$t("workbench.sql.readOnlyTitle")}>
            <LockIcon size={14} />
            {$t("workbench.sql.readOnly")}
        </span>
    {/snippet}

    <div class="sql-step">
        <div class="catalog-box">
            <CatalogTree
                tree={catalog.tree}
                loading={catalog.loading}
                error={catalog.error}
                placeholder={node ? null : $t("workbench.sql.pickNode")}
                flatDefault
                loadColumns={async (ref) => {
                    if (!node) return [];
                    return catalog.loadColumns(node, ref);
                }}
                onInsert={(text) => editor?.insert(text)}
                onRefresh={() => {
                    if (node) void catalog.load(node, true);
                }}
            />
        </div>

        <div class="editor-box">
            <div class="editor-area">
                <SqlEditor
                    bind:this={editor}
                    tabId={blockId}
                    tabIds={blockIds}
                    value={sql}
                    {completions}
                    placeholder={$t("workbench.sql.placeholder")}
                    onChange={onSqlChange}
                    {onRun}
                />
            </div>

            <div class="editor-footer">
                {#if hasSql && reason}
                    <p class="footer-error" role="alert">
                        <TriangleAlertIcon size={16} />
                        <span>{$t(reason)}</span>
                    </p>
                {:else}
                    <p class="footer-hint">{$t("workbench.sql.accessHint")}</p>
                {/if}
                <kbd>{$t("workbench.sql.shortcut")}</kbd>
            </div>
        </div>
    </div>
</QueryBuilderStep>

<hr />

<QueryBuilderOutputFormatSelector
    step={3}
    done={!!outputFormat}
    bind:selected_output_format={() => outputFormat, (value) => onOutputFormatChange(value)}
/>

<hr />

<div class="builder-run">
    <DownloadDataButton
        downloadData={workbenchActions.downloadData}
        disabled={!downloadReady}
        title={downloadTitle()}
    />

    <VisualiseDataButton
        visualiseTable={workbenchActions.visualiseTable}
        visualiseChart={workbenchActions.visualiseChart}
        visualiseMap={workbenchActions.visualiseMap}
        disabled
        title={$t("workbench.sql.notYet")}
    />
</div>

<style lang="scss">
    hr {
        margin: 1rem 0;
    }

    .read-only {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: var(--font-size-sm);
        color: var(--muted-foreground);
    }

    // The tree and the editor share one height. The handle at the corner resizes both.
    .sql-step {
        display: grid;
        grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
        gap: 0.75rem;
        height: 22rem;
        min-height: 12rem;
        resize: vertical;
        overflow: hidden;

        @media (max-width: 767px) {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows: 12rem minmax(0, 1fr);
            height: 34rem;
        }
    }

    .catalog-box {
        min-height: 0;
        padding: 0.5rem;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
    }

    .editor-box {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        border: 1px solid var(--border);
        border-radius: 0.5rem;
        overflow: hidden;
    }

    .editor-area {
        flex: 1 1 auto;
        min-height: 0;

        // The box draws the border, so the editor draws none.
        :global(.sql-editor) {
            min-height: 0;
            border: 0;
            border-radius: 0;
        }
    }

    .editor-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-top: 1px solid var(--border);
        font-size: var(--font-size-sm);

        p {
            margin: 0;
        }

        kbd {
            flex-shrink: 0;
            padding: 0.125rem 0.375rem;
            border: 1px solid var(--border);
            border-radius: 0.25rem;
            font-family: inherit;
            font-size: var(--font-size-xs);
            color: var(--muted-foreground);
        }
    }

    .footer-hint {
        color: var(--muted-foreground);
    }

    .footer-error {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        color: var(--destructive);

        :global(svg) {
            flex-shrink: 0;
            margin-top: 0.125rem;
        }
    }

    // Align the buttons with the content of the steps, past the step number.
    .builder-run {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding-left: 2.5rem;
    }
</style>
