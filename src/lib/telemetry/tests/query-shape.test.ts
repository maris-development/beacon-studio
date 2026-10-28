import { describe, expect, it } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import { describeQuery } from "../query-shape";
import { fitProps } from "../props";

describe("describeQuery for SQL", () => {
    it("describes the trimmed text", () => {
        const shape = describeQuery({ sql: "  SELECT lat, lon FROM wod WHERE depth < 10\n" });

        expect(shape).toEqual({
            mode: "sql",
            sql: "SELECT lat, lon FROM wod WHERE depth < 10",
            sqlLength: 41,
            hasFilter: true,
            limit: null
        });
    });

    it("reports a text with no WHERE and no LIMIT", () => {
        expect(describeQuery({ sql: "SELECT * FROM wod" })).toMatchObject({ hasFilter: false });
    });

    it("cuts a long text and keeps the full length", () => {
        const sql = `SELECT ${"a, ".repeat(600)}b FROM wod`;

        const shape = describeQuery({ sql });

        expect(shape).toMatchObject({ sqlLength: sql.length, sqlTruncated: true });
        expect((shape as { sql: string }).sql).toHaveLength(1000);
    });

    it("keeps the shape of a compiled query", () => {
        const query: CompiledQuery = {
            query_parameters: [{ column: "lat", alias: null }],
            filters: [],
            from: "wod",
            output: { format: "csv" }
        };

        expect(describeQuery(query)).toMatchObject({ table: "wod", columns: ["lat"] });
        expect(describeQuery(query)).not.toHaveProperty("mode");
    });
});

describe("fitProps with SQL text", () => {
    it("cuts the SQL text first and keeps the other fields", () => {
        const props = { mode: "sql", sql: "x".repeat(8000), sqlLength: 8000, rowCount: 5 };

        const fitted = fitProps(props);

        expect(fitted).toMatchObject({
            mode: "sql",
            sqlLength: 8000,
            rowCount: 5,
            sqlTruncated: true
        });
        expect((fitted as { sql: string }).sql).toHaveLength(200);
    });

    it("leaves a short text alone", () => {
        const props = { mode: "sql", sql: "SELECT 1", sqlLength: 8 };

        expect(fitProps(props)).toEqual(props);
    });
});
