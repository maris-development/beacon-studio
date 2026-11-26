import { describe, expect, it } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import type { QueryDraft } from "@/query/draft";
import { emptyQueryPatch, needsDraftSeed } from "../query-blocks";
import type { StoredQuery } from "../stored-query";

const PAIR = { latitude: "LAT", longitude: "LON" };

function draft(tableName: string, outputFormat = "parquet"): QueryDraft {
    return {
        tableName,
        selectedFields: [{ name: "TEMP", type: "Float64", selected_filters: [] }],
        outputFormat,
        spatialFilter: null
    };
}

function compiled(from: string): CompiledQuery {
    return {
        query_parameters: [{ column: "TEMP", alias: null }],
        filters: [],
        from,
        output: { format: "csv" }
    };
}

function block(parts: Partial<StoredQuery>): StoredQuery {
    return {
        draft: null,
        compiled: null,
        coordinateColumns: PAIR,
        datasetKey: "key",
        rowCount: 10,
        ...parts
    } as StoredQuery;
}

describe("emptyQueryPatch", () => {
    it("drops the seed, the pair and the result of a seed block", () => {
        const seed = block({ compiled: compiled("era5") });
        const patch = emptyQueryPatch(seed, "wod");

        expect(patch.draft?.tableName).toBe("wod");
        expect(patch.draft?.selectedFields).toEqual([]);
        expect(patch.compiled).toBeNull();
        expect(patch.coordinateColumns).toBeNull();
        expect(patch.datasetKey).toBeNull();
        expect(patch.rowCount).toBeNull();
        expect(needsDraftSeed({ ...seed, ...patch })).toBe(false);
    });

    it("clears the columns and keeps the output format of a draft block", () => {
        const patch = emptyQueryPatch(
            block({ draft: draft("era5", "netcdf"), compiled: compiled("era5") }),
            "wod"
        );

        expect(patch.draft).toMatchObject({
            tableName: "wod",
            selectedFields: [],
            outputFormat: "netcdf"
        });
        expect(patch.compiled).toBeNull();
        expect(patch.coordinateColumns).toBeNull();
    });

    it("gives a draft with no table for a node switch", () => {
        expect(emptyQueryPatch(block({ draft: draft("era5") }), "").draft?.tableName).toBe("");
    });
});
