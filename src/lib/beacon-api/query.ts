import { Err, Ok, Result } from "../util/result";
import type { CompiledQuery, Filter, From, Output, Select } from "./types";

export class QueryBuilder {
    selects: Select[] = []
    filters: Filter[] = []
    from: From = null
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

    setFrom(from: From): QueryBuilder {
        this.from = from;
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
            output: this.output
        });
    }
}

