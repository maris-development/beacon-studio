
import * as arrow_table from 'apache-arrow';
import type { CompiledQuery, Output } from './query';
import { Err, Ok, Result } from '../util/result';
import { readParquet } from 'parquet-wasm/esm';
import { tableFromIPC } from 'apache-arrow';
import type { BeaconInstance } from '@/stores/config';
import { MemoryCache } from '@/cache';
import type { BeaconSystemInfo, FunctionNameObject, QueryMetricsResult, QueryResponse, Schema, TableDefinition, TableExtension } from './models/misc';


export class BeaconClient {
    host: string;
    token: string | null = null;
    private memCache = new MemoryCache();

    constructor(host: string, token: string | null = null) {
        this.host = host;
        this.token = token;
    }

    static new(instance: BeaconInstance): BeaconClient {
        const client = new BeaconClient(instance.url, instance.token);
        return client;
    }

    async queryToDownload(query: CompiledQuery): Promise<void> {
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
            filename = `download.blob`;
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
        const endpoint = `${this.host}/api/query`;

        // Create a request to the Beacon API using fetch
        const request_info: RequestInit = {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(query),
            cache: 'no-cache',
        }
        const response = await fetch(endpoint, request_info);

        if (!response.ok) {
            const error_message = await response.text();
            return Err(`Error querying Beacon API: ${response.status} ${response.statusText} - ${error_message}`);
        }

        // Await the response body as a buffer
        const buffer = await response.arrayBuffer();
        const byte_buffer = new Uint8Array(buffer);

        // Check if the out is a geoparquet format. This is a special case where we need to handle the longitude and latitude columns.
        if (typeof query.output.format === 'object' && 'geoparquet' in query.output.format) {
            const geoOutput = query.output as Extract<Output, { format: { geoparquet: unknown } }>;
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

        switch (query.output.format) {
            case 'parquet': {
                throw new Error("Parquet format not implemented yet");
            }
            case 'arrow':
            case 'ipc': {
                throw new Error("Arrow format not implemented yet");
            }
            case 'netcdf': {
                throw new Error("NetCDF format not implemented yet");
            }
            case 'csv': {
                throw new Error("CSV format not implemented yet");
            }
        }
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

    async getStatus(): Promise<string> {

        const url = new URL(`${this.host}/api/status`);

        const response: string = await this.fetch(url, {}, 'text');

        return response;
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
        if(!responseType) responseType = 'json';
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

    static readParquetBufferAsArrowTable(buffer: Uint8Array): Result<arrow_table.Table, string> {
        try {
            const wasmTable = readParquet(buffer);
            return BeaconClient.readArrowAsArrowTable(wasmTable.intoIPCStream());
        } catch {
            return Err("Failed to read buffer as Parquet");
        }
    }

    static readArrowAsArrowTable(buffer: Uint8Array): Result<arrow_table.Table, string> {
        try {
            const jsTable = tableFromIPC(buffer);
            return Ok(jsTable);
        } catch {
            return Err("Failed to read buffer as Arrow");
        }
    }


}
