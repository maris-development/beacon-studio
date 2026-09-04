/**
 * QueryStore — a persistent, in-memory cache of query results (Apache Arrow
 * tables) that survives client-side navigation, so switching between visualizer
 * pages (map ↔ table ↔ chart) reuses the same result instead of re-executing the
 * query on every screen change.
 *
 * This module is a singleton: SvelteKit keeps modules alive across client-side
 * navigations, so the exported `queryStore` and its cache live for the whole page
 * session. The gzipped query on the URL (`?query=`) remains the durable identity
 * for deep-links/refresh; here it maps to a cache key.
 *
 * Two tiers: this in-memory LRU of decoded tables (RAM-bound, small), backed by an
 * OPFS cache of the raw compressed Arrow IPC bytes (`stores/opfs-arrow-cache.ts`)
 * that survives reloads and app restarts — a memory miss rehydrates locally
 * instead of re-executing the query. Heavy transforms (sort / dedup / min-max /
 * geometry) are delegated to a shared worker.
 *
 * Every method that touches a node takes the {@link BeaconInstance} as an
 * argument. The store reads no app-wide selection. A query record owns its node,
 * so two open queries can run on two nodes. The instance URL is part of the
 * cache key, so results of two nodes never mix.
 *
 * The store runs one query at a time. See {@link QueryStore.ensure}.
 */

import * as ApacheArrow from 'apache-arrow';
import { getArrowDecoder, type QueryInput } from '@beacon/client';
import { makeBeaconClient } from '@/beacon-api/client';
import type { BeaconInstance, CompiledQuery, QueryWarning } from '@/beacon-api/types';
import { opfsArrowCache } from '@/stores/opfs-arrow-cache';
import { recordExecution } from '@/stores/query-history';
import { recordRunResult, resolveStoredQuery } from '@/stores/query-library';
import { getSettings } from '@/stores/settings';
import { snapshotInstance } from '@/stores/stored-query';
import { addToast } from '@/stores/toasts';
import { getArrowWorker } from '@/workers/ArrowProcessingWorkerManager';
import type { SortDirection } from '@/util-types';
import { Utils } from '@/utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Protective cap on result size (cells = rows × columns) to keep the browser
 * stable. The per-query `limit` is this divided by the number of selected
 * columns. The user sets the value on the settings page (`queryCellLimit`).
 *
 * Call this at the point of use. A read at module load would keep the value of
 * the first page load for ever.
 */
export function queryCellLimit(): number {
	return getSettings().queryCellLimit;
}

/** Max number of cached datasets kept in memory at once (`memoryCacheMaxEntries`). */
function maxEntries(): number {
	return getSettings().memoryCacheMaxEntries;
}

/** Max total cells across all cached datasets before oldest entries are evicted. */
function maxTotalCells(): number {
	return queryCellLimit() * 2;
}

/** Per-entry snapshot of the in-memory cache, for the cache-info UI. */
export interface MemoryCacheEntryInfo {
	key: string;
	/** Selected column names (alias preferred), for a compact summary. */
	columns: string[];
	rowCount: number;
	colCount: number;
	/** Estimated in-memory size of the decoded Arrow table, in bytes. */
	bytes: number;
	/** Whether this is the currently-displayed dataset. */
	isCurrent: boolean;
}

/** Aggregate + per-entry stats for the in-memory tier of the query cache. */
export interface MemoryCacheStats {
	entryCount: number;
	maxEntries: number;
	totalCells: number;
	maxTotalCells: number;
	totalBytes: number;
	/** Number of memoized derived tables (e.g. map display tables). */
	derivedTableCount: number;
	/** Most-recently-used first. */
	entries: MemoryCacheEntryInfo[];
}

