/**
 * QueryWorkspace — single source of truth for the combined query builder +
 * visualiser page. Holds the list of "query blocks" (independent query drafts),
 * tracks which one is active, and derives badge-status + run-state per block.
 *
 * Each block owns a {@link QueryDraft} — the builder's editable state (table,
 * selected columns, filters, output format). That draft is the source of truth:
 * the CompiledQuery used for the JSON view, the run request and downloads is
 * always *derived* from it via {@link compileDraft}. Switching between blocks
 * restores the exact draft, so a block is never reset just by selecting it.
 *
 * Data flow:
 *   builder edit -> updateActiveDraft(draft) -> block.draft
 *   block.draft  -> queryFor()/statusFor()   -> JSON view + action bar + cards
 */
import type { CompiledQuery } from '@/beacon-api/types';
import { Utils } from '@/utils';
import { persisted } from 'svelte-local-storage-store';
import { get } from 'svelte/store';
import {
	makeEmptyQuerySelectionStatus,
	type QuerySelectionStatus
} from './QuerySelectionStatus';
import { compileDraft, makeEmptyDraft, type QueryDraft } from './QueryDraft';

export type QueryBlock = {
	id: string;
	name: string;
	/** Builder state for this block (table, columns, filters, output). */
	draft: QueryDraft;
	/**
	 * One-time CompiledQuery to hydrate the draft from once the schema loads
	 * (used for URL deep-links). Cleared as soon as the builder emits a draft.
	 */
	pendingSeed: CompiledQuery | null;
};

type PersistedQueryWorkspaceState = {
	blocks: QueryBlock[];
	activeBlockId: string | null;
	counter: number;
};

const EMPTY_WORKSPACE_STATE: PersistedQueryWorkspaceState = {
	blocks: [],
	activeBlockId: null,
	counter: 0
};

const persistedWorkspaceState = persisted<PersistedQueryWorkspaceState>(
	'query-builder-workspace-state',
	EMPTY_WORKSPACE_STATE
);

/** Small run/cache summary used by the block cards. */
export type BlockRunState = {
	hasRun: boolean;
	rows: number | null;
	isRunning: boolean;
};

