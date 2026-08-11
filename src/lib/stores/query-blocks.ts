/**
 * Workbench blocks are the open query tabs in the builder. The app persists
 * them. Therefore a reload restores the same workspace.
 *
 * Blocks are {@link StoredQuery} records, like saved queries and history
 * entries. Two things make them blocks: they keep an order, and the workspace
 * marks one of them active. That order and that selection are properties of the
 * list, not of a query. Therefore they live in a small separate store here.
 *
 * A block with a null `draft` and a set `compiled` comes from a share link or
 * from the JSON editor. The builder fills the draft from `compiled` after the
 * table schema loads. From that point the draft is the source of truth. The
 * condition to fill the draft one time is `draft === null`. Therefore blocks no
 * longer need a separate `pendingSeed` field.
 */

import { get } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import { createQueryCollection } from '@/stores/query-collection';
import type { StoredQuery } from '@/stores/stored-query';

/** The persisted list of open workbench blocks, in display order. */
export const queryBlocks = createQueryCollection({
	storageKey: 'beacon-query-library.blocks',
	role: 'block',
	identity: 'id'
});

/** The selection state and the name counter for the block list. */
export interface QueryBlocksState {
	activeBlockId: string | null;
	/** The counter for default block names ("Query 1", "Query 2", …). It only grows. */
	counter: number;
}

export const queryBlocksState = persisted<QueryBlocksState>('beacon-query-library.blocks-state', {
	activeBlockId: null,
	counter: 0
});

export function getBlocksState(): QueryBlocksState {
	return get(queryBlocksState);
}

export function setActiveBlockId(id: string | null): void {
	queryBlocksState.update((state) => ({ ...state, activeBlockId: id }));
}

/** Add 1 to the name counter and return the new value. */
export function nextBlockNumber(): number {
	const next = getBlocksState().counter + 1;
	queryBlocksState.update((state) => ({ ...state, counter: next }));
	return next;
}

/** Hold the counter at `value` or higher. The app calls this when it restores state. */
export function ensureBlockCounter(value: number): void {
	queryBlocksState.update((state) => ({ ...state, counter: Math.max(state.counter, value) }));
}

/** True when the builder must still fill the draft of a block from its compiled query. */
export function needsDraftSeed(block: StoredQuery | null | undefined): boolean {
	return !!block && block.draft === null && block.compiled !== null;
}
