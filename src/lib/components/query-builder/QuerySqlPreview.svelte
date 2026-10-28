<!--
	The Preview pane of a SQL query: the first rows of the result, or the state of the run.
-->
<script lang="ts">
    import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";
    import ResultGrid from "@/components/sql-editor/ResultGrid.svelte";
    import { PREVIEW_ROW_LIMIT } from "@/sql/run";
    import type { SqlOutcome } from "./SqlPreview.svelte";
    import { t } from "@/i18n";

    let {
        outcome,
        hasSql
    }: {
        /** The last run of the block, or null. */
        outcome: SqlOutcome | null;
        /** False while the editor is empty. The pane then explains what to do. */
        hasSql: boolean;
    } = $props();
</script>

{#if !outcome || !hasSql}
    <div class="preview-empty">
        <SquareTerminalIcon size={32} />
        <strong>{$t("workbench.preview.emptyTitle")}</strong>
        <p>{$t("workbench.preview.emptyText")}</p>
    </div>
{:else if outcome.kind === "error"}
    <div class="error-block" role="alert">
        <pre>{$t(outcome.message)}</pre>
    </div>
{:else if outcome.kind === "notice"}
    <p class="notice">{$t(outcome.message)}</p>
{:else}
    {#if outcome.kind === "rows"}
        {@const result = outcome.result}
        {#if result.cancelled && result.rows.length > 0}
            <p class="notice">{$t("sqlEditor.result.stoppedPartial")}</p>
        {:else if result.cancelled}
            <p class="notice">{$t("sqlEditor.result.stopped")}</p>
        {:else if result.rows.length === 0}
            <p class="notice">{$t("sqlEditor.result.noRows")}</p>
        {:else if result.truncated}
            <p class="notice">
                {$t("sqlEditor.result.truncated", { count: PREVIEW_ROW_LIMIT })}
            </p>
        {/if}
    {/if}

    <div class="grid">
        <ResultGrid
            numbered
            columns={outcome.kind === "rows" ? outcome.result.columns : []}
            types={outcome.kind === "rows" ? outcome.result.types : []}
            rows={outcome.kind === "rows" ? outcome.result.rows : []}
            loading={outcome.kind === "busy"}
        />
    </div>
{/if}

<style lang="scss">
    .preview-empty {
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

    .grid {
        min-width: 0;
        overflow: auto;
    }

    .notice {
        margin: 0 0 0.5rem;
        color: var(--muted-foreground);
    }

    .error-block {
        padding: 0.75rem;
        border: 1px solid var(--destructive);
        border-radius: 0.5rem;
        color: var(--destructive);

        pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
    }
</style>
