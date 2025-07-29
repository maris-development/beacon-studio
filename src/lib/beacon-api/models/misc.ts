
import type { PresetTableType } from './preset_table';
import * as arrow_table from 'apache-arrow';


//  TYPES AND INTERFACES

export type QueryResponse =
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
    description?: string;
}

export type TableType =
    | { logical: LogicalType }
    | { preset: PresetTableType }

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

export interface BeaconSystemInfo {
  beacon_version: string;
  system_info: {
    global_cpu_usage: number;
    cpus: {
      cpu_usage: number;
      name: string;
      vendor_id: string;
      brand: string;
      frequency: number;
    }[];
    physical_core_count: number;
    total_memory: number;
    free_memory: number;
    available_memory: number;
    used_memory: number;
    total_swap: number;
    free_swap: number;
    used_swap: number;
    uptime: number;
    boot_time: number;
    load_average: {
      one: number;
      five: number;
      fifteen: number;
    };
    name: string;
    kernel_version: string;
    os_version: string;
    long_os_version: string;
    distribution_id: string;
    host_name: string;
  } | null;
};
