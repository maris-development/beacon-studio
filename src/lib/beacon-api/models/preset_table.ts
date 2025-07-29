
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
    | RangeFilterColumn
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