/** A cached query result: the Arrow table plus its identifying query and metadata. */
export interface DatasetEntry {
	/** Stable cache key derived from the query (canonical JSON). */
	key: string;
	/** The query that produced this result (a clone; never mutated in place). */
	query: CompiledQuery;
	/** The decoded Arrow table. */
	table: ApacheArrow.Table;
	/** Number of rows in the result. */
	rowCount: number;
	/** Wall-clock fetch + decode duration in milliseconds. */
	duration: number;
	/** Server-assigned query id (from the `x-beacon-query-id` response header). */
	queryId: string | null;
	/** Non-fatal warnings raised during execution (e.g. `limit_reached`). */
	warnings: QueryWarning[];
}

class QueryStore {
	/**
	 * The most recently ensured dataset. `$state.raw` so reassignment is reactive
	 * but the Arrow table isn't deeply proxied (which would break its methods).
	 */
	current = $state.raw<DatasetEntry | null>(null);
	/** True while at least one fetch is in flight. */
	isLoading = $state(false);

	/** Insertion-ordered LRU of cached datasets, keyed by `keyFor(query, instance)`. */
	private cache = new Map<string, DatasetEntry>();
	/** In-flight fetches, so concurrent `ensure()` calls for the same key share one request. */
	private inFlight = new Map<string, Promise<DatasetEntry>>();
	/**
	 * The run of now, and the control that stops it. The store runs one query at a
	 * time, so a run of another query aborts this one first. See {@link ensure}.
	 */
	private activeRun: { key: string; controller: AbortController } | null = null;
	/** Memoized map display tables (dedup + geometry), keyed by dataset + lat/lon + decimals. */
	private mapTableCache = new Map<string, Promise<ApacheArrow.Table>>();

	/**
	 * When `false`, caching is bypassed end-to-end: `ensure()` never reads from or
	 * writes to the in-memory or OPFS tiers, so every call re-executes the query.
	 * Concurrent identical calls are still de-duped via {@link inFlight} while the
	 * request is in flight. Toggled through the client facade.
	 */
	private cacheEnabled = true;

	/** Whether the result cache (memory + OPFS) is currently active. */
	isCacheEnabled(): boolean {
		return this.cacheEnabled;
	}

	/**
	 * Enables or disables the result cache. Disabling also drops everything already
	 * cached (memory + OPFS), so a disabled cache can never serve a stale result.
	 */
	setCacheEnabled(enabled: boolean): void {
		if (this.cacheEnabled === enabled) return;
		this.cacheEnabled = enabled;
		if (!enabled) this.invalidate();
	}

	/**
	 * Computes a stable cache key for a query (object key order doesn't matter).
	 * The URL of the node is part of the key: results persist across sessions
	 * (OPFS tier), so the same query on another node must never share an entry.
	 */
	keyFor(query: CompiledQuery, instance: Pick<BeaconInstance, 'url'> | null): string {
		return stableStringify({ instance: instance?.url ?? null, query });
	}

	/** Returns a cached entry without fetching, or `undefined` if absent. */
	peek(query: CompiledQuery, instance: Pick<BeaconInstance, 'url'> | null): DatasetEntry | undefined {
		return this.cache.get(this.keyFor(query, instance));
	}

	/**
	 * Return a cached entry for a cache key. Use it if you hold the `datasetKey`
	 * of a {@link StoredQuery} and not the query. A deep-linked page can show a
	 * cached result at once, and call `ensure()` after that.
	 *
	 * This method reads the memory tier only. A miss here can still be a hit in
	 * the OPFS tier.
	 */
	peekByKey(key: string | null | undefined): DatasetEntry | undefined {
		return key ? this.cache.get(key) : undefined;
	}

