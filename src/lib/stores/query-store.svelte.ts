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
 * geometry) are delegated to a shared worker. See [[persistent-query-migration]].
 */

import * as ApacheArrow from 'apache-arrow';
import { get } from 'svelte/store';
import type { QueryInput } from '@beacon/client';
import { getArrowDecoder } from '@/beacon-api/arrow-zstd';
import { makeBeaconClient } from '@/beacon-api/sdk-client';
import type { CompiledQuery, QueryWarning } from '@/beacon-api/types';
import { currentBeaconInstance } from '@/stores/config';
import { opfsArrowCache } from '@/stores/opfs-arrow-cache';
import { recordExecution } from '@/stores/query-history';
import { addToast } from '@/stores/toasts';
import { getArrowWorker } from '@/workers/ArrowProcessingWorkerManager';
import type { SortDirection } from '@/util-types';
import { Utils } from '@/utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Protective cap on result size (cells = rows × columns) to keep the browser
 * stable. Mirrors the legacy client's `QUERY_LIMIT`; the per-query `limit` is this
 * divided by the number of selected columns.
 */
export const QUERY_CELL_LIMIT = 50_000_000;

/** Max number of cached datasets kept in memory at once. */
const MAX_ENTRIES = 4;
/** Max total cells across all cached datasets before oldest entries are evicted. */
const MAX_TOTAL_CELLS = QUERY_CELL_LIMIT * 2;

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

	/** Insertion-ordered LRU of cached datasets, keyed by `keyFor(query)`. */
	private cache = new Map<string, DatasetEntry>();
	/** In-flight fetches, so concurrent `ensure()` calls for the same key share one request. */
	private inFlight = new Map<string, Promise<DatasetEntry>>();
	/** Memoized map display tables (dedup + geometry), keyed by dataset + lat/lon + decimals. */
	private mapTableCache = new Map<string, Promise<ApacheArrow.Table>>();

	/**
	 * Computes a stable cache key for a query (object key order doesn't matter).
	 * The current Beacon instance's URL is part of the key: results persist across
	 * sessions (OPFS tier), so the same query against a different instance must
	 * never share an entry.
	 */
	keyFor(query: CompiledQuery): string {
		const instance = get(currentBeaconInstance);
		return stableStringify({ instance: instance?.url ?? null, query });
	}

	/** Returns a cached entry without fetching, or `undefined` if absent. */
	peek(query: CompiledQuery): DatasetEntry | undefined {
		return this.cache.get(this.keyFor(query));
	}

	/**
	 * Returns the cached result for `query`: from memory, else rehydrated from the
	 * OPFS tier, else fetched once (arrow-native, via `@beacon/client`). Concurrent
	 * calls for the same query share a single request. On success the entry becomes
	 * {@link current}.
	 *
	 * Does not throw on empty results — callers should check `entry.rowCount === 0`.
	 */
	async ensure(query: CompiledQuery): Promise<DatasetEntry> {
		const key = this.keyFor(query);

		const cached = this.cache.get(key);
		if (cached) {
			this.touch(key, cached);
			this.current = cached;
			this.recordHistory(cached);
			return cached;
		}

		const existing = this.inFlight.get(key);

		if (existing) return existing;

		this.isLoading = true;

		const promise = this.load(query, key)
			.then((entry) => {
				// console.log('QueryStore.ensure: loaded', entry.key, entry.rowCount, 'rows in', entry.duration.toFixed(1), 'ms');
				this.insert(entry);
				this.current = entry;
				this.recordHistory(entry);
				return entry;
			})
			.finally(() => {
				this.inFlight.delete(key);
				if (this.inFlight.size === 0) this.isLoading = false;
			});

		this.inFlight.set(key, promise);

		return promise;
	}

	/** Removes a single cached query, or clears everything when called with no argument. */
	invalidate(query?: CompiledQuery): void {
		if (!query) {
			this.cache.clear();
			this.mapTableCache.clear();
			this.current = null;
			void opfsArrowCache.clear();
			return;
		}
		const key = this.keyFor(query);
		this.cache.delete(key);
		this.purgeDerived(key);
		if (this.current?.key === key) this.current = null;
		void opfsArrowCache.remove(key);
	}

	/**
	 * Records a resolved dataset in the persisted query history. Best-effort: a
	 * history failure must never break query execution. Snapshots the current Beacon
	 * instance so the entry stays meaningful if that instance is later changed.
	 */
	private recordHistory(entry: DatasetEntry): void {
		const instance = get(currentBeaconInstance);
		if (!instance) return;
		try {
			recordExecution({
				key: entry.key,
				query: entry.query,
				instanceId: instance.id,
				instanceName: instance.name,
				instanceUrl: instance.url,
				rowCount: entry.rowCount,
				duration: entry.duration
			});
		} catch (error) {
			console.warn('Failed to record query history entry.', error);
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
			maxEntries: MAX_ENTRIES,
			totalCells: this.totalCells(),
			maxTotalCells: MAX_TOTAL_CELLS,
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
	private async load(query: CompiledQuery, key: string): Promise<DatasetEntry> {
		const restored = await this.restore(query, key);
		if (restored) return restored;
		return this.fetch(query, key);
	}

	/**
	 * Rehydrates a dataset from the OPFS tier: decodes the persisted (uncompressed)
	 * Arrow IPC bytes and rebuilds the entry from the sidecar metadata. Returns
	 * `undefined` on any miss or decode failure (which falls through to a fetch).
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

	/** Executes the query arrow-native and builds a {@link DatasetEntry}. */
	private async fetch(query: CompiledQuery, key: string): Promise<DatasetEntry> {

		const client = makeBeaconClient(get(currentBeaconInstance));

		// Clone so we never mutate the caller's query, then apply the cell-limit guard.
		const payload = { ...Utils.cloneObject(query) } as Record<string, unknown>;
		const columnCount = Math.max(1, query.query_parameters?.length ?? 1);
		const limit = Math.round(QUERY_CELL_LIMIT / columnCount);
		payload.limit = limit;

		// Request the server's default (zstd) Arrow IPC stream by omitting `output`
		// entirely — any `output` here would be forwarded by @beacon/client and could
		// yield a non-Arrow body. The local CompiledQuery shape is accepted server-side
		// via serde aliases (query_parameters→select, for_query_parameter→column, filters).
		delete payload.output;

		const start = performance.now();
		// Decode via the SDK's `queryBatches`: it reads the zstd Arrow IPC stream with
		// the SDK's own (correct) streaming decoder, so we don't re-implement zstd/IPC
		// decoding here. It also surfaces the query id. Runtime batches are real

		// apache-arrow RecordBatches (arrow is deduped to one copy).
		const response = await client.queryRaw(payload as unknown as QueryInput);

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
				message: `The query result reached the ${QUERY_CELL_LIMIT.toLocaleString()} cell limit to keep your browser stable. Data may be incomplete — refine your query to reduce the result size.`
			});
		}

		const duration = performance.now() - start;

		// Persist to OPFS in the background; never blocks returning the entry. We store
		// the table re-serialized as an uncompressed Arrow IPC stream, so the rehydrate
		// path is a plain `tableFromIPC` with no zstd dependency.
		// const ipcBytes = ApacheArrow.tableToIPC(table, 'stream');
		void opfsArrowCache.put(key, bytes, { rowCount, duration, queryId, warnings });

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
		while (this.cache.size > MAX_ENTRIES) {
			if (!this.deleteOldest()) break;
		}
		while (this.cache.size > 1 && this.totalCells() > MAX_TOTAL_CELLS) {
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


