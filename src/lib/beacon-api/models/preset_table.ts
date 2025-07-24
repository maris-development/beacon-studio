import { Err, Ok, type Result } from "@/util/result";

export interface PresetTableType {
    data_columns: DataColumn[];
    metadata_columns: MetadataColumn[];
    preset_filter_columns: FilterColumn[];
}

export interface DataColumn {
    column_name: string;
    alias: string;
    description: string;

    // <— “catch‑all” for any other string→string pair that are metadata
    [key: string]: string;
}

export interface MetadataColumn {
    column_name: string;
    alias: string;
    description: string;
    [key: string]: string;  // captures any extra metadata fields too
}

// base
interface BaseFilterColumn {
    column_name: string;
}

// 1) range
export interface RangeFilterColumn extends BaseFilterColumn {
    min?: string | number;
    max?: string | number;
}

// 2) exact values
export interface OptionsFilterColumn extends BaseFilterColumn {
    values: Array<string | number>;
}

// 3) no filters
export interface EmptyFilterColumn extends BaseFilterColumn { }

// union type
export type FilterColumn =
    | RangeFilterColumn
    | OptionsFilterColumn
    | EmptyFilterColumn;