	/**
	 * Returns the cached result for `query`: from memory, else rehydrated from the
	 * OPFS tier, else fetched once (arrow-native, via `@beacon/client`) from
	 * `instance`. On success the entry becomes {@link current}.
	 *
	 * The store runs one query at a time. Two calls for the same key share one
	 * request. A call for another key aborts the request that runs, and the old
	 * promise rejects with an `AbortError`. The last action of the user therefore
	 * wins, and a slow node blocks no other query. A caller must test a rejection
	 * with {@link isAbortError}, and must show no error for an abort.
	 *
	 * Does not throw on empty results — callers should check `entry.rowCount === 0`.
	 *
	 * `storedQueryId` is the id of the {@link StoredQuery} record that started this
	 * run. It is the workbench block of the "Visualise" button, or the saved query
	 * from a `?q=` link. Omit it if the query has no record. A share link and the
	 * JSON editor have no record.
	 *
	 * The id is only bookkeeping. It does not change the cache, the request or the
	 * result. It makes a link in two directions:
	 *
	 *   forward   The record gets the `datasetKey` of its result. Therefore a
	 *             later visit shows the cached dataset with no new run.
	 *   backward  The history entry gets the name and the builder state of the
	 *             record. Therefore "open in workbench" restores the true draft.
	 *             It does not build an approximate draft from the compiled query.
	 *
	 * Without the id, the app still runs the query, caches the result and adds a
	 * history row. That row has no name and no draft. No record points to its
	 * result.
	 */
	async ensure(
		query: CompiledQuery,
		instance: BeaconInstance,
		storedQueryId?: string
	): Promise<DatasetEntry> {
		const key = this.keyFor(query, instance);

		if (this.cacheEnabled) {
			const cached = this.cache.get(key);
			if (cached) {
				this.touch(key, cached);
				this.current = cached;
				this.recordHistory(cached, instance, storedQueryId);
				return cached;
			}
		}

		const existing = this.inFlight.get(key);

		if (existing) return existing;

		// One query at a time. A run of another query stops this one.
		this.abortActiveRun();

		const controller = new AbortController();
		this.activeRun = { key, controller };
		this.isLoading = true;

		const promise = this.load(query, key, instance, controller.signal)
			.then((entry) => {
				if (this.cacheEnabled) this.insert(entry);
				this.current = entry;
				this.recordHistory(entry, instance, storedQueryId);
				return entry;
			})
			.finally(() => {
				this.inFlight.delete(key);
				if (this.activeRun?.controller === controller) this.activeRun = null;
				if (this.inFlight.size === 0) this.isLoading = false;
			});

		this.inFlight.set(key, promise);

		return promise;
	}

	/**
	 * Stop the run of now, if there is one. The promise of that run rejects with
	 * an `AbortError`. The `finally` of {@link ensure} then clears the state.
	 */
	private abortActiveRun(): void {
		this.activeRun?.controller.abort();
		this.activeRun = null;
	}

	/**
	 * Stop the query that runs. The user asked for it, or the page closed. The
	 * caller of {@link ensure} sees an `AbortError`. See {@link isAbortError}.
	 */
	cancel(): void {
		this.abortActiveRun();
	}

	/**
	 * Removes a single cached query, or clears everything when called with no
	 * argument. Pass the node of the query with `query`: the URL of the node is
	 * part of the key, so a call without it matches no entry.
	 */
	invalidate(query?: CompiledQuery, instance?: Pick<BeaconInstance, 'url'> | null): void {
		if (!query) {
			this.cache.clear();
			this.mapTableCache.clear();
			this.current = null;
			void opfsArrowCache.clear();
			return;
		}
		const key = this.keyFor(query, instance ?? null);
		this.cache.delete(key);
		this.purgeDerived(key);
		if (this.current?.key === key) this.current = null;
		void opfsArrowCache.remove(key);
	}

	/**
	 * Add a dataset to the persisted query history. Also write the run stats to
	 * the {@link StoredQuery} record that started the run. See
	 * {@link QueryStore.ensure}.
	 *
	 * A failure here must never stop the execution of a query.
	 */
	private recordHistory(
		entry: DatasetEntry,
		instance: BeaconInstance,
		storedQueryId?: string
	): void {
		try {
			const origin = resolveStoredQuery(storedQueryId);
			recordExecution({
				datasetKey: entry.key,
				compiled: entry.query,
				draft: origin?.draft ?? null,
				name: origin?.name,
				instance: snapshotInstance(instance),
				rowCount: entry.rowCount,
				duration: entry.duration
			});
			recordRunResult(storedQueryId, {
				datasetKey: entry.key,
				rowCount: entry.rowCount,
				duration: entry.duration
			});
		} catch (error) {
			console.warn('Failed to record query history entry.', error);
		}
	}

