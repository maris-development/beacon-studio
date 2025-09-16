
import * as ApacheArrow from 'apache-arrow';
import wasmInit from 'parquet-wasm';

import { Err, Ok, Result } from '../util/result';
import { readParquet } from 'parquet-wasm/esm';
import type { BeaconInstance } from '@/stores/config';
import { MemoryCache } from '@/cache';
import type { BeaconSystemInfo, CompiledQuery, FunctionNameObject, GeoParquetOutputFormat,  QueryMetricsResult, QueryResponse, Schema, TableDefinition, TableExtension } from './types';
import { Utils } from '@/utils';
import { addToast } from '@/stores/toasts';
import {base} from '$app/paths';

const PARQUET_WASM_URL = `${base}/parquet_wasm_bg.wasm`;

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
    
    /**
     * Ensures that the output format of the provided query is set to 'parquet' or 'geoparquet'.
     * 
     * If the output format is already 'parquet' or an object containing the 'geoparquet' key, 
     * the query is returned unchanged. Otherwise, the output format is set to 'parquet', 
     * and a warning is logged to the console.
     *
     * @param query - The compiled query object to check and potentially modify.
     * @returns A cloned query object with the output format ensured to be 'parquet' or 'geoparquet'.
     */
    static ensureParquetOutput(query: Readonly<CompiledQuery>) {

        const newQuery =  Utils.cloneObject(query); //get a clone, remove reactive wrapper from svelte

        // console.log('ensureParquetOutput', newQuery);

        switch (true) {
            case typeof newQuery.output.format === 'object' && 'geoparquet' in (newQuery.output.format ?? {}):
                // is geoparquet, allowed
                break;

            case newQuery.output.format === 'parquet': 
                // is parquet, allowed
                break;

            default:
                console.warn(`BeaconClient.ensureParquetOutput: Output format '${newQuery.output.format}' changed to 'parquet'`);
                //set format to parquet
                newQuery.output.format = 'parquet';
                break;
        }

        return newQuery;
    }

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

    async queryToDownload(query: CompiledQuery, unknownDispositionExtension: string = '.blob'): Promise<void> {
        const endpoint = `${this.host}/api/query`;

        const request_info: RequestInit = {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(query),
            cache: 'no-cache',
        };

        const response = await fetch(endpoint, request_info);

        if (!response.ok) {
            const error_message = await response.text();
            throw new Error(`Download failed: ${response.status} ${response.statusText} - ${error_message}`);
        }

        const blob = await response.blob();

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

    async query(query: CompiledQuery): Promise<Result<QueryResponse, string>> {
        await wasmInit(PARQUET_WASM_URL);

        const correctedQuery = BeaconClient.ensureParquetOutput(query);

        const endpoint = `${this.host}/api/query`;

        // Create a request to the Beacon API using fetch
        const request_info: RequestInit = {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(query),
            cache: 'no-cache',
        }

        // console.log('client.query', endpoint, query, request_info);

        const response = await fetch(endpoint, request_info);

        if (!response.ok) {
            const error_message = await response.text();
            return Err(`Error querying Beacon API: ${response.status} ${response.statusText} - ${error_message}`);
        }

        // Await the response body as a buffer
        const buffer = await response.arrayBuffer();
        const byte_buffer = new Uint8Array(buffer);

        // Check if the out is a geoparquet format. This is a special case where we need to handle the longitude and latitude columns.
        if (typeof correctedQuery.output.format === 'object' && 'geoparquet' in correctedQuery.output.format) {
            const geoOutput = correctedQuery.output as { format: GeoParquetOutputFormat };
            const { longitude_column, latitude_column } = geoOutput.format.geoparquet;

            if (!longitude_column || !latitude_column) {
                throw new Error("Geoparquet output format requires longitude and latitude columns to be specified.");
            }

            // Return the arrow table with geoparquet format
            return BeaconClient.readParquetBufferAsArrowTable(byte_buffer).map((arrow_table) => {
                return {
                    kind: 'geoparquet',
                    arrow_table: arrow_table,
                }
            });
        }

        return BeaconClient.readParquetBufferAsArrowTable(byte_buffer).map((arrow_table) => {
            return {
                kind: 'parquet',
                arrow_table: arrow_table,
            }
        });

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
     *
     * Displays an error toast notification if the connection fails.
     */
    async testConnection(): Promise<boolean> {
        const result = await this.getHealth().then((isHealthy) => {
			// Connection successful
			if(!isHealthy){
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

    static readParquetBufferAsArrowTable(buffer: Uint8Array): Result<ApacheArrow.Table, string> {
        try {
            const wasmTable = readParquet(buffer, {
                batchSize: 128000
            });
            return BeaconClient.readArrowAsArrowTable(wasmTable.intoIPCStream());
        } catch (error) {
            console.error(error);
            return Err("Failed to read buffer as Parquet");
        }
    }

    static readArrowAsArrowTable(buffer: Uint8Array): Result<ApacheArrow.Table, string> {
        try {
            const jsTable = ApacheArrow.tableFromIPC(buffer);
            return Ok(jsTable);
        } catch {
            return Err("Failed to read buffer as Arrow");
        }
    }


}
