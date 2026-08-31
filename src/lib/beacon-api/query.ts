import type { CompiledQuery, Filter, From, GeoParquetOutputFormat, Output, Select } from "./types";
import { requireCurrentInstance } from "@/services/beacon-instance";
import { Utils } from "@/utils";
// import type { ObjectEncodingOptions } from "node:fs";

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

	    const beaconInstance = requireCurrentInstance();

        let tokenArg = "";

        if(beaconInstance.token){
            tokenArg = `, jwt_token="${beaconInstance.token}"`;
        }

        code += `\n# TODO: Add user agent to the client constructor if the Beacon API requires it.`;
        code += `\n# user_agent = [instert email adress]`;
        code += `\n`;

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

        if ("geometry" in filter) {
            // Point-in-polygon over the longitude and latitude columns. The Python
            // client has no class for it, so the raw filter object goes out.
            code += JSON.stringify({
                longitude_query_parameter: filter.longitude_query_parameter,
                latitude_query_parameter: filter.latitude_query_parameter,
                geometry: filter.geometry
            });

        } else if ("min" in filter && "max" in filter) {
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

export class SQLQueryBuilder {

    static toSQL(compiledQuery: CompiledQuery): string {
        const columns = compiledQuery.query_parameters
            .map(select => {
                if (select.alias) {
                    return `"${select.column}" AS "${select.alias}"`;
                }

                return `"${select.column}"`;
            })
            .join(",\n    ");

        let sql = `SELECT\n    ${columns}`;
        sql += `\nFROM "${compiledQuery.from}"`;

        if (compiledQuery.filters && compiledQuery.filters.length > 0) {
            const filters = compiledQuery.filters
                .map(filter => SQLQueryBuilder.filterToSQL(filter))
                .join("\n    AND ");

            sql += `\nWHERE ${filters}`;
        }

        sql += ";";

        return sql;
    }

    private static filterToSQL(filter: Filter): string {

        if ("geometry" in filter) {
            const geometry = JSON.stringify(filter.geometry);

            return `ST_Within(
            ST_Point("${filter.longitude_query_parameter}", "${filter.latitude_query_parameter}"),
            ST_GeomFromGeoJSON('${geometry.replace(/'/g, "''")}'))`;
        }

        if ("min" in filter && "max" in filter) {
            const conditions: string[] = [];

            if (filter.min !== undefined && filter.min !== null && filter.min !== "") {
                conditions.push(
                    `"${filter.for_query_parameter}" >= ${SQLQueryBuilder.valueToSQL(filter.min)}`
                );
            }

            if (filter.max !== undefined && filter.max !== null && filter.max !== "") {
                conditions.push(
                    `"${filter.for_query_parameter}" <= ${SQLQueryBuilder.valueToSQL(filter.max)}`
                );
            }

            return conditions.join(" AND ");
        }

        if ("eq" in filter) {
            return `"${filter.for_query_parameter}" = ${SQLQueryBuilder.valueToSQL(filter.eq)}`;
        }

        if ("neq" in filter) {
            return `"${filter.for_query_parameter}" <> ${SQLQueryBuilder.valueToSQL(filter.neq)}`;
        }

        if ("gt" in filter) {
            return `"${filter.for_query_parameter}" > ${SQLQueryBuilder.valueToSQL(filter.gt)}`;
        }

        if ("gt_eq" in filter) {
            return `"${filter.for_query_parameter}" >= ${SQLQueryBuilder.valueToSQL(filter.gt_eq)}`;
        }

        if ("lt" in filter) {
            return `"${filter.for_query_parameter}" < ${SQLQueryBuilder.valueToSQL(filter.lt)}`;
        }

        if ("lt_eq" in filter) {
            return `"${filter.for_query_parameter}" <= ${SQLQueryBuilder.valueToSQL(filter.lt_eq)}`;
        }

        if ("is_not_null" in filter) {
            return `"${filter.is_not_null.for_query_parameter}" IS NOT NULL`;
        }

        if ("is_null" in filter) {
            return `"${filter.is_null.for_query_parameter}" IS NULL`;
        }

        if ("or" in filter) {
            const filters = filter.or
                .map(f => SQLQueryBuilder.filterToSQL(f))
                .join(" OR ");

            return `(${filters})`;
        }

        if ("and" in filter) {
            const filters = filter.and
                .map(f => SQLQueryBuilder.filterToSQL(f))
                .join(" AND ");

            return `(${filters})`;
        }

        throw new Error("Unsupported filter type");
    }

    private static valueToSQL(value: unknown): string {
        if (value === null || value === undefined) {
            return "NULL";
        }

        if (typeof value === "number") {
            return String(value);
        }

        if (typeof value === "boolean") {
            return value ? "TRUE" : "FALSE";
        }

        if (typeof value === "string") {
            // Escape single quotes for SQL
            return `'${value.replace(/'/g, "''")}'`;
        }

        throw new Error(`Unsupported SQL value type: ${typeof value}`);
    }
}

export class FileDownloader {

    public static download(
        content: string,
        fileName: string,
        mimeType: string = "text/plain"
    ): void {
        if (!content) return;

        const blob = new Blob([content], {
            type: mimeType,
        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
}

/**
 * Create a Jupyter Notebook file from the provided Python code and download it to the user's machine.
 */
export class PythonQueryExporter {

    /**
     * Converts Python code to a Jupyter Notebook format.
     * @param pythonCode The Python code (as string) to be converted to notebook.
    */

    private static pythonToNotebook(pythonCode: string): string {
        const notebook = {
            cells: [
                {
                    cell_type: "code",
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: pythonCode.split("\n").map((line, index, lines) =>
                        index < lines.length - 1 ? `${line}\n` : line
                    ),
                },
            ],
            metadata: {
                kernelspec: {
                    display_name: "Python 3",
                    language: "python",
                    name: "python3",
                },
                language_info: {
                    name: "python",
                },
            },
            nbformat: 4,
            nbformat_minor: 5,
        };

        return JSON.stringify(notebook, null, 2);
    }

    /**
     * Attempts to export the provided python code to a Jupyter Notebook file and download it to the user's machine.
     * @param pythonCode python code (as string) to be exported to notebook.
     * @param fileName name of the notebook file to be downloaded.
     */
    public static downloadAsNotebook(pythonCode: string, fileName: string = "beacon-studio-query.ipynb"): void {
       
        let ipynbCode: string;
        try{
            ipynbCode = this.pythonToNotebook(pythonCode);
        }
        catch (error) {
            throw new Error(`Failed to convert Python code to Jupyter Notebook format: ${error.message}`);
        }
        
        try{
            if(!ipynbCode) return;

            FileDownloader.download(ipynbCode, fileName, "application/x-ipynb+json");
        }
        catch(error){
            throw new Error(`Failed to write Jupyter Notebook file: ${error.message}`);
        }
    }
}

/**
 * Attemps to export the provided JSON to a JSON file.
 */
export class JSONQueryExporter {
    /**
 * Attempts to export the provided JSON to a file and download it to the user's machine.
 * @param jsonCode JSON content as a string.
 * @param fileName Name of the JSON file to be downloaded.
 */
    public static downloadAsJson(jsonCode: string, fileName: string = "beacon-studio-query.json"): void {

        try {
            if (!jsonCode) return;

            FileDownloader.download(jsonCode, fileName, "application/json");
        }
        catch (error) {
            throw new Error(
                `Failed to write JSON file: ${error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }
}

export class SQLQueryExporter {

    /**
     * Attempts to export the provided SQL to a .sql file and download it
     * to the user's machine.
     *
     * @param sqlCode SQL content as a string.
     * @param fileName Name of the SQL file to be downloaded.
     */
    public static downloadAsSql(sqlCode: string, fileName: string = "beacon-studio-query.sql"): void {
        try {
            if (!sqlCode) return;

            FileDownloader.download(sqlCode, fileName, "application/sql");
        }
        catch (error) {
            throw new Error(
                `Failed to write SQL file: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }
}