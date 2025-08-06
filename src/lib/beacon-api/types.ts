import * as ApacheArrow from 'apache-arrow';

//  TYPES AND INTERFACES

export type QueryResponse = ErrorQueryResponse | JsonQueryResponse | CsvQueryResponse | NetCDFQueryResponse
    | GeoParquetQueryResponse | ParquetQueryResponse | ArrowQueryResponse;


export type GeoParquetQueryResponse = { kind: 'geoparquet'; arrow_table: ApacheArrow.Table };
export type ParquetQueryResponse = { kind: 'parquet' | 'arrow'; arrow_table: ApacheArrow.Table };
export type ArrowQueryResponse = ParquetQueryResponse;
export type JsonQueryResponse = { kind: 'json'; buffer: Uint8Array };
export type CsvQueryResponse = { kind: 'csv'; buffer: Uint8Array };
export type NetCDFQueryResponse = { kind: 'netcdf'; buffer: Uint8Array };
export type ErrorQueryResponse = { kind: 'error'; error_message: string };

export type QueryResponseKind = 'error' | 'json' | 'csv' | 'netcdf' | 'geoparquet' | 'parquet' | 'arrow';

export interface FunctionNameObject {
    function_name: string;
}

export interface Schema {
    fields: SchemaField[];
    metadata: Record<string, unknown>;
}

export interface SchemaField {
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

export type CompiledQuery = {
    query_parameters: Select[],
    filters: Filter[],
    from: From,
    output: Output,
    limit?: number,
    offset?: number
};

export type Select = { column: string, alias: string | null };

export type Filter =
    | { for_query_parameter: string, min: number | string, max: number | string }
    | { for_query_parameter: string, eq: number | string }
    | { for_query_parameter: string, neq: number | string }
    | { for_query_parameter: string, gt: number | string }
    | { for_query_parameter: string, gt_eq: number | string }
    | { for_query_parameter: string, lt: number | string }
    | { for_query_parameter: string, lt_eq: number | string }
    | { is_not_null: { for_query_parameter: string } }
    | { is_null: { for_query_parameter: string } }
    | { or: Filter[] }
    | { and: Filter[] };

export type Output = { format: OutputFormat };

export type OutputFormat = 'csv' | 'arrow' | 'netcdf' | 'parquet' | 'ipc' | GeoParquetOutputFormat;

export type GeoParquetOutputFormat = { geoparquet: { longitude_column: string, latitude_column: string } };

export type From =
    | null
    | string
    | { format: Format }

export type Format =
    | { "arrow": { path: string } }
    | { "parquet": { path: string } }
    | { "netcdf": { path: string } }
    | { "odv": { path: string } }
    | { "csv": { path: string, delimiter: string, infer_schema_records: number } }

// Preset table types

export interface PresetTableType {
    data_columns: PresetColumn[];
    metadata_columns: PresetColumn[];
}

export interface RangeFilterColumn {
    min?: string | number;
    max?: string | number;
}

export interface OptionsFilterColumn {
    values: Array<string | number>;
}

export type AnyFilterColumn = Record<string, unknown>;

// union type
export type FilterColumn =
    RangeFilterColumn
    | OptionsFilterColumn
    | AnyFilterColumn;


type BasePresetColumn = {
    filter: FilterColumn;
    column_name: string;
    alias: string;
    description: string;
};

export type PresetColumn = BasePresetColumn & {
    [K in Exclude<string, keyof BasePresetColumn>]?: string;
};