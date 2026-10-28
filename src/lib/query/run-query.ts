/**
 * The query that the query store runs: a compiled builder query, or the SQL text of a workbench SQL block.
 *
 * The SQL form is not the `SqlQuery` of the SDK. It holds no output format, because the store always reads Arrow.
 */
import type { CompiledQuery } from "@/beacon-api/types";

/** The SQL text of a workbench SQL block, trimmed. */
export interface SqlRunQuery {
    sql: string;
}

export type RunQuery = CompiledQuery | SqlRunQuery;

export function isSqlRunQuery(query: RunQuery | null | undefined): query is SqlRunQuery {
    return !!query && typeof (query as Partial<SqlRunQuery>).sql === "string";
}
