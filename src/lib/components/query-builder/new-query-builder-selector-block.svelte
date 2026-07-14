<!-- Top-level query "blocks" manager.
   page -> new-query-builder-selector-block -> new-query-builder-table-block -> new-query-builder-parameter-block

 Each block is an independent query draft. Selecting a block makes it the active
 query whose parameters are edited in the table/parameter blocks below. -->

<script lang="ts">
    import { Button } from '$lib/components/ui/button/index.js';
    import { Badge } from '$lib/components/ui/badge/index.js';
    import PlusIcon from '@lucide/svelte/icons/plus';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import XIcon from '@lucide/svelte/icons/x';
    import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
    import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
    import NewQueryBuilderTableBlock from './new-query-builder-table-block.svelte';
    import {
        makeEmptyQuerySelectionStatus,
        type QuerySelectionStatus
    } from './query-selection-status';
    import {
        makeEmptyQuerySelectionActions,
        type QuerySelectionActions
    } from './query-selection-actions';

    type QueryBlock = {
        id: string;
        name: string;
        status: QuerySelectionStatus;
        actions: QuerySelectionActions;
        // TODO: wire these once table/parameter blocks report back per-block query state.
        selectedColumns: string[];
        rows: number | null;
        hasRun: boolean;
    };

    const COLUMN_PREVIEW_LIMIT = 3;

    let blockCounter = 0;

    function nextBlockName(): string {
        blockCounter += 1;
        return `Query ${blockCounter}`;
    }

    function createId(): string {
        if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
            return crypto.randomUUID();
        }
        return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function createBlock(): QueryBlock {
        return {
            id: createId(),
            name: nextBlockName(),
            status: makeEmptyQuerySelectionStatus(),
            actions: makeEmptyQuerySelectionActions(),
            selectedColumns: [],
            rows: null,
            hasRun: false
        };
    }

    let blocks = $state<QueryBlock[]>([createBlock()]);
    let activeBlockId = $state<string>(blocks[0].id);

    // Index of the active block; used so the table-block below can bind directly
    // into blocks[activeIndex].status / .actions.
    const activeIndex = $derived.by(() => {
        const index = blocks.findIndex((block) => block.id === activeBlockId);
        return index === -1 ? 0 : index;
    });

    function selectBlock(id: string) {
        activeBlockId = id;
    }

    function addBlock() {
        const block = createBlock();
        blocks.push(block);
        activeBlockId = block.id;
    }

    function duplicateBlock(id: string, event: MouseEvent) {
        event.stopPropagation();

        const index = blocks.findIndex((block) => block.id === id);
        if (index === -1) {
            return;
        }

        const source = blocks[index];
        const copy: QueryBlock = {
            id: createId(),
            name: `${source.name} (copy)`,
            status: { ...source.status },
            actions: makeEmptyQuerySelectionActions(),
            selectedColumns: [...source.selectedColumns],
            rows: source.rows,
            hasRun: source.hasRun
        };

        blocks.splice(index + 1, 0, copy);
        activeBlockId = copy.id;
    }

    function closeBlock(id: string, event: MouseEvent) {
        event.stopPropagation();

        // Always keep at least one block.
        if (blocks.length === 1) {
            return;
        }

        const index = blocks.findIndex((block) => block.id === id);
        if (index === -1) {
            return;
        }

        blocks.splice(index, 1);

        if (activeBlockId === id) {
            const fallback = blocks[index] ?? blocks[index - 1] ?? blocks[0];
            activeBlockId = fallback.id;
        }
    }

    function handleBlockKeydown(id: string, event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectBlock(id);
        }
    }
</script>

<div class="query-blocks">
    <div class="query-blocks-row">
        {#each blocks as block (block.id)}
            <div
                class="query-block"
                class:query-block--active={block.id === activeBlockId}
                role="button"
                tabindex="0"
                aria-pressed={block.id === activeBlockId}
                onclick={() => selectBlock(block.id)}
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
                            onclick={(event) => duplicateBlock(block.id, event)}
                        >
                            <CopyIcon />
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            class="query-block-icon-button"
                            title="Close query"
                            aria-label="Close query"
                            disabled={blocks.length === 1}
                            onclick={(event) => closeBlock(block.id, event)}
                        >
                            <XIcon />
                        </Button>
                    </div>
                </div>

                <div class="query-block-body">
                    <div class="query-block-line">
                        <span class="query-block-label">Table</span>
                        <span class="query-block-value" title={block.status.dataTable}>
                            {block.status.dataTable || 'No table'}
                        </span>
                    </div>

                    <div class="query-block-line">
                        <span class="query-block-label">Columns</span>
                        <span class="query-block-value">{block.status.columns} selected</span>
                    </div>

                    <div class="query-block-columns">
                        {#if block.selectedColumns.length > 0}
                            {#each block.selectedColumns.slice(0, COLUMN_PREVIEW_LIMIT) as column (column)}
                                <Badge variant="secondary">{column}</Badge>
                            {/each}
                            {#if block.selectedColumns.length > COLUMN_PREVIEW_LIMIT}
                                <Badge variant="outline">
                                    +{block.selectedColumns.length - COLUMN_PREVIEW_LIMIT}
                                </Badge>
                            {/if}
                        {:else}
                            <span class="query-block-muted">No columns selected</span>
                        {/if}
                    </div>

                    <div class="query-block-line">
                        <span class="query-block-label">Rows</span>
                        <span class="query-block-value">{block.rows ?? '—'}</span>
                    </div>

                    <div class="query-block-status">
                        {#if block.hasRun}
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
            onclick={addBlock}
        >
            <PlusIcon />
        </button>
    </div>

    <!-- Active query's builder. Keyed on the active id so switching blocks
         re-initialises the table/parameter blocks for that query.
         TODO: persist per-block query params by passing/reading an initialQuery
         through the table/parameter blocks. -->
    {#key activeBlockId}
        <NewQueryBuilderTableBlock
            bind:status={blocks[activeIndex].status}
            bind:actions={blocks[activeIndex].actions}
        />
    {/key}
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