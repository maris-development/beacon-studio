<!--
 QueryBuilderPanes — the Build-mode content of the workbench.

 Two collapsible panes side by side:
   left  = table selection + parameter selection (the existing builder), or the SQL steps in SQL mode
   right = a live code preview of the active block's query (JSON, SQL, Python; Monaco, read-only),
           or the Preview with Run in SQL mode

 Both are driven by the active block in the QueryWorkspace:
   - builder edits -> onQueryChange -> workspace.updateActiveQuery (updates status,
     code preview and run-state)
   - switching blocks re-mounts the builder (keyed on activeBlockId) so it
     re-hydrates from that block's stored query (initialQuery).
-->
<script lang="ts">
    import { onMount } from "svelte";
    import Button from "$lib/components/buttons/Button.svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import DownloadIcon from "@lucide/svelte/icons/download";
    import BracesIcon from "@lucide/svelte/icons/braces";
    import DatabaseIcon from "@lucide/svelte/icons/database";
    import FileCodeCornerIcon from "@lucide/svelte/icons/file-code-corner";
    import ChevronRight from "@lucide/svelte/icons/chevron-right";
    import ChevronLeft from "@lucide/svelte/icons/chevron-left";
    import PlayIcon from "@lucide/svelte/icons/play";
    import SquareIcon from "@lucide/svelte/icons/square";
    import QueryBuilder from "./QueryBuilder.svelte";
    import QuerySqlBuilder from "./QuerySqlBuilder.svelte";
    import QuerySqlPreview from "./QuerySqlPreview.svelte";
    import QueryModeToggle from "./QueryModeToggle.svelte";
    import QueryTextEditor, {
        type CodeLanguage
    } from "@/components/query-editor/QueryTextEditor.svelte";
    import type { QueryDraft } from "@/query/draft";
    import type { CoordinatePair } from "@/geo/spatial-selection";
    import { QueryWorkspace } from "./QueryWorkspace.svelte";
    import type { QueryActions } from "./QueryActions";
    import type { BeaconNode, CompiledQuery } from "@/beacon-api/types";
    import { PythonQueryBuilder, SQLQueryBuilder } from "@/beacon-api/query";
    import * as QueryFunctions from "@/query/functions";
    import { defaultOutputFormat } from "@/query/draft";
    import { queryModeOf, sqlTextOf, type QueryMode } from "@/stores/stored-query";
    import { settings } from "@/stores/settings";
    import { t, type MessageKey } from "@/i18n";

    let { workspace, queryActions }: { workspace: QueryWorkspace; queryActions: QueryActions } =
        $props();

    // Independent collapse state for each pane.
    let leftOpen = $state(true);
    let rightOpen = $state(true);

    // Below this width the panes stack. Collapsing is off and both panes stay open.
    const NARROW_QUERY = "(max-width: 1024px)";
    let isNarrow = $state(false);

    $effect(() => {
        const narrowQuery = window.matchMedia(NARROW_QUERY);
        const onChange = (event: MediaQueryListEvent) => (isNarrow = event.matches);

        isNarrow = narrowQuery.matches;
        narrowQuery.addEventListener("change", onChange);

        return () => narrowQuery.removeEventListener("change", onChange);
    });

    // A pane is only collapsible on wide viewports.
    const showLeft = $derived(isNarrow || leftOpen);
    const showRight = $derived(isNarrow || rightOpen);

    const CODE_TAB_KEY = "beacon-studio.workbench.code-tab";

    const CODE_TABS: { id: CodeLanguage; label: MessageKey; icon: typeof BracesIcon }[] = [
        { id: "json", label: "workbench.code.json", icon: BracesIcon },
        { id: "sql", label: "workbench.code.sql", icon: DatabaseIcon },
        { id: "python", label: "workbench.code.python", icon: FileCodeCornerIcon }
    ];

    let codeTab = $state<CodeLanguage>("json");

    // Read the choice after the mount. A read at the module load reaches no
    // storage on a prerender.
    onMount(() => {
        const saved = localStorage.getItem(CODE_TAB_KEY);
        const tab = CODE_TABS.find((candidate) => candidate.id === saved);
        if (tab) codeTab = tab.id;
    });

    function selectTab(tab: CodeLanguage): void {
        codeTab = tab;
        localStorage.setItem(CODE_TAB_KEY, tab);
    }

    /**
     * The node of the active block. The builder re-mounts on a change of this
     * value, so its client is built once per node. See the key below.
     */
    const activeNode = $derived(workspace.activeNode);

    const activeQuery = $derived(QueryWorkspace.getQuery(workspace.activeBlock));

    const previewCode = $derived(codeFor(codeTab, activeQuery, activeNode));

    const sqlMode = $derived(queryModeOf(workspace.activeBlock) === "sql");
    const activeSql = $derived(sqlTextOf(workspace.activeBlock));
    const blockIds = $derived(workspace.blocks.map((block) => block.id));
    const outputFormat = $derived(
        workspace.activeBlock?.draft?.outputFormat ?? defaultOutputFormat()
    );
    const sqlReason = $derived(
        QueryWorkspace.blockReason(workspace.activeBlock, $settings.requireQueryFilters)
    );
    const previewOutcome = $derived(workspace.preview.outcomeOf(workspace.activeBlockId));
    const canRun = $derived(
        sqlMode && !!activeNode && activeSql.trim() !== "" && !sqlReason && !workspace.preview.busy
    );

    /** The reason that Run is off, as a tooltip. */
    function runTitle(): string {
        if (sqlReason) return $t(sqlReason);
        if (!activeNode) return $t("workbench.sql.pickNode");
        return $t("workbench.sql.shortcut");
    }

    /** Run the preview of the active SQL block. The preview applies the read-only guard again. */
    function runSql(): void {
        const block = workspace.activeBlock;
        const node = activeNode;
        if (!canRun || !block || !node) return;

        void workspace.preview.run(block.id, node, sqlTextOf(block), $settings.requireQueryFilters);
    }

    /** The workspace asks the user first when the block holds a query. */
    function handleModeSelect(mode: QueryMode): void {
        void workspace.setActiveMode(mode);
    }

    /** The node with a placeholder for its token, so the preview never shows the secret. */
    function withHiddenToken(node: BeaconNode | null): BeaconNode | null {
        if (node?.token) {
            return { ...node, token: "<your token>" };
        }

        return node;
    }

    /** The preview code of a query, or null when the query has no code in that language. */
    function codeFor(
        tab: CodeLanguage,
        query: CompiledQuery | null,
        node: BeaconNode | null
    ): string | null {
        if (!query) return null;

        try {
            if (tab === "sql") {
                return SQLQueryBuilder.toSQL(query);
            } else if (tab === "python") {
                return PythonQueryBuilder.toPythonCode(query, withHiddenToken(node));
            }

            return JSON.stringify(query, null, 2);
        } catch {
            // The Python code needs a node.
            return null;
        }
    }

    /** Copy the code of the active tab. The Python code gets the real token. */
    function copyCode(): void {
        if (codeTab === "sql") {
            void QueryFunctions.copySQL(queryActions.compileQuery);
        } else if (codeTab === "python") {
            void QueryFunctions.copyPython(
                queryActions.compileQuery,
                queryActions.getNode?.() ?? null
            );
        } else {
            void QueryFunctions.copyJSON(queryActions.compileQuery);
        }
    }

    /** Download the code of the active tab. The Python notebook gets the real token. */
    function downloadCode(): void {
        if (codeTab === "sql") {
            QueryFunctions.downloadSQL(queryActions.compileQuery);
        } else if (codeTab === "python") {
            QueryFunctions.downloadPython(
                queryActions.compileQuery,
                queryActions.getNode?.() ?? null
            );
        } else {
            QueryFunctions.downloadJSON(queryActions.compileQuery);
        }
    }

    /** Builder edits flow into the active block's draft. */
    function handleDraftChange(draft: QueryDraft, pair?: CoordinatePair | null) {
        workspace.updateActiveDraft(draft, pair);
    }

    /** Put a node on the active block. The workspace empties the draft. */
    function handleNodeChange(node: BeaconNode) {
        // The workspace asks the user first, so the call answers later.
        void workspace.setActiveNode(node);
    }

    /**
     * The node of the active block does not hold the query of a deep-link seed.
     * The workspace writes the message, because it knows whether the app guessed
     * that node. A share link can name no node.
     */
    function handleSeedMismatch(table: string, part: "table" | "columns") {
        const blockId = workspace.activeBlockId;
        if (!blockId) return;

        workspace.reportSeedMismatch(blockId, table, part);
    }