	/**
	 * Records a client-side download in the persisted query history. Downloads are
	 * server-materialized — they bypass {@link ensure} and the result cache — so no
	 * row count is available here; {@link recordExecution} preserves any existing
	 * entry's count. Best-effort, mirroring {@link recordHistory}: never throws into
	 * the caller.
	 */
	recordDownload(
		query: CompiledQuery,
		instance: BeaconInstance,
		duration: number,
		storedQueryId?: string
	): void {
		try {
			const origin = resolveStoredQuery(storedQueryId);
			recordExecution({
				datasetKey: this.keyFor(query, instance),
				compiled: query,
				draft: origin?.draft ?? null,
				name: origin?.name,
				instance: snapshotInstance(instance),
				duration
			});
		} catch (error) {
			console.warn('Failed to record download in query history.', error);
		}
	}

	/** Snapshot of the in-memory cache for the cache-info UI (most-recent first). */
	stats(): MemoryCacheStats {
		const entries: MemoryCacheEntryInfo[] = [];
		let totalBytes = 0;
		for (const entry of this.cache.values()) {
			const bytes = tableByteLength(entry.table);
			totalBytes += bytes;
			entries.push({
				key: entry.key,
				columns: (entry.query.query_parameters ?? []).map((p) => p.alias ?? p.column),
				rowCount: entry.rowCount,
				colCount: entry.table.numCols,
				bytes,
				isCurrent: this.current?.key === entry.key
			});
		}
		entries.reverse(); // cache is insertion-ordered (oldest first); show newest first.
		return {
			entryCount: this.cache.size,
			maxEntries: maxEntries(),
			totalCells: this.totalCells(),
			maxTotalCells: maxTotalCells(),
			totalBytes,
			derivedTableCount: this.mapTableCache.size,
			entries
		};
	}

	// -- transforms (delegated off-main-thread to the shared worker) -------------

	/** Sorts a cached dataset by a column, returning a new Arrow table. */
	sort(entry: DatasetEntry, column: string, direction: SortDirection): Promise<ApacheArrow.Table> {
		return getArrowWorker().orderTableByColumn(entry.key, entry.table, column, direction);
	}

	/** Computes a column's numeric min/max for a cached dataset. */
	minMax(entry: DatasetEntry, column: string): Promise<{ min: number; max: number }> {
		return getArrowWorker().getColumnMinMax(entry.key, entry.table, column);
	}

	/** Counts the rows of a cached dataset inside a ring of [lon, lat] pairs. */
	countInRing(
		entry: DatasetEntry,
		ring: [number, number][],
		latitudeColumnName: string,
		longitudeColumnName: string
	): Promise<number> {
		return getArrowWorker().countPointsInRing(
			entry.key,
			entry.table,
			ring,
			latitudeColumnName,
			longitudeColumnName
		);
	}

	/** Deduplicates a cached dataset by lat/lon, returning a new Arrow table. */
	dedup(
		entry: DatasetEntry,
		latitudeColumnName?: string,
		longitudeColumnName?: string,
		amountOfRows?: number,
		decimals?: number
	): Promise<ApacheArrow.Table> {
		return getArrowWorker().deduplicateTable(
			entry.key,
			entry.table,
			latitudeColumnName,
			longitudeColumnName,
			amountOfRows,
			decimals
		);
	}

	/** Finds rows near a lat/lon in a cached dataset. */
	findSimilar(
		entry: DatasetEntry,
		latLon: [number, number],
		groupByDecimals?: number,
		latitudeColumnName?: string,
		longitudeColumnName?: string,
		maxRows?: number
	): Promise<unknown[]> {
		return getArrowWorker().findSimilarRowsByLatLon(
			entry.key,
			entry.table,
			latLon,
			groupByDecimals,
			latitudeColumnName,
			longitudeColumnName,
			maxRows
		);
	}

