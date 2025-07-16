
import * as arrow_table from 'apache-arrow';
import type { CompiledQuery, Output } from './query';
import { Err, Ok, Result } from '../util/result';
import { readParquet } from 'parquet-wasm/esm';
import { tableFromIPC } from 'apache-arrow';
import type { BeaconInstance } from '@/stores/config';
import { MemoryCache } from '@/cache';


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
            const geoOutput = query.output as Extract<Output, { format: { geoparquet: any } }>;
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

    fetch<T>(
        input: string | URL | globalThis.Request,
        init?: RequestInit,
    ): Promise<T> {

        if(!init) init = {};

        //merge headers with auth headers:
        init.headers = {
            ...new Headers(this.getAuthHeaders(init.headers)),
        };

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


    static responseToJsonOrError<T = unknown>(response: Response): Promise<T|null> {
        if (!response.ok) {
            return response.text().then(text => {
                // Wrap whatever you want—here I’m embedding the server message
                throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
            });
        }
        
        return response.text().then(content => {
            
            if( content === '') {
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

//  TYPES AND INTERFACES

type QueryResponse =
    | { kind: 'error'; error_message: string }
    | { kind: 'json' | 'csv' | 'netcdf'; buffer: Uint8Array }
    | { kind: 'parquet' | 'arrow'; arrow_table: arrow_table.Table }
    | { kind: 'geoparquet'; arrow_table: arrow_table.Table };


export interface FunctionNameObject {
    function_name: string;
}

export interface Schema {
    fields: Field[];
    metadata: Record<string, unknown>;
}

export interface Field {
    name: string;
    data_type: DataType;
    nullable: boolean;
    dict_id: number;
    dict_is_ordered: boolean;
    metadata: Record<string, unknown>;
}

export type PrimitiveType =
    | 'Int32'
    | 'Utf8'
    | 'Float32'
    | 'Float64'
    | 'Int8';

export interface TimestampDataType {
    Timestamp: [string, string | null];
}

export type DataType = PrimitiveType | TimestampDataType;


export interface TableDefinition {
    table_name: string;
    table_type: TableType;
    table_extensions: TableExtension[];
}

export interface TableType {
    logical?: LogicalType;
    // extend with other table_type variants if needed
}

export interface LogicalType {
    logical_table: LogicalTable;
}

export interface LogicalTable {
    table_name: string;
    paths: string[];
    file_format: string;
}

// Placeholder for future extensions; adjust the type as needed
export type TableExtension = string;

export interface NodeMetrics {
    operator: string;
    metrics: Metrics;
    children: NodeMetrics[];
}

export type Metrics = Record<string, unknown>;

export interface QueryMetricsResult {
    input_rows: number;
    input_bytes: number;
    result_num_rows: number;
    result_size_in_bytes: number;
    file_paths: string[];
    query: Record<string, unknown>; // opaque query object
    query_id: string;
    parsed_logical_plan: unknown[]; // opaque plan nodes
    optimized_logical_plan: unknown[];
    node_metrics: NodeMetrics;
}
