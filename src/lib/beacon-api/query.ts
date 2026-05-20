import type { CompiledQuery, Filter, From, GeoParquetOutputFormat, Output, Select } from "./types";
import { currentBeaconInstance} from "$lib/stores/config";
import { get } from "svelte/store";
import { Utils } from "@/utils";
import { addToast } from "@/stores/toasts";

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

    /**
     * Compiles the query into a format suitable for execution.
     * @returns CompiledQuery object representing the Beacon Query
     * @throws Error if required fields are missing
     */
    compile(): CompiledQuery {
        if (this.selects.length === 0) {
            throw new Error("Failed to compile query: No query parameters specified");
        }

        if (this.output === null) {
            throw new Error("Failed to compile query: No output format specified");
        }

        return {
            from: this.from,
            query_parameters: this.selects,
            filters: this.filters,
            output: this.output,
            limit: this.limit,
            offset: this.offset
        };
    }

    // Not really needed.
    // static decompile(compiledQuery: CompiledQuery): QueryBuilder {
    //     const queryBuilder = new QueryBuilder();
    //     queryBuilder.selects = compiledQuery.query_parameters;
    //     queryBuilder.filters = compiledQuery.filters;
    //     queryBuilder.from = compiledQuery.from;
    //     queryBuilder.output = compiledQuery.output;
    //     queryBuilder.limit = compiledQuery.limit;
    //     queryBuilder.offset = compiledQuery.offset;
    //     return queryBuilder;
    // }

}


export class PythonQueryBuilder  {

    static toPythonCode(compiledQuery: CompiledQuery): string {
        let code = "from beacon_api import Client\n";
        code += "from beacon_api.query import *\n";

	    const beaconInstance = get(currentBeaconInstance);

        if(!beaconInstance){
            throw new Error("No beacon instance selected");
        }

        let tokenArg = "";

        if(beaconInstance.token){
            tokenArg = `, jwt_token="${beaconInstance.token}"`;
        }

        code += `\nclient = Client("${beaconInstance.url}"${tokenArg})`;
        code += `\n`

        code += `\ntables = client.list_tables()`;
        code += `\ntable = tables["${compiledQuery.from}"]`;
        code += `\n`

        code += `\nquery = table.query()`;

        compiledQuery.query_parameters.forEach(select => {
            code = PythonQueryBuilder.applySelect(code, select);
        });

        code += `\n`

        if (compiledQuery.filters) {

            code += `\n# TODO: Check types of filter arguments, e.g. a numeric column should not have string values in filters, and vice versa.`;

            compiledQuery.filters.forEach(filter => {
                code = PythonQueryBuilder.applyFilter(code, filter);
            });
    
            code += `\n`

        }


        code = PythonQueryBuilder.applyOutputFormat(code, compiledQuery.output);

        return code;
    }

    private static applySelect(code: string, select: Select): string {
        code += `\nquery.add_select_column("${select.column}"`;
        if (select.alias) {
            code += `, alias="${select.alias}"`;
        }
        code += `)`;
        return code;
    }


    private static applyFilter(code: string, filter: Filter, line_prefix: string = ""): string {

        line_prefix = "\n" + line_prefix;

        const isAndOr = line_prefix.length > 1;

        code += line_prefix;

        if(!isAndOr){
            code += `query.add_filter(`;
        }

        if ("min" in filter && "max" in filter) {
            let min = filter.min;
            let max = filter.max;

            if(!min){
                min = '""';
            } else if (!Utils.isNumber(min)) {
                min = `"${min}"`;
            }

            if(!max){
                max = '""';
            }if (!Utils.isNumber(max)) {
                max = `"${max}"`;
            }

            // MinMaxFilter
            code += `RangeFilter("${filter.for_query_parameter}", gt_eq=${min}, lt_eq=${max})`;

        } else if ("eq" in filter) {
            let eq = filter.eq;

            if(!eq){
                eq = '""';
            } else if (!Utils.isNumber(eq)) {
                eq = `"${eq}"`;
            }

            code += `EqualsFilter("${filter.for_query_parameter}", ${eq})`;

        } else if ("neq" in filter) {
            let neq = filter.neq;

            if(!neq){
                neq = '""';
            } else if (!Utils.isNumber(neq)) {
                neq = `"${neq}"`;
            }

            code += `NotEqualsFilter("${filter.for_query_parameter}", ${neq})`;

        } else if ("gt" in filter) {
            let gt = filter.gt;

            if(!gt){
                gt = '""';
            } else if (!Utils.isNumber(gt)) {
                gt = `"${gt}"`;
            }

            code += `ExlusiveRangeFilter("${filter.for_query_parameter}", gt=${gt})`;

        } else if ("gt_eq" in filter) {
            let gt_eq = filter.gt_eq;

            if(!gt_eq){
                gt_eq = '""';
            } else if (!Utils.isNumber(gt_eq)) {
                gt_eq = `"${gt_eq}"`;
            }

            code += `RangeFilter("${filter.for_query_parameter}", gt_eq=${gt_eq})`;

        } else if ("lt" in filter) {
            let lt = filter.lt;

            if(!lt){
                lt = '""';
            } else if (!Utils.isNumber(lt)) {
                lt = `"${lt}"`;
            }

            code += `ExclusiveRangeFilter("${filter.for_query_parameter}", lt=${lt})`;

        } else if ("lt_eq" in filter) {
            let lt_eq = filter.lt_eq;

            if(!lt_eq){
                lt_eq = '""';
            } else if (!Utils.isNumber(lt_eq)) {
                lt_eq = `"${lt_eq}"`;
            }

            code += `RangeFilter("${filter.for_query_parameter}", lt_eq=${lt_eq})`;

        } else if ("is_not_null" in filter) {
            code += `IsNotNullFilter("${filter.is_not_null.for_query_parameter}")`;

        } else if ("is_null" in filter) {
            code += `IsNullFilter("${filter.is_null.for_query_parameter}")`;

        } else if ("or" in filter) {
            code += `query.add_filter(OrFilter([`;

            for (const [index, f] of filter.or.entries()) {
                code = this.applyFilter(code, f, "\t");

                if(index < filter.or.length - 1){
                    code += `,`;
                }
            }

            code += `${line_prefix}]))`;

        } else if ("and" in filter) {
            code += `query.add_filter(AndFilter([`;

            for (const [index, f] of filter.and.entries()) {
                code = this.applyFilter(code, f, "\t");

                if(index < filter.and.length - 1){
                    code += `,`;
                }
            }

            code += `${line_prefix}]))`;
        }

        if(!isAndOr){
            code += `)`;
        }

        return code;
    }

    private static applyOutputFormat(code: string, output: Output, ): string {
        if (output.format === "zarr") {
            code += `\nquery.to_zarr("output.zarr")`;
        } else if (output.format === "csv") {
            code += `\nquery.to_csv("output.csv")`;
        } else if (output.format === "ipc" || output.format === "arrow") {
            code += `\nquery.to_arrow("output.arrow")`;
        } else if (output.format === "netcdf") {
            code += `\nquery.to_netcdf("output.nc")`;
        } else if (
            output.format === "parquet" ||
            (output.format as GeoParquetOutputFormat).geoparquet !== undefined
        ) {
            code += `\nquery.to_parquet("output.parquet")`;
        }

        return code;
    }
}
