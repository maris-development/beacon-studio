import { describe, expect, it } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import { isSqlRunQuery } from "../run-query";

describe("isSqlRunQuery", () => {
    it("accepts the SQL text of a block", () => {
        expect(isSqlRunQuery({ sql: "SELECT 1" })).toBe(true);
    });

    it("refuses a compiled query and no query", () => {
        const query: CompiledQuery = {
            query_parameters: [],
            filters: [],
            from: "wod",
            output: { format: "csv" }
        };

        expect(isSqlRunQuery(query)).toBe(false);
        expect(isSqlRunQuery(null)).toBe(false);
        expect(isSqlRunQuery(undefined)).toBe(false);
    });
});
