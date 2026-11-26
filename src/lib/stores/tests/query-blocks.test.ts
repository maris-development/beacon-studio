import { describe, expect, it } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import type { QueryDraft } from "@/query/draft";
import { blockTable } from "../query-blocks";
import type { StoredQuery } from "../stored-query";

function draft(tableName: string): QueryDraft {
    return { tableName, selectedFields: [], outputFormat: "csv", spatialFilter: null };
}

function compiled(from: CompiledQuery["from"]): CompiledQuery {
    return {
        query_parameters: [{ column: "TEMP", alias: null }],
        filters: [],
        from,
        output: { format: "csv" }
    };
}

function block(parts: Pick<StoredQuery, "draft" | "compiled">): StoredQuery {
    return parts as StoredQuery;
}

describe("blockTable", () => {
    it("reads the table of the draft", () => {
        expect(blockTable(block({ draft: draft("wod"), compiled: compiled("era5") }))).toBe("wod");
    });

    it("reads the table of the seed when the block has no draft", () => {
        expect(blockTable(block({ draft: null, compiled: compiled("argo") }))).toBe("argo");
    });

    it("gives no table for a seed that reads a file", () => {
        const from = { format: { arrow: { path: "data.arrow" } } } as CompiledQuery["from"];
        expect(blockTable(block({ draft: null, compiled: compiled(from) }))).toBe("");
    });

    it("gives no table for an empty block", () => {
        expect(blockTable(block({ draft: null, compiled: null }))).toBe("");
        expect(blockTable(null)).toBe("");
    });
});
