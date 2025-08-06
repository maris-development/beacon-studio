import { Err, Ok, Result } from "../util/result";
import type { CompiledQuery, Filter, From, Output, Select } from "./types";

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

