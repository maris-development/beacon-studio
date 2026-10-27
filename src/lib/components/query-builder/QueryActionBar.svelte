<script lang="ts">
    import Button from "$lib/components/buttons/Button.svelte";
    import type { QueryActions } from "@/components/query-builder/QueryActions";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import * as QueryFunctions from "@/query/functions";
    import CacheInfoModal from "@/components/modals/CacheInfoModal.svelte";
    import SavedQueriesModal from "@/components/queries/SavedQueriesModal.svelte";
    import QueryHistoryModal from "@/components/queries/QueryHistoryModal.svelte";
    import DownloadDataButton from "../buttons/DownloadDataButton.svelte";
    import VisualiseDataButton from "../buttons/VisualiseDataButton.svelte";
    // icons
    import ShareIcon2 from "@lucide/svelte/icons/share-2";
    import SaveIcon from "@lucide/svelte/icons/save";
    import ResetIcon from "@lucide/svelte/icons/refresh-ccw";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import JsonIcon from "@lucide/svelte/icons/file-json-2";
    import PythonIcon from "@lucide/svelte/icons/file-code-corner";
    import SQLIcon from "@lucide/svelte/icons/database";
    import UrlIcon from "@lucide/svelte/icons/link-2";
    import InfoIcon from "@lucide/svelte/icons/info";
    import PencilIcon from "@lucide/svelte/icons/pencil";
    import BookmarkIcon from "@lucide/svelte/icons/bookmark";
    import HistoryIcon from "@lucide/svelte/icons/history";
    import { settings } from "@/stores/settings";
    import { savedQueries } from "@/stores/saved-queries";
    import type { StoredQuery } from "@/stores/stored-query";
    import { t } from "@/i18n";

    let { queryActions }: { queryActions: QueryActions } = $props();

    /**
     * The reason that the active query must not run, or null. A SQL query always
     * gets the read-only check, so the switch alone does not clear it.
     *
     * The switch is read here as well. `runBlockReason` reads a snapshot of the
     * settings, so without this read the bar keeps its state after the user turns
     * the safeguard off on the settings page.
     */
    const blockReason = $derived.by(() => {
        void $settings.requireQueryFilters;
        return queryActions.runBlockReason?.() ?? null;
    });

    /** True in SQL mode. The JSON and Python exports need a builder query. */
    const sqlMode = $derived(queryActions.getMode?.() === "sql");

    /** The hint on the exports that SQL mode disables. */
    const builderOnlyHint = $derived.by(() => {
        if (!sqlMode) return undefined;
        return $t("workbench.sql.builderOnly");
    });

    /** Copy the SQL: the text of a SQL block, or the SQL form of a builder query. */
    function copySql(): void {
        if (sqlMode) {
            void QueryFunctions.copySqlText(queryActions.getSql?.() ?? "");
        } else {
            void QueryFunctions.copySQL(queryActions.compileQuery);
        }
    }

    /** Download the SQL as a file. See {@link copySql}. */
    function downloadSql(): void {
        if (sqlMode) {
            QueryFunctions.downloadSqlText(queryActions.getSql?.() ?? "");
        } else {
            QueryFunctions.downloadSQL(queryActions.compileQuery);
        }
    }

    let showingCacheInfoModal = $state(false);

    function showCacheInfoModal(): void {
        showingCacheInfoModal = true;
    }

    function closeCacheInfoModal(): void {
        showingCacheInfoModal = false;
    }

    let showingSavedModal = $state(false);
    let showingHistoryModal = $state(false);

    /** Load the entry on this page, and close the list. */
    function openStoredQuery(entry: StoredQuery): void {
        queryActions.openStoredQuery?.(entry);
        showingSavedModal = false;
        showingHistoryModal = false;
    }
</script>

