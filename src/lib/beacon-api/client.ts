
import * as arrow_table from 'apache-arrow';
import type { CompiledQuery, Output } from './query';
import { format } from 'path';
import { Err, Ok, Result } from '../util/result';
import { buffer } from 'stream/consumers';
import { readParquet } from 'parquet-wasm/esm';
import { tableFromIPC } from 'apache-arrow';

type QueryResponse =
    | { kind: 'error'; error_message: string }
    | { kind: 'json' | 'csv' | 'netcdf'; buffer: Uint8Array }
    | { kind: 'parquet' | 'arrow'; arrow_table: arrow_table.Table }
    | { kind: 'geoparquet'; arrow_table: arrow_table.Table };

export class BeaconClient {
    host: string;
    token: string | null = null;

    constructor(host: string, token: string | null = null) {
        this.host = host;
        this.token = token;
    }

    async dataTableSchema(table: string) {
        throw new Error("dataTableSchema not implemented yet");
    }

    async dataTables() {
        throw new Error("dataTables not implemented yet");
    }

    async query(query: CompiledQuery): Promise<Result<QueryResponse, string>> {
        const json_query = JSON.stringify(query);
        const endpoint = `${this.host}/api/query`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Create a request to the Beacon API using fetch
        let request_info: RequestInit = {
            method: 'POST',
            headers: headers,
            body: json_query,
            cache: 'no-cache',
        }
        let response = await fetch(endpoint, request_info);
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
            return readParquetBufferAsArrowTable(byte_buffer).map((arrow_table) => {
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
}


function readParquetBufferAsArrowTable(buffer: Uint8Array): Result<arrow_table.Table, string> {
    try {
        const wasmTable = readParquet(buffer);
        return readArrowAsArrowTable(wasmTable.intoIPCStream());
    } catch {
        return Err("Failed to read buffer as Parquet");
    }
}

function readArrowAsArrowTable(buffer: Uint8Array): Result<arrow_table.Table, string> {
    try {
        const jsTable = tableFromIPC(buffer);
        return Ok(jsTable);
    } catch {
        return Err("Failed to read buffer as Arrow");
    }
}
