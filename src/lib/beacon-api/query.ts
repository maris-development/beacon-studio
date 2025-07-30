import type { from } from "arquero";
import { Err, Ok, Result } from "../util/result";

export class QueryBuilder {
    selects: Select[] = []
    filters: Filter[] = []
    from: From = null
    output: Output | null = null
    limit?: number
    offset?: number

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

    setFrom(from: From): QueryBuilder {
        this.from = from;
        return this;
    }

    setLimit(limit: number): QueryBuilder {
        if (limit < 0) {
            throw new Error("Limit must be a non-negative number");
        }
        this.limit = limit;
        return this;
    }

    setOffset(offset: number): QueryBuilder {
        if (offset < 0) {
            throw new Error("Offset must be a non-negative number");
        }
        this.offset = offset;
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
            from: this.from,
            query_parameters: this.selects,
            filters: this.filters,
            output: this.output,
            limit: this.limit,
            offset: this.offset
        });
    }
}

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
    | { or: Filter[] }
    | { and: Filter[] };

export type Output =
    | { format: 'csv' }
    | { format: 'arrow' | 'ipc' }
    | { format: 'netcdf' }
    | { format: { 'geoparquet': { longitude_column: string, latitude_column: string } }, }
    | { format: 'parquet' };

export type From =
    | null
    | String
    | { format: Format }

export type Format =
    | { "arrow": { path: string } }
    | { "parquet": { path: string } }
    | { "netcdf": { path: string } }
    | { "odv": { path: string } }
    | { "csv": { path: string, delimiter: string, infer_schema_records: number } }