function createId(): string {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class QueryWorkspace {
	/** All query drafts shown in the selector row. */
	blocks = $state<QueryBlock[]>([]);
	/** Currently edited/visualised block id. */
	activeBlockId = $state<string | null>(null);

	/** Per-block run result (presence = "has been run"), keyed by block id. */
	private runInfo = $state<Record<string, { rows: number }>>({});
	/** Per-block "currently running" flag, keyed by block id. */
	private running = $state<Record<string, boolean>>({});

	/** Monotonic counter used only for default block names. */
	private counter = 0;

	constructor(seedQuery: CompiledQuery | null = null) {
		if (seedQuery) {
			this.seedFromQuery(seedQuery);
			return;
		}

		this.loadPersistedState();
	}

	/** The active block object (or null). */
	get activeBlock(): QueryBlock | null {
		return this.blocks.find((b) => b.id === this.activeBlockId) ?? null;
	}

	/** Adds a new empty block and selects it. */
	addBlock(name?: string): QueryBlock {
		this.counter += 1;
		const block: QueryBlock = {
			id: createId(),
			name: name ?? `Query ${this.counter}`,
			draft: makeEmptyDraft(),
			pendingSeed: null
		};
		this.blocks.push(block);
		this.activeBlockId = block.id;
		this.persistState();
		return block;
	}

	/** Adds a saved query as a NEW block and selects it (action bar: saved queries). */
	addFromSavedQuery(query: CompiledQuery, name?: string): QueryBlock {
		this.counter += 1;
		const block: QueryBlock = {
			id: createId(),
			name: name ?? `Query ${this.counter}`,
			draft: {
				...makeEmptyDraft(),
				tableName: typeof query.from === 'string' ? query.from : ''
			},
			pendingSeed: Utils.cloneObject(query)
		};
		this.blocks.push(block);
		this.activeBlockId = block.id;
		this.persistState();
		return block;
	}

	/** Inserts an independent copy after the source block and selects it. */
	duplicateBlock(id: string): void {
		const index = this.blocks.findIndex((b) => b.id === id);
		if (index === -1) return;

		const source = this.blocks[index];
		this.counter += 1;
		const copy: QueryBlock = {
			id: createId(),
			name: `${source.name} (copy)`,
			draft: Utils.cloneObject(source.draft),
			pendingSeed: source.pendingSeed ? Utils.cloneObject(source.pendingSeed) : null
		};
		this.blocks.splice(index + 1, 0, copy);
		this.activeBlockId = copy.id;
		this.persistState();
	}

	/** Removes a block, keeping at least one and fixing up the active selection. */
	closeBlock(id: string): void {
		if (this.blocks.length === 1) return;

	

		const index = this.blocks.findIndex((b) => b.id === id);
		
		if (index === -1) return;

		if(this.blocks[index].draft.selectedFields.length > 0) {
			const shouldContinue = confirm('Are you sure you want to close this query?');
			if (!shouldContinue) return;
		}

		this.blocks.splice(index, 1);

		if (this.activeBlockId === id) {
			const fallback = this.blocks[index] ?? this.blocks[index - 1] ?? this.blocks[0];
			this.activeBlockId = fallback.id;
		}

		this.persistState();
	}

	selectBlock(id: string): void {
		this.activeBlockId = id;
		this.persistState();
		console.log('Selecting block', id, this.blocks.find((b) => b.id === id)?.draft);
	}

	/**
	 * Writes the builder draft into the active block (called on every builder
	 * edit). Clears the one-time seed and invalidates the block's run result.
	 */
	updateActiveDraft(draft: QueryDraft): void {
		const block = this.activeBlock;
		if (!block) return;

		const currentDraftKey = JSON.stringify(block.draft);
		const nextDraftKey = JSON.stringify(draft);
		if (currentDraftKey === nextDraftKey && block.pendingSeed === null) {
			return;
		}

		block.draft = draft;
		block.pendingSeed = null;
		this.invalidateRun(block.id);
		this.persistState();
	}

	/** Compiles a block's draft into the runnable/JSON query (null if incomplete). */
	static getQuery(block: QueryBlock | null): CompiledQuery | null {
		return compileDraft(block?.draft);
	}

	/** Reset button — clears the active block back to an empty draft. */
	resetActive(): void {
		const block = this.activeBlock;
		if (!block) return;
		block.draft = makeEmptyDraft();
		block.pendingSeed = null;
		this.invalidateRun(block.id);
		this.persistState();
	}

	/** Derives badge status (table, #columns, #filters) from a block's draft. */
	static getStatus(block: QueryBlock | null): QuerySelectionStatus {
		const status = makeEmptyQuerySelectionStatus();
		const draft = block?.draft;
		if (!draft) return status;

		status.dataTable = draft.tableName ?? '';
		status.columns = draft.selectedFields.length;
		status.selection = status.columns;
		status.filters = draft.selectedFields.reduce(
			(total, field) => total + field.selected_filters.length,
			0
		);
		return status;
	}

	/** Column-name preview for a block card. */
	static getSelectedColumns(block: QueryBlock | null): string[] {
		return block?.draft?.selectedFields.map((f) => f.name) ?? [];
	}

	/** Run/cache state used by the block cards. */
	getRunState(block: QueryBlock | null): BlockRunState {
		const info = block ? this.runInfo[block.id] : undefined;
		return {
			hasRun: !!info,
			rows: info?.rows ?? null,
			isRunning: !!(block && this.running[block.id])
		};
	}

	/**
	 * Called by the visualisation view when a run starts/ends.
	 * Marks the block card as "running" (shows spinner).
	 */
	markBlockRunning(id: string, running: boolean): void {
	    this.running = { ...this.running, [id]: running };
	}
	
	/**
	 * Called by the visualisation view after a successful run.
	 * Stores the row count so the block card can display it.
	 */
	markBlockRun(id: string, rows: number): void {
	    this.runInfo = { ...this.runInfo, [id]: { rows } };
	    this.running = { ...this.running, [id]: false };
	}

	private seedFromQuery(query: CompiledQuery): void {
		this.blocks = [
			{
				id: createId(),
				name: 'Query 1',
				draft: {
					...makeEmptyDraft(),
					tableName: typeof query.from === 'string' ? query.from : ''
				},
				pendingSeed: Utils.cloneObject(query)
			}
		];
		this.activeBlockId = this.blocks[0].id;
		this.counter = 1;
		this.persistState();
	}

	private loadPersistedState(): void {
		const state = get(persistedWorkspaceState);
		if (!state.blocks.length) {
			this.addBlock();
			return;
		}

		this.blocks = state.blocks.map((block) => this.normalizeBlock(block));
		this.counter = state.counter || this.blocks.length;
		this.activeBlockId =
			state.activeBlockId && this.blocks.some((block) => block.id === state.activeBlockId)
				? state.activeBlockId
				: (this.blocks[0]?.id ?? null);

		if (!this.activeBlockId && this.blocks.length === 0) {
			this.addBlock();
			return;
		}

		this.persistState();
	}

	/** Coerces a persisted (possibly legacy-shaped) block into the current shape. */
	private normalizeBlock(block: Partial<QueryBlock> & { id?: string; name?: string }): QueryBlock {
		const draft = block.draft ? Utils.cloneObject(block.draft) : makeEmptyDraft();
		return {
			id: block.id ?? createId(),
			name: block.name ?? 'Query',
			draft,
			pendingSeed: block.pendingSeed ? Utils.cloneObject(block.pendingSeed) : null
		};
	}

	private persistState(): void {
		persistedWorkspaceState.set({
			blocks: this.blocks.map((block) => ({
				id: block.id,
				name: block.name,
				draft: Utils.cloneObject(block.draft),
				pendingSeed: block.pendingSeed ? Utils.cloneObject(block.pendingSeed) : null
			})),
			activeBlockId: this.activeBlockId,
			counter: this.counter
		});
	}

	/** Drops a block's cached run result so it is considered "not run" again. */
	private invalidateRun(id: string): void {
		if (!this.runInfo[id]) return;
		const next = { ...this.runInfo };
		delete next[id];
		this.runInfo = next;
	}
}
