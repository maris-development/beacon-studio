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
 * Each block also holds its own Beacon node, in `instance`. The node is part of
 * the query, like the table. A switch of block therefore switches the node, and
 * two open blocks can read two nodes. {@link activeInstance} resolves the ref of
 * the active block against the instance list. It is null while the ref names no
 * node, and while the list holds no node for that ref. The builder then shows
 * the instance picker, and the user chooses.
 *
 * Data flow:
 *   builder edit -> updateActiveDraft(draft) -> queryBlocks.update()
 *   block        -> getQuery()/getStatus()   -> JSON view, action bar, cards
 */
import type { CompiledQuery, MinMaxFilter } from '@/beacon-api/types';
import { Utils } from '@/utils';
import {
	isGeoJsonFilter,
	isUsableSelection,
	toBboxFilters,
	toGeoJsonFilter,
	type SpatialSelection
} from '@/geo/spatial-selection';
import { detectCoordinateColumns } from '@/geo/coordinate-columns';
import {
	ensureBlockCounter,
	getBlocksState,
	needsDraftSeed,
	nextBlockNumber,
	queryBlocks,
	setActiveBlockId
} from '@/stores/query-blocks';
import type { ResolvedUrlQuery } from '@/stores/query-library';
import {
	cloneStoredQuery,
	hasInstanceRef,
	snapshotInstance,
	type InstanceRef,
	type MapViewState,
	type StoredQuery
} from '@/stores/stored-query';
import { getCurrentInstance, instances, matchRef } from '@/services/beacon-instance';
import type { BeaconInstance } from '@/beacon-api/types';
import { addToast } from '@/stores/toasts';
import { makeEmptyQuerySelectionStatus, type QuerySelectionStatus } from '@/query/selection-status';
import { compileDraft, makeEmptyDraft, type QueryDraft } from '@/query/draft';
import { isPlotRenderable, type ChartViewState } from '@/plots/plot-config';

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

	/**
	 * A reactive mirror of the configured instances. The workspace resolves the
	 * ref of a block against this list, so a new instance, an edit of a URL or a
	 * health check reaches the builder at once. Do not assign to this field.
	 */
	private instanceList = $state<BeaconInstance[]>([]);

	/** Releases the two store subscriptions. See {@link destroy}. */
	private unsubscribe: () => void;

	constructor() {
		const stopBlocks = queryBlocks.subscribe((entries) => {
			this.blocks = entries;
		});

		const stopInstances = instances.subscribe((list) => {
			this.instanceList = list;
		});

		this.unsubscribe = () => {
			stopBlocks();
			stopInstances();
		};

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
				this.warnMissingInstance(resolved.missingInstanceUrl);
				return;
			}
			this.addFromStoredQuery(resolved.entry);
			this.warnMissingInstance(resolved.missingInstanceUrl);
			return;
		}

		if (resolved.query) {
			// A share link carries the node as `?instance=`. Keep that ref, even when
			// the list holds no node for it. The builder then names the URL, and asks
			// the user to add it. A link of an older app version carries no node, so
			// the block falls back to the default.
			this.addFromQuery(resolved.query, undefined, resolved.instance);
			this.warnMissingInstance(resolved.missingInstanceUrl);
		}
	}

	/**
	 * Tell the user that a link names a node that the app does not have. The
	 * builder shows the same URL on the instance picker, so this toast repeats it
	 * once. It writes nothing when every node resolves.
	 */
	private warnMissingInstance(url: string | null): void {
		if (!url) return;

		addToast({
			type: 'warning',
			message: `This query needs the Beacon instance ${url}. Add it to run the query.`
		});
	}

	/**
	 * The node for a new block: the node of the active block, else the node that
	 * the sidebar selected. A new tab therefore stays on the node that the user
	 * works on.
	 */
	private defaultInstanceRef(): InstanceRef {
		const active = this.activeBlock;

		if (hasInstanceRef(active?.instance)) {
			return { ...active!.instance };
		}

		return snapshotInstance(getCurrentInstance());
	}

	/** The active block, or null. */
	get activeBlock(): StoredQuery | null {
		return this.blocks.find((b) => b.id === this.activeBlockId) ?? null;
	}

	/**
	 * The node of a block, or null. The result is null in two cases: the block
	 * names no node yet, and the instance list holds no node for its ref. The
	 * caller must handle both, and must not run a query without a node.
	 */
	instanceFor(block: StoredQuery | null): BeaconInstance | null {
		return matchRef(this.instanceList, block?.instance);
	}

	/** The node of the active block, or null. See {@link instanceFor}. */
	get activeInstance(): BeaconInstance | null {
		return this.instanceFor(this.activeBlock);
	}

	/**
	 * The URL of a node that a block names, but that the instance list does not
	 * hold. It is null while the node resolves, and while the block names none.
	 * The builder shows this URL, and offers to add the node.
	 */
	missingInstanceUrlFor(block: StoredQuery | null): string | null {
		if (!hasInstanceRef(block?.instance)) return null;
		if (this.instanceFor(block)) return null;
		return block?.instance.url || null;
	}

	/** {@link missingInstanceUrlFor} for the active block. */
	get missingInstanceUrl(): string | null {
		return this.missingInstanceUrlFor(this.activeBlock);
	}

	/**
	 * Put a node on a block. The table and the columns of one node do not apply to
	 * another, so the method empties the draft. It keeps the output format, which
	 * is a preference of the user and not a property of the node.
	 *
	 * The method also drops the link to the last result, because the cache key
	 * holds the URL of the node.
	 *
	 * The method returns false when the user refused the warning. It warns only
	 * when the draft has columns to lose.
	 */
	setBlockInstance(id: string, instance: BeaconInstance): boolean {
		const block = this.blocks.find((candidate) => candidate.id === id);
		if (!block) return false;

		if (block.instance.id === instance.id) return true;

		const columns = block.draft?.selectedFields.length ?? 0;

		if (columns > 0) {
			const shouldContinue = confirm(
				'Changing the Beacon instance will reset your table and column selections. Continue?'
			);
			if (!shouldContinue) return false;
		}

		const draft = makeEmptyDraft();
		draft.outputFormat = block.draft?.outputFormat ?? draft.outputFormat;

		queryBlocks.update(id, {
			instance: snapshotInstance(instance),
			draft,
			compiled: null,
			datasetKey: null,
			rowCount: null
		});

		return true;
	}

	/** {@link setBlockInstance} for the active block. */
	setActiveInstance(instance: BeaconInstance): boolean {
		if (!this.activeBlockId) return false;
		return this.setBlockInstance(this.activeBlockId, instance);
	}

	/** Add an empty block and select it. It inherits the node of the active block. */
	addBlock(name?: string): StoredQuery {
		const block = queryBlocks.append({
			name: name ?? `Query ${nextBlockNumber()}`,
			draft: makeEmptyDraft(),
			instance: this.defaultInstanceRef()
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

	/**
	 * Open a query with no draft as a new block. Share links and the JSON editor
	 * use this. Pass `instance` to name the node of the query. Without it the
	 * block takes the default. See {@link defaultInstanceRef}.
	 */
	addFromQuery(query: CompiledQuery, name?: string, instance?: InstanceRef | null): StoredQuery {
		let ref = this.defaultInstanceRef();
		if (hasInstanceRef(instance)) {
			ref = { ...instance! };
		}

		const block = queryBlocks.append({
			name: name ?? `Query ${nextBlockNumber()}`,
			draft: null,
			compiled: Utils.cloneObject(query),
			instance: ref
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

	/**
	 * Write the area that the user drew on the map into the active block.
	 *
	 * A block that has a draft keeps the area in that draft, so the builder can
	 * show it and a save or a share link keeps it. A block from a share link or
	 * from the JSON editor has no draft yet. That block gets the filters written
	 * straight into its compiled query.
	 *
	 * Both paths remove the link to the last result, because that result belongs
	 * to the query before the change.
	 *
	 * Call this from an event handler. Do not call it from a tracked effect: the
	 * write replaces the block object, and the effect would run again.
	 */
	updateActiveSpatialFilter(selection: SpatialSelection | null): void {
		const block = this.activeBlock;
		if (!block) return;

		if (block.draft) {
			this.updateActiveDraft({ ...block.draft, spatialFilter: selection });
			return;
		}

		if (!block.compiled) return;

		const compiled = Utils.cloneObject(block.compiled) as CompiledQuery;
		const names = compiled.query_parameters.map((param) => param.alias ?? param.column);
		const { latitude, longitude } = detectCoordinateColumns(names);
		if (!latitude || !longitude) return;

		// Drop the filters of the previous area: the polygon, and the box that
		// belongs to it on the two columns.
		const spatialColumns = [latitude.name, longitude.name];
		let filters = (compiled.filters ?? []).filter((filter) => {
			if (isGeoJsonFilter(filter)) return false;
			const minMax = filter as MinMaxFilter;
			const isBox = 'min' in minMax && 'max' in minMax;
			return !(isBox && spatialColumns.includes(minMax.for_query_parameter));
		});

		if (isUsableSelection(selection)) {
			filters = [
				...filters,
				toGeoJsonFilter(selection!, latitude.name, longitude.name),
				...toBboxFilters(selection!, latitude.name, longitude.name)
			];
		}

		compiled.filters = filters;

		queryBlocks.update(block.id, { compiled, datasetKey: null, rowCount: null });
	}

	/**
	 * Write the display state of the map viewer to the active block: the painted
	 * column, the range of the legend and the camera.
	 *
	 * This state is not part of the query. Therefore the method keeps
	 * `datasetKey` and `rowCount`. A change of the legend must not drop the
	 * result of the last run.
	 *
	 * The method does nothing when the state did not change. The map viewer
	 * calls it from an effect, so this guard stops a write loop.
	 */
	updateActiveMapView(state: MapViewState): void {
		const block = this.activeBlock;
		if (!block) return;

		if (JSON.stringify(block.view?.map) === JSON.stringify(state)) return;

		// A block with no stored view, and no column and no camera to store, stays
		// untouched. A range alone restores nothing. This keeps a short visit to
		// the map viewer out of the storage.
		if (!block.view?.map && !state.dataColumn && !state.camera) return;

		queryBlocks.update(block.id, {
			view: { ...block.view, map: Utils.cloneObject(state) }
		});
	}

	/**
	 * Write the plots of the chart explorer to one block.
	 *
	 * The rules are the ones of {@link updateActiveMapView}. This state is not
	 * part of the query, so the method keeps `datasetKey` and `rowCount`. A new
	 * palette must not drop the result of the last run.
	 *
	 * The method does nothing when the state did not change. The chart page calls
	 * it from an effect, so this guard stops a write loop.
	 *
	 * A block with no stored chart state, and no configured plot to store, stays
	 * untouched. Therefore a short visit to the chart page writes nothing.
	 *
	 * The block is named, and not taken from the selection. The chart page delays
	 * this write until the user stops typing, and by then the active block can be
	 * another one.
	 */
	updateChartView(blockId: string, state: ChartViewState): void {
		const block = this.blocks.find((candidate) => candidate.id === blockId);
		if (!block) return;

		if (JSON.stringify(block.view?.chart) === JSON.stringify(state)) return;

		if (!block.view?.chart && !state.plots.some(isPlotRenderable)) return;

		queryBlocks.update(block.id, {
			view: { ...block.view, chart: Utils.cloneObject(state) }
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

		const draft = makeEmptyDraft();
		draft.tableName = block.draft?.tableName ?? '';

		queryBlocks.update(block.id, {
			draft,
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

		// The drawn area is one more filter, but it belongs to no single column.
		if (draft.spatialFilter) {
			status.filters += 1;
		}

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
