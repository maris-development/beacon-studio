/**
 * QueryWorkspace is the source of truth for the query builder and visualiser
 * page. It holds the list of query blocks. It marks one block active. It derives
 * the badge status and the run state of each block.
 *
 * A block is a {@link StoredQuery} with `role: 'block'`. Blocks live in the
 * persisted `queryBlocks` collection. Saved queries and history use the same
 * record type.
 *
 * This class is a view of that collection. {@link blocks} is a reactive mirror.
 * A subscription keeps the mirror correct. Every change writes to the
 * collection, not to the mirror. Therefore the app persists blocks
 * automatically. It can also copy a block into another collection, for example
 * for "save this query". No conversion is necessary.
 *
 * Each block holds a {@link QueryDraft}. The draft is the editable builder
 * state: table, columns, filters and output format. The draft is the source of
 * truth. {@link compileDraft} derives `compiled` from it. Therefore a change of
 * block restores the exact builder state.
 *
 * A block with a null `draft` and a set `compiled` comes from a share link or
 * from the JSON editor. The builder fills the draft after the schema loads. See
 * {@link seedFor}. From that point the draft leads.
 *
 * Data flow:
 *   builder edit -> updateActiveDraft(draft) -> queryBlocks.update()
 *   block        -> getQuery()/getStatus()   -> JSON view, action bar, cards
 */
import type { CompiledQuery } from '@/beacon-api/types';
import { Utils } from '@/utils';
import {
	ensureBlockCounter,
	getBlocksState,
	needsDraftSeed,
	nextBlockNumber,
	queryBlocks,
	setActiveBlockId
} from '@/stores/query-blocks';
import type { ResolvedUrlQuery } from '@/stores/query-library';
import { cloneStoredQuery, snapshotInstance, type StoredQuery } from '@/stores/stored-query';
import { currentBeaconInstance } from '@/stores/config';
import { get } from 'svelte/store';
import { makeEmptyQuerySelectionStatus, type QuerySelectionStatus } from './QuerySelectionStatus';
import { compileDraft, makeEmptyDraft, type QueryDraft } from './QueryDraft';

/** Small run/cache summary used by the block cards. */
export type BlockRunState = {
	hasRun: boolean;
	rows: number | null;
	isRunning: boolean;
};

export class QueryWorkspace {
	/**
	 * A reactive mirror of the persisted block collection. Do not assign to this
	 * field. The subscription below is the only writer.
	 */
	blocks = $state<StoredQuery[]>([]);

	/** The id of the block that the user edits or visualises now. */
	activeBlockId = $state<string | null>(null);

	/**
	 * A "runs now" flag for each block. The record does not hold this flag. An
	 * active run is a fact about this tab at this moment, not about the stored
	 * query. A persisted flag would keep a spinner on a block after a reload.
	 */
	private running = $state<Record<string, boolean>>({});

	/** Releases the collection subscription. See {@link destroy}. */
	private unsubscribe: () => void;

	constructor() {
		this.unsubscribe = queryBlocks.subscribe((entries) => {
			this.blocks = entries;
		});

		this.restoreSelection();
	}

	/**
	 * Detach from the block collection. The workbench builds a new workspace at
	 * every mount. Without this method each visit leaves one more subscriber. That
	 * subscriber writes into an object that the app no longer uses.
	 */
	destroy(): void {
		this.unsubscribe();
	}

	/**
	 * Add the query from a deep-link as a new block. The method does not replace
	 * the workspace. "Open in workbench" must not close the tabs of the user.
	 *
	 * A second visit to the same link has no extra effect. If `?q=` names a block
	 * that is already open, the method selects that block.
	 */
	openFromUrl(resolved: ResolvedUrlQuery): void {
		if (resolved.entry) {
			const alreadyOpen = this.blocks.find((block) => block.id === resolved.entry?.id);
			if (alreadyOpen) {
				this.select(alreadyOpen.id);
				return;
			}
			this.addFromStoredQuery(resolved.entry);
			return;
		}

		if (resolved.query) {
			this.addFromQuery(resolved.query);
		}
	}

	/** The active block, or null. */
	get activeBlock(): StoredQuery | null {
		return this.blocks.find((b) => b.id === this.activeBlockId) ?? null;
	}

	/** Add an empty block and select it. */
	addBlock(name?: string): StoredQuery {
		const block = queryBlocks.append({
			name: name ?? `Query ${nextBlockNumber()}`,
			draft: makeEmptyDraft(),
			instance: snapshotInstance(get(currentBeaconInstance))
		});
		this.select(block.id);
		return block;
	}

	/**
	 * Open a saved query or a history entry as a new block, and select it. The
	 * block is an independent copy. An edit to the block must not change the
	 * source record.
	 */
	addFromStoredQuery(source: StoredQuery, name?: string): StoredQuery {
		const block = cloneStoredQuery(source, {
			role: 'block',
			name: name ?? source.name ?? `Query ${nextBlockNumber()}`
		});
		queryBlocks.insertAt(this.blocks.length, block);
		this.select(block.id);
		return block;
	}