</script>

<div class="query-workbench-panes">
    <!-- Left: builder -->
    <section class="pane left" class:pane--collapsed={!showLeft}>
        <header class="pane-header">
            <h2 class="pane-title">
                {sqlMode ? $t("workbench.panes.sql") : $t("workbench.panes.builder")}
            </h2>
            {#if showLeft && workspace.activeBlock}
                <QueryModeToggle mode={sqlMode ? "sql" : "builder"} onSelect={handleModeSelect} />
            {/if}
            {#if !isNarrow}
                <Button
                    variant="ghost"
                    size="icon"
                    title={leftOpen
                        ? $t("workbench.panes.collapseBuilder")
                        : $t("workbench.panes.expandBuilder")}
                    onclick={() => (leftOpen = !leftOpen)}
                >
                    {#if leftOpen}
                        <ChevronLeft />
                    {:else}
                        <ChevronRight />
                    {/if}
                </Button>
            {/if}
        </header>

        {#if showLeft && sqlMode && workspace.activeBlock}
            <div class="pane-body">
                <QuerySqlBuilder
                    node={activeNode}
                    missingNodeUrl={workspace.missingNodeUrl}
                    nodesReady={workspace.nodesReady}
                    onNodeChange={handleNodeChange}
                    blockId={workspace.activeBlock.id}
                    {blockIds}
                    sql={activeSql}
                    onSqlChange={(id, sql) => workspace.updateBlockSql(id, sql)}
                    {outputFormat}
                    onOutputFormatChange={(format) => workspace.updateActiveOutputFormat(format)}
                    reason={sqlReason}
                    onRun={runSql}
                    workbenchActions={queryActions}
                />
            </div>
        {:else if showLeft}
            <div class="pane-body">
                <!--
					Re-mount per active block so the builder re-hydrates from its query.

					The node is part of the key. A new node needs a new client, new
					tables and a new schema. A re-mount drops the answers of the old
					node, so a slow load cannot write the tables of one node over the
					tables of another.
				-->
                {#key `${workspace.activeBlockId}:${activeNode?.url ?? ""}`}
                    <QueryBuilder
                        node={activeNode}
                        missingNodeUrl={workspace.missingNodeUrl}
                        nodesReady={workspace.nodesReady}
                        onNodeChange={handleNodeChange}
                        onSeedMismatch={handleSeedMismatch}
                        initialDraft={workspace.activeBlock?.draft ?? null}
                        pendingSeed={QueryWorkspace.seedFor(workspace.activeBlock)}
                        coordinateColumns={workspace.activeBlock?.coordinateColumns ?? null}
                        onDraftChange={handleDraftChange}
                        workbenchActions={queryActions}
                    />
                {/key}
            </div>
        {/if}
    </section>

    <!-- Right: code preview -->
    <section class="pane right" class:pane--collapsed={!showRight}>
        <header class="pane-header">
            {#if !isNarrow}
                <Button
                    variant="ghost"
                    size="icon"
                    title={sqlMode
                        ? rightOpen
                            ? $t("workbench.panes.collapsePreview")
                            : $t("workbench.panes.expandPreview")
                        : rightOpen
                          ? $t("workbench.panes.collapseCode")
                          : $t("workbench.panes.expandCode")}
                    onclick={() => (rightOpen = !rightOpen)}
                >
                    {#if rightOpen}
                        <ChevronRight />
                    {:else}
                        <ChevronLeft />
                    {/if}
                </Button>
            {/if}

            {#if sqlMode}
                <h2 class="pane-title">{$t("workbench.panes.preview")}</h2>

                {#if showRight}
                    <div class="preview-stats">
                        {#if activeSql.trim() !== "" && previewOutcome?.kind === "rows"}
                            <span
                                >{$t("common.rows", {
                                    count: previewOutcome.result.rows.length
                                })}</span
                            >
                            <span>
                                {$t("workbench.preview.duration", {
                                    ms: Math.round(previewOutcome.duration)
                                })}
                            </span>
                        {/if}
                    </div>

                    {#if workspace.preview.busy}
                        <Button
                            variant="destructive"
                            size="sm"
                            onclick={() => workspace.preview.stop()}
                        >
                            <SquareIcon />
                            {$t("workbench.preview.stop")}
                        </Button>
                    {:else}
                        <Button size="sm" disabled={!canRun} title={runTitle()} onclick={runSql}>
                            <PlayIcon />
                            {$t("workbench.preview.run")}
                        </Button>
                    {/if}
                {/if}
            {:else}
                <h2 class="pane-title">{$t("workbench.panes.code")}</h2>
            {/if}

            {#if showRight && !sqlMode}
                <div class="code-tabs" role="tablist" aria-label={$t("workbench.code.tabs")}>
                    {#each CODE_TABS as tab (tab.id)}
                        <button
                            type="button"
                            role="tab"
                            class="code-tab"
                            class:selected={tab.id === codeTab}
                            aria-selected={tab.id === codeTab}
                            onclick={() => selectTab(tab.id)}
                        >
                            <tab.icon size={14} />
                            <span>{$t(tab.label)}</span>
                        </button>
                    {/each}
                </div>

                <div class="code-actions">
                    <Button
                        variant="ghost"
                        size="sm"
                        title={$t("workbench.code.copyTitle")}
                        disabled={!previewCode}
                        onclick={copyCode}
                    >
                        <CopyIcon />
                        {$t("workbench.code.copy")}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        title={$t("workbench.code.downloadTitle")}
                        aria-label={$t("workbench.code.downloadTitle")}
                        disabled={!previewCode}
                        onclick={downloadCode}
                    >
                        <DownloadIcon />
                    </Button>
                </div>
            {/if}
        </header>

        {#if showRight && sqlMode}
            <div class="pane-body">
                <QuerySqlPreview outcome={previewOutcome} hasSql={activeSql.trim() !== ""} />
            </div>
        {:else if showRight}
            <div class="pane-body">
                {#if previewCode}
                    <!-- Stacked panes have no height to fill, so the editor sets its own. -->
                    <QueryTextEditor
                        sourceCode={previewCode}
                        language={codeTab}
                        height={isNarrow ? "50dvh" : "100%"}
                        readOnly
                    />
                {:else}
                    <div class="code-empty">
                        <BracesIcon size={32} />
                        <strong>{$t("workbench.code.emptyTitle")}</strong>
                        <p>{$t("workbench.code.emptyText")}</p>
                    </div>
                {/if}
            </div>
        {/if}
    </section>
</div>

<style lang="scss">
    .query-workbench-panes {
        display: flex;
        gap: 1rem;
        align-items: stretch;

        @media (max-width: 1024px) {
            flex-direction: column;
            align-items: flex-start;

            > .pane {
                width: 100%;
            }
        }
    }

    .pane {
        flex-grow: 1;
        flex-shrink: 1;
        flex-basis: auto;
        width: 50%;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: white;
        border-radius: 0.75rem;
        border: 1px solid rgb(231, 231, 236);
        max-width: 100%;
        min-height: 100%;

        // A collapsed pane shrinks to just its header so the other pane expands.
        &.pane--collapsed {
            flex: 0 0 auto;
            width: auto;

            .pane-header {
                border-bottom: none;
                flex-direction: column-reverse;

                .pane-title {
                    writing-mode: sideways-lr;
                    text-orientation: mixed;
                    white-space: nowrap;
                    width: auto;
                }
            }

            // The chevron comes first in the right header, so no reverse here.
            &.right .pane-header {
                flex-direction: column;
            }
        }

        .pane-header {
            border-bottom: 1px solid var(--border);
            padding: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;

            .pane-title {
                margin: 0;
                flex-grow: 1;
            }
        }

        &.right .pane-header .pane-title {
            flex-grow: 0;
        }

        .code-tabs {
            display: flex;
            flex-grow: 1;
            align-self: stretch;
            gap: 0.25rem;
            min-width: 0;
            // The tabs reach the header border, so the underline sits on it.
            margin-block: -0.75rem calc(-0.75rem - 1px);

            .code-tab {
                display: flex;
                align-items: center;
                gap: 0.375rem;
                padding: 0 0.75rem;
                border: 0;
                border-bottom: 2px solid transparent;
                background: none;
                color: var(--muted-foreground);
                cursor: pointer;

                &:hover {
                    color: var(--foreground);
                }

                &.selected {
                    color: var(--primary);
                    border-bottom-color: var(--primary);
                }
            }
        }

        .preview-stats {
            display: flex;
            flex-grow: 1;
            gap: 0.75rem;
            min-width: 0;
            font-size: var(--font-size-sm);
            color: var(--muted-foreground);
        }

        .code-actions {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            color: var(--muted-foreground);
        }

        .pane-body {
            min-width: 0;
            // height: 100%;
            flex: 1 1 auto;
            padding: 0.75rem;
        }

        .code-empty {
            height: 100%;
            min-height: 20rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            text-align: center;
            color: var(--muted-foreground);

            strong {
                color: var(--foreground);
            }

            p {
                margin: 0;
            }
        }
    }
</style>
