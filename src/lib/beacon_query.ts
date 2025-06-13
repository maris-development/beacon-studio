import { Err, Ok, Result } from "./result";

export class QueryBuilder {
    selects: Select[] = []
    filters: Filter[] = []
    output: Output | null = null

    constructor() {

    }

    addSelect(select: Select): QueryBuilder {
        this.selects.push(select);
        return this;
    }

    addFilter(filter: Filter): QueryBuilder {
        this.filters.push(filter);
        return this;
    }

    setOutput(output: Output): QueryBuilder {
        this.output = output;
        return this;
    }

    compile(): Result<CompiledQuery, string> {
        if (this.selects.length === 0) {
            return Err("No query parameters specified");
        }

        if (this.output === null) {
            return Err("No output format specified");
        }

        return Ok({
            query_parameters: this.selects,
            filters: this.filters,
            output: this.output
        });
    }
}

export type CompiledQuery = {
    query_parameters: Select[],
    filters: Filter[],
    output: Output
};

export type Select = { column: string, alias: string | null };

export type Filter =
    | { for_query_parameter: string, min: number | string, max: number | string }
    | { for_query_parameter: string, eq: number | string }
    | { for_query_parameter: string, neq: number | string }
    | { or: Filter[] }
    | { and: Filter[] };

export type Output =
    | { format: 'csv' }
    | { format: 'arrow' | 'ipc' }
    | { format: 'netcdf' }
    | { format: { 'geoparquet': { longitude_column: string, latitude_column: string } }, }
    | { format: 'parquet' };