	/**
	 * Returns the map display table for a dataset: deduplicated by lat/lon and with
	 * a GeoArrow point geometry column added. Memoized per dataset + lat/lon +
	 * grouping precision, so revisiting the map viewer reuses it without recompute.
	 */
	mapTable(
		entry: DatasetEntry,
		latitudeColumnName: string,
		longitudeColumnName: string,
		groupByDecimals: number = 3
	): Promise<ApacheArrow.Table> {
		const memoKey = `${entry.key}|${latitudeColumnName}|${longitudeColumnName}|${groupByDecimals}`;
		const cached = this.mapTableCache.get(memoKey);
		if (cached) return cached;

		const promise = getArrowWorker().buildMapPointTable(
			entry.key,
			entry.table,
			latitudeColumnName,
			longitudeColumnName,
			groupByDecimals
		);
		this.mapTableCache.set(memoKey, promise);
		return promise;
	}

	/** Loads a dataset: rehydrate from the OPFS tier if present, else fetch. */
	private async load(
		query: CompiledQuery,
		key: string,
		instance: BeaconInstance,
		signal: AbortSignal
	): Promise<DatasetEntry> {
		if (this.cacheEnabled) {
			const restored = await this.restore(query, key);
			if (restored) return restored;
		}
		// The OPFS read can take a moment. A newer run can start in that time.
		signal.throwIfAborted();
		return this.fetch(query, key, instance, signal);
	}

	/**
	 * Rehydrates a dataset from the OPFS tier: decodes the persisted (zstd) Arrow IPC
	 * bytes and rebuilds the entry from the sidecar metadata. Returns `undefined` on
	 * any miss or decode failure (which falls through to a fetch).
	 */
	private async restore(query: CompiledQuery, key: string): Promise<DatasetEntry | undefined> {
		const hit = await opfsArrowCache.get(key);
		if (!hit) return undefined;
		try {
			const decoder = await getArrowDecoder();
			const table = decoder.tableFromIPC(hit.bytes) as ApacheArrow.Table;
			return {
				key,
				query: Utils.cloneObject(query),
				table,
				rowCount: table.numRows,
				duration: hit.meta.duration,
				queryId: hit.meta.queryId,
				warnings: hit.meta.warnings
			};
		} catch (error) {
			console.warn('Failed to decode OPFS-cached result; refetching.', error);
			void opfsArrowCache.remove(key);
			return undefined;
		}
	}