	/** Open a query with no draft as a new block. Share links and the JSON editor use this. */
	addFromQuery(query: CompiledQuery, name?: string): StoredQuery {
		const block = queryBlocks.append({
			name: name ?? `Query ${nextBlockNumber()}`,
			draft: null,
			compiled: Utils.cloneObject(query),
			instance: snapshotInstance(get(currentBeaconInstance))
		});
		this.select(block.id);
		return block;
	}

	/** Put an independent copy after the source block and select it. */
	duplicateBlock(id: string): void {
		const index = this.blocks.findIndex((b) => b.id === id);
		if (index === -1) return;

		const copy = cloneStoredQuery(this.blocks[index], {
			role: 'block',
			name: `${this.blocks[index].name} (copy)`
		});
		queryBlocks.insertAt(index + 1, copy);
		this.select(copy.id);
	}

	/** Give a block a new name. */
	renameBlock(id: string, name: string): boolean {
		const block = this.blocks.find((candidate) => candidate.id === id);
		if (!block) return false;
		if (block.name === name) return true;

		queryBlocks.update(id, { name });
		return true;
	}

	/** Remove a block. Keep one block, and correct the active selection. */
	closeBlock(id: string): void {
		if (this.blocks.length === 1) return;

		const index = this.blocks.findIndex((b) => b.id === id);
		if (index === -1) return;

		if ((this.blocks[index].draft?.selectedFields.length ?? 0) > 0) {
			const shouldContinue = confirm('Are you sure you want to close this query?');
			if (!shouldContinue) return;
		}

		queryBlocks.remove(id);

		if (this.activeBlockId === id) {
			const fallback = this.blocks[index] ?? this.blocks[index - 1] ?? this.blocks[0];
			this.select(fallback?.id ?? null);
		}
	}

	selectBlock(id: string): void {
		this.select(id);
	}

	/**
	 * Write the builder draft to the active block, and derive a new compiled
	 * query. The builder calls this method at every edit.
	 *
	 * The method also removes the link to the last result. That cached dataset
	 * belongs to the query before the edit.
	 */
	updateActiveDraft(draft: QueryDraft): void {
		const block = this.activeBlock;
		if (!block) return;

		if (JSON.stringify(block.draft) === JSON.stringify(draft)) return;

		queryBlocks.update(block.id, {
			draft: Utils.cloneObject(draft),
			compiled: compileDraft(draft),
			datasetKey: null,
			rowCount: null
		});
	}

	/** Compile the draft of a block. Returns null if the draft is incomplete. */
	static getQuery(block: StoredQuery | null): CompiledQuery | null {
		return block?.compiled ?? compileDraft(block?.draft);
	}

	/**
	 * The query that the builder uses one time to fill the draft of a block.
	 * Returns null after the block has its own draft.
	 */
	static seedFor(block: StoredQuery | null): CompiledQuery | null {
		if (!needsDraftSeed(block)) {
			return null;
		}
		return block?.compiled ?? null;
	}

	/** Set the active block back to an empty draft. The Reset button uses this. */
	resetActive(): void {
		const block = this.activeBlock;
		if (!block) return;
		queryBlocks.update(block.id, {
			draft: makeEmptyDraft(),
			compiled: null,
			datasetKey: null,
			rowCount: null
		});
	}

	/** Derive the badge status from the draft of a block: table, columns and filters. */
	static getStatus(block: StoredQuery | null): QuerySelectionStatus {
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

	/** The column names for a block card. */
	static getSelectedColumns(block: StoredQuery | null): string[] {
		return block?.draft?.selectedFields.map((f) => f.name) ?? [];
	}

	/**
	 * The run state for the block cards. The link from the record to a cached
	 * result gives the value of `hasRun`. The app does not track it separately.
	 * Therefore the value survives a reload. An edit also clears it.
	 */
	getRunState(block: StoredQuery | null): BlockRunState {
		return {
			hasRun: !!block?.datasetKey,
			rows: block?.rowCount ?? null,
			isRunning: !!(block && this.running[block.id])
		};
	}

	/** Start or stop the spinner of a block. The visualisation view calls this. */
	markBlockRunning(id: string, running: boolean): void {
		this.running = { ...this.running, [id]: running };
	}

	/**
	 * Stop the spinner after a successful run. The query store writes the row
	 * count and the dataset link, because it holds the cache key. This method
	 * keeps its name, so a caller can read the start and the end as a pair.
	 */
	markBlockRun(id: string, _rows: number): void {
		void _rows;
		this.markBlockRunning(id, false);
	}

	private select(id: string | null): void {
		this.activeBlockId = id;
		setActiveBlockId(id);
	}

	private restoreSelection(): void {
		if (!this.blocks.length) {
			this.addBlock();
			return;
		}

		ensureBlockCounter(this.blocks.length);

		const persistedId = getBlocksState().activeBlockId;
		if (persistedId && this.blocks.some((block) => block.id === persistedId)) {
			this.select(persistedId);
		} else {
			this.select(this.blocks[0].id);
		}
	}
}
