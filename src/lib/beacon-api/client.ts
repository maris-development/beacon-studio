
import type { Table as ArrowTable } from 'apache-arrow';
import type { BeaconInstance } from '@/stores/config';
import { MemoryCache } from '@/cache';
import type { BeaconSystemInfo, CompiledQuery, FunctionNameObject, QueryMetricsResult, Schema, TableDefinition, TableExtension } from './types';
import { Utils } from '@/utils';
import { addToast } from '@/stores/toasts';
import type { SortDirection } from '@/util-types';
import { BeaconClient as BeaconSdkClient } from '@beacon/client';

import {
    queryStore,
    type DatasetEntry,
    type MemoryCacheStats
} from '@/stores/query-store.svelte';

export type {
    DatasetEntry,
    MemoryCacheStats,
}

// Re-exported so consumers depend only on the client facade, never on the
// underlying modules directly.

// -- Metadata cache (shared across per-page BeaconClient instances) --------------
// These caches are module-level so they survive client-side navigation even though
// `BeaconClient.new()` is called per page. Keyed by host so multiple instances
// don't collide. Previously lived in the deleted `metadata-cache.ts`.
const tablesCache = new Map<string, Promise<string[]>>();
const defaultTableCache = new Map<string, Promise<string>>();
const schemaCache = new Map<string, Promise<Schema>>();


/**
 * Unified Beacon client facade. This is the single entry point the app uses to talk
 * to a Beacon instance. It wraps three concerns that used to be separate:
 *
 *  1. **Metadata + downloads** (this class' instance methods): datasets, tables,
 *     schemas, system info, and server-materialized downloads via
 *     {@link queryToDownload}, over plain JSON/`fetch`.
 *  2. **Cached metadata** ({@link getCachedTables} / {@link getCachedDefaultTable} /
 *     {@link getCachedSchema}): host-keyed memoization that survives navigation.
 *  3. **Query execution + result cache** (the `static` query methods below): the
 *     native zstd Arrow IPC path via `@beacon/client`, with a two-tier
 *     (memory + OPFS) result cache and off-main-thread transforms. These are
 *     `static` because the result cache is app-wide and keyed by the live Beacon
 *     instance, independent of any single client instance's host.
 *
 * Prefer this facade everywhere; do not import `@beacon/client` or the query-store
 * module directly from app code.
 */
export class BeaconClient {
    host: string;
    token: string | null = null;
    private memCache = new MemoryCache();

    constructor(host: string, token: string | null = null) {
        this.host = host;
        this.token = token;
    }

    static output_formats: Record<string, string> = {
        Parquet: 'parquet',
        CSV: 'csv',
        Arrow: 'arrow',
        NetCDF: 'netcdf'
    };

    static outputFormatToExtension(query: CompiledQuery, prefix: string = ''): string {
        switch (true) {
            case Utils.objectHasProperty(query.output.format, "geoparquet"):
            case query.output.format === "parquet":
                return prefix + "parquet";

            case query.output.format === "csv":
                return prefix + "csv";

            case query.output.format === "ipc":
            case query.output.format === "arrow":
                return prefix + "arrow";

            case query.output.format === "netcdf":
                return prefix + "nc";

            default:
                return prefix + "blob";
        }
    }

    static new(instance: BeaconInstance): BeaconClient {
        const client = new BeaconClient(instance.url, instance.token);
        return client;
    }

    // -- Cached metadata --------------------------------------------------------
    // Host-keyed memoization of the (immutable-per-session) metadata endpoints.
    // Shared across every BeaconClient for the same host, so repeated builder
    // mounts and instance re-selection don't refetch.

    /** Cached list of table names for this instance's host. */
    getCachedTables(): Promise<string[]> {
        let cached = tablesCache.get(this.host);
        if (!cached) {
            cached = this.getTables();
            tablesCache.set(this.host, cached);
        }
        return cached;
    }

    /** Cached default table name for this instance's host. */
    getCachedDefaultTable(): Promise<string> {
        let cached = defaultTableCache.get(this.host);
        if (!cached) {
            cached = this.getDefaultTable();
            defaultTableCache.set(this.host, cached);
        }
        return cached;
    }

    /** Cached schema for a table on this instance's host. */
    getCachedSchema(tableName: string): Promise<Schema> {
        const key = `${this.host}::${tableName}`;
        let cached = schemaCache.get(key);
        if (!cached) {
            cached = this.getTableSchema(tableName);
            schemaCache.set(key, cached);
        }
        return cached;
    }