{#if showingCacheInfoModal}
    <CacheInfoModal onClose={() => closeCacheInfoModal()} />
{/if}

{#if showingSavedModal}
    <SavedQueriesModal onOpen={openStoredQuery} onClose={() => (showingSavedModal = false)} />
{/if}

{#if showingHistoryModal}
    <QueryHistoryModal onOpen={openStoredQuery} onClose={() => (showingHistoryModal = false)} />
{/if}

<div class="query-action-bar">
    <div class="query-action-group">
        <DownloadDataButton
            downloadData={queryActions.downloadData}
            disabled={!!blockReason}
            title={blockReason ? $t(blockReason) : ""}
        />

        {#if queryActions.editQuery}
            <Button onclick={queryActions.editQuery} title={$t("query.actions.editTitle")}>
                <PencilIcon />
                {$t("query.actions.edit")}
            </Button>
        {:else}
            <VisualiseDataButton
                visualiseTable={queryActions.visualiseTable}
                visualiseChart={queryActions.visualiseChart}
                visualiseMap={queryActions.visualiseMap}
                disabled={!!blockReason}
                title={blockReason ? $t(blockReason) : ""}
            />
        {/if}

        <!-- dropdown for copy options -->
        {#if queryActions.compileQuery}
            <!-- Add name of active query on top of dropdown -->
            <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                    <Button variant="outline">
                        <ShareIcon2 />
                        {$t("query.actions.share")}
                    </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content class="w-48">
                    <DropdownMenu.Item
                        onclick={() =>
                            QueryFunctions.copyUrl(queryActions.getShareableQuery?.() ?? null)}
                    >
                        <UrlIcon class="text-muted-foreground" />
                        <span>{$t("query.actions.shareUrl")}</span>
                    </DropdownMenu.Item>

                    <!-- A disabled item gets no hover events, so the wrapper holds the hint. -->
                    <span class="menu-hint" title={builderOnlyHint}>
                        <DropdownMenu.Item
                            disabled={sqlMode}
                            onclick={() => QueryFunctions.copyJSON(queryActions.compileQuery)}
                        >
                            <CopyIcon class="text-muted-foreground" />
                            <span>{$t("query.actions.copyJson")}</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                            disabled={sqlMode}
                            onclick={() =>
                                QueryFunctions.copyPython(
                                    queryActions.compileQuery,
                                    queryActions.getNode?.() ?? null
                                )}
                        >
                            <CopyIcon class="text-muted-foreground" />
                            <span>{$t("query.actions.copyPython")}</span>
                        </DropdownMenu.Item>
                    </span>

                    <DropdownMenu.Item onclick={copySql}>
                        <CopyIcon class="text-muted-foreground" />
                        <span>{$t("query.actions.copySql")}</span>
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator />

                    <span class="menu-hint" title={builderOnlyHint}>
                        <DropdownMenu.Item
                            disabled={sqlMode}
                            onclick={() => QueryFunctions.downloadJSON(queryActions.compileQuery)}
                        >
                            <JsonIcon class="text-muted-foreground" />
                            <span>{$t("query.actions.downloadJson")}</span>
                        </DropdownMenu.Item>

                        <DropdownMenu.Item
                            disabled={sqlMode}
                            onclick={() =>
                                QueryFunctions.downloadPython(
                                    queryActions.compileQuery,
                                    queryActions.getNode?.() ?? null
                                )}
                        >
                            <PythonIcon class="text-muted-foreground" />
                            <span>{$t("query.actions.downloadPython")}</span>
                        </DropdownMenu.Item>
                    </span>

                    <DropdownMenu.Item onclick={downloadSql}>
                        <SQLIcon class="text-muted-foreground" />
                        <span>{$t("query.actions.downloadSql")}</span>
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        {/if}

        {#if queryActions.saveQuery}
            <Button
                variant="outline"
                onclick={queryActions.saveQuery}
                title={$t("query.actions.saveTitle")}
            >
                <SaveIcon />
                {$t("query.actions.save")}
            </Button>
        {/if}

        {#if queryActions.openStoredQuery}
            <Button
                variant="outline"
                onclick={() => (showingSavedModal = true)}
                title={$t("saved.title")}
            >
                <BookmarkIcon />
                {$t("query.actions.saved", { count: $savedQueries.length })}
            </Button>

            <Button
                variant="outline"
                onclick={() => (showingHistoryModal = true)}
                title={$t("history.title")}
            >
                <HistoryIcon />
                {$t("query.actions.history")}
            </Button>
        {/if}

        <Button
            onclick={queryActions.resetQuery}
            variant="destructive"
            title={$t("query.actions.resetTitle")}
        >
            <ResetIcon />
            {$t("common.reset")}
        </Button>

        <Button
            variant="outline"
            onclick={() => showCacheInfoModal()}
            title={$t("query.actions.cacheInfo")}
        >
            <InfoIcon />
        </Button>
    </div>
</div>

<style lang="scss">
    .query-action-bar {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .query-action-group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .menu-hint {
        display: block;
    }
</style>