	/** Executes the query arrow-native on `instance` and builds a {@link DatasetEntry}. */
	private async fetch(
		query: CompiledQuery,
		key: string,
		instance: BeaconInstance,
		signal: AbortSignal
	): Promise<DatasetEntry> {

		const client = makeBeaconClient(instance);

		// Clone so we never mutate the caller's query, then apply the cell-limit guard.
		const payload = { ...Utils.cloneObject(query) } as Record<string, unknown>;
		const columnCount = Math.max(1, query.query_parameters?.length ?? 1);
		const cellLimit = queryCellLimit();
		const limit = Math.round(cellLimit / columnCount);
		payload.limit = limit;

		// Request the server's default (zstd) Arrow IPC stream by omitting `output`
		// entirely — any `output` here would be forwarded by @beacon/client and could
		// yield a non-Arrow body. The local CompiledQuery shape is accepted server-side
		// via serde aliases (query_parameters→select, for_query_parameter→column, filters).
		delete payload.output;

		const start = performance.now();
		// `queryRaw` hands back the untouched Response, so we keep both the query-id
		// header and the raw bytes for the OPFS tier. Decoding then goes through the
		// SDK's own `getArrowDecoder`, which registers the zstd codec and the buffer
		// alignment patch, so we never re-implement zstd/IPC decoding here. The Table
		// is a real apache-arrow Table (arrow is deduped to one copy).
		const response = await client.queryRaw(payload as unknown as QueryInput, undefined, signal);

		// console.log('headers', [...response.headers.entries()]);

		const queryId = response.headers.get('x-beacon-query-id') ?? uuidv4(); // generate a UUID if the server didn't provide one, or is blocked by CORS

		const bytes = new Uint8Array(await response.arrayBuffer());

		const decoder = await getArrowDecoder();

		const table = decoder.tableFromIPC(bytes) as ApacheArrow.Table;

		

		const rowCount = table.numRows;
		const warnings: QueryWarning[] = [];

		if (rowCount >= limit) {
			warnings.push('limit_reached');
			addToast({
				type: 'warning',
				message: `The query result reached the ${cellLimit.toLocaleString()} cell limit to keep your browser stable. Data may be incomplete. Refine your query to reduce the result size. You can also go to settings and change the "Query cell limit" to a higher limit, but note that this might impact browser performance.`
			});
		}

		const duration = performance.now() - start;

		// Persist to OPFS in the background; never blocks returning the entry. We store
		// the table re-serialized as an uncompressed Arrow IPC stream, so the rehydrate
		// path is a plain `tableFromIPC` with no zstd dependency.
		// const ipcBytes = ApacheArrow.tableToIPC(table, 'stream');
		if (this.cacheEnabled) {
			void opfsArrowCache.put(key, bytes, { rowCount, duration, queryId, warnings });
		}

		return {
			key,
			query: Utils.cloneObject(query),
			table,
			rowCount,
			duration,
			queryId,
			warnings
		};
	}

	/** Marks a cached entry as most-recently-used. */
	private touch(key: string, entry: DatasetEntry): void {
		this.cache.delete(key);
		this.cache.set(key, entry);
	}

	/** Inserts an entry as most-recently-used and evicts down to the caps. */
	private insert(entry: DatasetEntry): void {
		this.cache.delete(entry.key);
		this.cache.set(entry.key, entry);
		this.evict();
	}

	/** Evicts least-recently-used entries until within the count and cell caps. */
	private evict(): void {
		while (this.cache.size > maxEntries()) {
			if (!this.deleteOldest()) break;
		}
		while (this.cache.size > 1 && this.totalCells() > maxTotalCells()) {
			if (!this.deleteOldest()) break;
		}
	}

	private deleteOldest(): boolean {
		const oldest = this.cache.keys().next().value as string | undefined;
		if (oldest === undefined) return false;
		this.cache.delete(oldest);
		this.purgeDerived(oldest);
		return true;
	}

	/** Drops memoized derived tables (e.g. map tables) belonging to a dataset key. */
	private purgeDerived(key: string): void {
		for (const memoKey of this.mapTableCache.keys()) {
			if (memoKey.startsWith(`${key}|`)) this.mapTableCache.delete(memoKey);
		}
	}

	private totalCells(): number {
		let cells = 0;
		for (const entry of this.cache.values()) {
			cells += entry.rowCount * Math.max(1, entry.table.numCols);
		}
		return cells;
	}
}

/**
 * True when a rejection is the abort of a superseded run. A caller must treat it
 * as a normal stop: no toast, no error state. See {@link QueryStore.ensure}.
 *
 * The test reads `name`, and not the class. `fetch` and `AbortSignal` both throw
 * a `DOMException` in a browser, but a polyfill can throw another error type.
 */
export function isAbortError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	return (error as { name?: unknown }).name === 'AbortError';
}

/** Estimated in-memory footprint of an Arrow table (sum of its batch buffers). */
function tableByteLength(table: ApacheArrow.Table): number {
	let bytes = 0;
	for (const batch of table.batches) bytes += batch.data.byteLength;
	return bytes;
}

/** Deterministic JSON: object keys sorted recursively, so equal queries share a key. */
function stableStringify(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(source).sort()) {
			sorted[k] = sortKeys(source[k]);
		}
		return sorted;
	}
	return value;
}

/** The app-wide persistent query-result cache. */
export const queryStore = new QueryStore();