    /** Drops cached metadata for this instance's host (tables, default table, schemas). */
    clearMetadataCache(): void {
        BeaconClient.clearMetadataCache(this.host);
    }

    async queryToDownload(query: CompiledQuery, unknownDispositionExtension: string = '.blob'): Promise<void> {
        const endpoint = `${this.host}/api/query`;

        const request_info: RequestInit = {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(query),
            cache: 'no-cache',
        };

        const started = performance.now();
        const response = await fetch(endpoint, request_info);

        if (!response.ok) {
            const error_message = await response.text();
            throw new Error(`Download failed: ${response.status} ${response.statusText} - ${error_message}`);
        }

        const blob = await response.blob();

        // Downloads are server-materialized and bypass the result cache, so record
        // them in the query history here (row count is unknown from a blob).
        BeaconClient.recordDownload(query, performance.now() - started);

        // Try to get the filename from the headers
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'download';

        const match = contentDisposition?.match(/filename="([^"]+)"/);
        if (match) {
            filename = match[1];
        } else {
            filename = `download.${unknownDispositionExtension}`;
        }

        // Trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(link.href);
    }

    async explainQuery(query: CompiledQuery): Promise<Record<string, unknown>> {
        const url = new URL(`${this.host}/api/query/explain`);

        const request_info: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
            cache: 'no-cache',
        };

        const response = await this.fetch<Record<string, unknown>>(url, request_info);

        return response;
    }

    async getQueryMetrics(query_id: string): Promise<QueryMetricsResult> {
        const url = new URL(`${this.host}/api/query/metrics/${query_id}`);

        const response: QueryMetricsResult = await this.fetch(url)

        return response;
    }

    async getQueryFunctions(): Promise<Array<FunctionNameObject>> {
        const request: Array<FunctionNameObject> = await this.fetch(`${this.host}/api/query/functions`);

        return request;
    }

    async getDatasets(pattern: string | null = null, offset: number = 0, limit: number = 100): Promise<Array<string>> {
        const url = new URL(`${this.host}/api/datasets`)

        if (pattern) {
            url.searchParams.append('pattern', pattern);
        }
        if (offset !== null) {
            url.searchParams.append('offset', offset.toString());
        }
        if (limit !== null) {
            url.searchParams.append('limit', limit.toString());
        }

        const response: Array<string> = await this.fetch(url);

        return response;
    }

    async getDatasetSchema(file: string): Promise<Schema> {
        const url = new URL(`${this.host}/api/dataset-schema`);

        url.searchParams.append('file', file);

        const response: Schema = await this.fetch(url);

        return response;
    }

    async getTotalDatasets(): Promise<number> {
        const url = new URL(`${this.host}/api/total-datasets`);

        const response: number = await this.fetch(url);

        return response;
    }

    async getTables(): Promise<Array<string>> {
        const url = new URL(`${this.host}/api/tables`);
        const response: Array<string> = await this.fetch(url);
        return response;
    }

    async getDefaultTable(): Promise<string> {
        const url = new URL(`${this.host}/api/default-table`);

        const response: string = await this.fetch(url);

        return response;
    }

    async getTableSchema(table: string): Promise<Schema> {
        const url = new URL(`${this.host}/api/table-schema`);

        url.searchParams.append('table_name', table);

        const response: Schema = await this.fetch(url);

        return response;
    }

    async getDefaultTableSchema(): Promise<Schema> {
        const url = new URL(`${this.host}/api/default-table-schema`);

        const cacheResult = this.memCache.get<Schema>(url.toString());

        if (cacheResult) {
            return cacheResult;
        }

        const response: Schema = await this.fetch(url);

        if (response) {
            this.memCache.set<Schema>(url.toString(), response);
        }

        return response;
    }


    async getTableExtensions(table: string): Promise<Array<TableExtension>> {

        const url = new URL(`${this.host}/api/table-extensions`);

        url.searchParams.append('table_name', table);

        const response: Array<TableExtension> = await this.fetch(url);

        return response;
    }

    async getTableConfig(table: string): Promise<TableDefinition> {
        const url = new URL(`${this.host}/api/table-config`);

        url.searchParams.append('table_name', table);

        const response: TableDefinition = await this.fetch(url);

        return response;
    }

    async getPresetTables(): Promise<Array<TableDefinition>> {
        const table_names = await this.getTables();

        if (table_names.length === 0) {
            return [];
        }

        // Filter the tables to only include preset tables
        const preset_tables: Array<TableDefinition> = [];
        for (const table_name of table_names) {
            const table_definition = await this.getTableConfig(table_name);

            // Check if the table is a preset table
            if ('preset' in table_definition.table_type) {
                preset_tables.push(table_definition);
            }
        }

        return preset_tables;
    }

    async getSystemInfo(): Promise<BeaconSystemInfo> {
        const url = new URL(`${this.host}/api/info`);

        const response: BeaconSystemInfo = await this.fetch(url);

        return response;
    }

    async getHealth(): Promise<boolean> {

        const url = new URL(`${this.host}/api/health`);

        const response: string = await this.fetch(url, {}, 'text');

        return response == "Ok";
    }

    /**
     * Tests the connection to the Beacon instance by checking its health status.
     *
     * @returns {Promise<boolean>} A promise that resolves to `true` if the connection is successful and the Beacon instance is healthy,
     * or `false` if there is an error connecting or the instance is not healthy.
     *
     * @throws {Error} Throws an error if the connection is successful but the Beacon instance is not healthy.
     * @param {boolean} throwUnhealthy - If set to `true`, the method will throw an error when the Beacon instance is not healthy.
     * Displays an error toast notification if the connection fails.
     */
    async testConnection(): Promise<boolean> {
        const result = await this.getHealth().then((isHealthy) => {
            // Connection successful
            if (!isHealthy) {
                throw new Error('Connected succesfully, but Beacon instance is not healthy.');
            }

            return true;
        }).catch(() => {
            addToast({
                message: `Error connecting to Beacon: Please check your URL and token, make sure the CORS settings are configured correctly on the Beacon instance.`,
                type: 'error',
                timeout: 0
            });
            return false;
        });

        return result;
    }

    // Overload #1 - JSON default
    fetch<T>(input: string | URL | Request, init?: RequestInit): Promise<T>;

    // Overload #2 - Explicit text
    fetch(input: string | URL | Request, init: RequestInit | undefined, responseType: 'text'): Promise<string>;

    // Overload #3 - Explicit JSON
    fetch<T>(input: string | URL | Request, init: RequestInit | undefined, responseType: 'json'): Promise<T>;


    fetch<T>(
        input: string | URL | globalThis.Request,
        init?: RequestInit,
        responseType?: 'json' | 'text'
    ): Promise<unknown> { // use overloads for typing
        if (!responseType) responseType = 'json';
        if (!init) init = {};

        //merge headers with auth headers:
        init.headers = {
            ...new Headers(this.getAuthHeaders(init.headers)),
        };

        if (responseType === 'text') {
            return fetch(input, init).then(BeaconClient.responseToTextOrError);
        }

        return fetch(input, init).then(BeaconClient.responseToJsonOrError<T>);
    }

    getAuthHeaders(
        existing_headers: HeadersInit = {}
    ): HeadersInit {
        const headers = new Headers(existing_headers);

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }


    // ============================================================================
    // Static members
    //
    // Grouped here so the instance (per-host) methods above stay contiguous. The
    // query result cache is app-wide and keyed by the live Beacon instance, so its
    // facade is static and independent of any single client's host.
    // ============================================================================

    /**
     * Drops cached metadata. With a `host`, only that host's entries are removed;
     * with no argument, the entire metadata cache is cleared.
     */
    static clearMetadataCache(host?: string): void {
        if (host) {
            tablesCache.delete(host);
            defaultTableCache.delete(host);
            for (const key of schemaCache.keys()) {
                if (key.startsWith(`${host}::`)) schemaCache.delete(key);
            }
        } else {
            tablesCache.clear();
            defaultTableCache.clear();
            schemaCache.clear();
        }
    }

    // -- Query execution + result cache (app-wide, live-instance keyed) ----------
    // Static: the result cache is a single app-wide store keyed by the currently
    // selected Beacon instance, so it must not be bound to one client's host.

    /**
     * Executes `query` (or returns the cached result) and caches the resulting Arrow
     * table across navigations. Concurrent identical calls share one request. See
     * {@link setQueryCacheEnabled} to bypass the cache entirely.
     */
    static ensureQuery(query: CompiledQuery): Promise<DatasetEntry> {
        return queryStore.ensure(query);
    }

    /** Returns a cached result without executing, or `undefined` if absent. */
    static peekQuery(query: CompiledQuery): DatasetEntry | undefined {
        return queryStore.peek(query);
    }

    /**
     * Invalidates cached query results. With a `query`, removes just that entry
     * (memory + OPFS); with no argument, clears the whole result cache.
     */
    static invalidateQueryCache(query?: CompiledQuery): void {
        queryStore.invalidate(query);
    }

    /** Snapshot of the in-memory result cache, for the cache-info UI. */
    static queryCacheStats(): MemoryCacheStats {
        return queryStore.stats();
    }

    /** Whether the query result cache (memory + OPFS) is currently active. */
    static isQueryCacheEnabled(): boolean {
        return queryStore.isCacheEnabled();
    }

    /**
     * Enables or disables the query result cache. Disabling also clears everything
     * already cached, so a disabled cache can never serve a stale result.
     */
    static setQueryCacheEnabled(enabled: boolean): void {
        queryStore.setCacheEnabled(enabled);
    }

    /** Sorts a cached dataset by a column (off-main-thread), returning a new table. */
    static sortQueryTable(
        entry: DatasetEntry,
        column: string,
        direction: SortDirection
    ): Promise<ArrowTable> {
        return queryStore.sort(entry, column, direction);
    }

    /** Computes a column's numeric min/max for a cached dataset. */
    static queryColumnMinMax(
        entry: DatasetEntry,
        column: string
    ): Promise<{ min: number; max: number }> {
        return queryStore.minMax(entry, column);
    }

    /** Deduplicates a cached dataset by lat/lon, returning a new table. */
    static dedupQueryTable(
        entry: DatasetEntry,
        latitudeColumnName?: string,
        longitudeColumnName?: string,
        amountOfRows?: number,
        decimals?: number
    ): Promise<ArrowTable> {
        return queryStore.dedup(
            entry,
            latitudeColumnName,
            longitudeColumnName,
            amountOfRows,
            decimals
        );
    }

    /** Finds rows near a lat/lon in a cached dataset. */
    static findSimilarQueryRows(
        entry: DatasetEntry,
        latLon: [number, number],
        groupByDecimals?: number,
        latitudeColumnName?: string,
        longitudeColumnName?: string,
        maxRows?: number
    ): Promise<unknown[]> {
        return queryStore.findSimilar(
            entry,
            latLon,
            groupByDecimals,
            latitudeColumnName,
            longitudeColumnName,
            maxRows
        );
    }

    /**
     * Returns the map display table for a dataset (deduplicated by lat/lon with a
     * GeoArrow point geometry column), memoized per dataset + lat/lon + precision.
     */
    static queryMapTable(
        entry: DatasetEntry,
        latitudeColumnName: string,
        longitudeColumnName: string,
        groupByDecimals: number = 3
    ): Promise<ArrowTable> {
        return queryStore.mapTable(entry, latitudeColumnName, longitudeColumnName, groupByDecimals);
    }

    /**
     * Records a server-materialized download in the query history. Downloads bypass
     * {@link ensureQuery} and the result cache, so the row count is unknown here; an
     * existing history entry's count is preserved. `duration` is the client-observed
     * round-trip time in milliseconds.
     */
    static recordDownload(query: CompiledQuery, duration: number): void {
        queryStore.recordDownload(query, duration);
    }

    static responseToTextOrError(response: Response): Promise<string> {
        if (!response.ok) {
            return response.text().then(text => {
                // Wrap whatever you want—here I’m embedding the server message
                throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
            });
        }
        return response.text().then(content => {
            return content;
        });
    }

    static responseToJsonOrError<T = unknown>(response: Response): Promise<T | null> {
        if (!response.ok) {
            return response.text().then(text => {
                // Wrap whatever you want—here I’m embedding the server message
                throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
            });
        }

        return response.text().then(content => {

            if (content === '') {
                return null; // Handle empty content gracefully
            }

            const json = content ? JSON.parse(content) : {};

            return json;
        });
    }

}


/**
 * Builds a `@beacon/client` client for the given Beacon instance.
 *
 * - A bearer token (if configured on the instance) is sent via the `Authorization`
 *   header on every request. The SDK's own `username`/`password` option is for
 *   HTTP Basic super-user auth and is intentionally not used here.
 * - `timeoutMs: 0` disables the SDK's default 60s per-request timeout so large
 *   query results aren't cut off mid-download — matching the legacy client, which
 *   sets no timeout.
 *
 * @throws if no instance (or no URL) is provided.
 */
export function makeBeaconClient(instance: BeaconInstance | null): BeaconSdkClient {
	if (!instance?.url) {
		throw new Error('No Beacon instance selected');
	}

	const headers = instance.token ? { Authorization: 'Bearer ' + instance.token } : undefined;

	return new BeaconSdkClient({
		url: instance.url,
		headers,
		timeoutMs: 0
	});
}
