<!-- Query "blocks" selector row.

1 block per query, displaying table, columns, filters, rows and run state.
add new query blocks, duplicate blocks, close clocks, select active blocks
 -->

<script lang="ts">
    import { Button } from '$lib/components/ui/button/index.js';
    import { Badge } from '$lib/components/ui/badge/index.js';
    import PlusIcon from '@lucide/svelte/icons/plus';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import XIcon from '@lucide/svelte/icons/x';
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
    import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
    import type { QueryWorkspace } from './query-workspace.svelte';

    // All state lives in the workspace; this component only reads/acts on it.
    let { workspace }: { workspace: QueryWorkspace } = $props();

    const COLUMN_PREVIEW_LIMIT = 3;

    function handleBlockKeydown(id: string, event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            workspace.selectBlock(id);
        }
    }
</script>

<div class="query-blocks">
    <div class="query-blocks-row">
        {#each workspace.blocks as block (block.id)}
            <!-- Derive display data for this block from the workspace. -->
            {@const status = workspace.statusFor(block)}
            {@const columns = workspace.selectedColumnsFor(block)}
            {@const run = workspace.runStateFor(block)}
            <div
                class="query-block"
                class:query-block--active={block.id === workspace.activeBlockId}
                role="button"
                tabindex="0"
                aria-pressed={block.id === workspace.activeBlockId}
                onclick={() => workspace.selectBlock(block.id)}
                onkeydown={(event) => handleBlockKeydown(block.id, event)}
            >
                <div class="query-block-header">
                    <span class="query-block-name" title={block.name}>{block.name}</span>

                    <div class="query-block-actions">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="query-block-icon-button"
                            title="Duplicate query"
                            aria-label="Duplicate query"
                            onclick={(event) => {
                                event.stopPropagation();
                                workspace.duplicateBlock(block.id);
                            }}
                        >
                            <CopyIcon />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            class="query-block-icon-button"
                            title="Close query"
                            aria-label="Close query"
                            disabled={workspace.blocks.length === 1}
                            onclick={(event) => {
                                event.stopPropagation();
                                workspace.closeBlock(block.id);
                            }}
                        >
                            <XIcon />
                        </Button>
                    </div>
                </div>

                <div class="query-block-body">
                    <div class="query-block-line">
                        <span class="query-block-label">Table</span>
                        <span class="query-block-value" title={status.dataTable}>
                            {status.dataTable || 'No table'}
                        </span>
                    </div>

                    <div class="query-block-line">
                        <span class="query-block-label">Columns</span>
                        <span class="query-block-value">{status.columns} selected</span>
                    </div>

                    <div class="query-block-columns">
                        {#if columns.length > 0}
                            {#each columns.slice(0, COLUMN_PREVIEW_LIMIT) as column (column)}
                                <Badge variant="secondary">{column}</Badge>
                            {/each}
                            {#if columns.length > COLUMN_PREVIEW_LIMIT}
                                <Badge variant="outline">
                                    +{columns.length - COLUMN_PREVIEW_LIMIT}
                                </Badge>
                            {/if}
                        {:else}
                            <span class="query-block-muted">No columns selected</span>
                        {/if}
                    </div>

                    <div class="query-block-line">
                        <span class="query-block-label">Rows</span>
                        <span class="query-block-value">{run.rows ?? '—'}</span>
                    </div>

                    <div class="query-block-status">
                        {#if run.isRunning}
                            <CircleDashedIcon class="query-block-status-icon" />
                            <span>Running…</span>
                        {:else if run.hasRun}
                            <CircleCheckIcon class="query-block-status-icon query-block-status-icon--ok" />
                            <span>Query ran</span>
                        {:else}
                            <CircleDashedIcon class="query-block-status-icon" />
                            <span>Not run yet</span>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}

        <button
            type="button"
            class="query-block-add"
            title="New query"
            aria-label="New query"
            onclick={() => workspace.addBlock()}
        >
            <PlusIcon />
        </button>
    </div>
</div>

<style lang="scss">
    .query-blocks {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .query-blocks-row {
        display: flex;
        align-items: stretch;
        gap: 0.75rem;
        overflow-x: auto;
        padding-bottom: 0.25rem;
    }

    .query-block {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 15rem;
        max-width: 18rem;
        padding: 0.75rem;
        border: 1px solid var(--border);
        border-radius: var(--radius, 0.5rem);
        background: var(--card, transparent);
        cursor: pointer;
        transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;
    }

    .query-block:hover {
        border-color: var(--primary);
    }

    .query-block--active {
        border-color: var(--primary);
        box-shadow: 0 0 0 1px var(--primary);
    }

    .query-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .query-block-name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .query-block-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-shrink: 0;
    }

    :global(.query-block-icon-button) {
        width: 1.75rem;
        height: 1.75rem;
    }

    .query-block-body {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        font-size: 0.8125rem;
    }

    .query-block-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .query-block-label {
        color: var(--muted-foreground);
    }

    .query-block-value {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .query-block-columns {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        min-height: 1.5rem;
    }

    .query-block-muted {
        color: var(--muted-foreground);
    }

    .query-block-status {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        color: var(--muted-foreground);
    }

    :global(.query-block-status-icon) {
        width: 1rem;
        height: 1rem;
    }

    :global(.query-block-status-icon--ok) {
        color: var(--primary);
    }

    .query-block-add {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 3rem;
        border: 1px dashed var(--border);
        border-radius: var(--radius, 0.5rem);
        background: transparent;
        cursor: pointer;
        transition:
            border-color 0.15s ease,
            color 0.15s ease;
    }

    .query-block-add:hover {
        border-color: var(--primary);
        color: var(--primary);
    }
</style>