import { describe, expect, it, vi } from "vitest";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import type { ArrowRecordBatch } from "@maris-development/beacon-client";
import { translate } from "@/i18n";
import {
    hasRowFilter,
    readOnlyDownload,
    readOnlyPreview,
    readOnlyReason,
    readOnlyResult,
    sqlBlockReason,
    type RawSource
} from "../guard";
import type { BatchSource } from "../run";

function keyOf(sql: string): string | undefined {
    return readOnlyReason(sql)?.key;
}

describe("readOnlyReason accepts a read", () => {
    it.each([
        "SELECT 1",
        "select * from argo where depth < 10",
        "SELECT * FROM argo LIMIT 10;",
        "SELECT 1;;",
        "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
        "VALUES (1), (2)",
        "(SELECT 1) UNION ALL (SELECT 2)",
        "-- the first rows\nSELECT * FROM argo LIMIT 5",
        "/* note */ SELECT 1",
        "SELECT 'DROP TABLE t; DELETE' AS text",
        'SELECT "delete", "insert" FROM argo',
        "SELECT 'it''s' AS text",
        'SELECT "a ""b"" c" FROM argo',
        "SELECT regexp_like(name, '^\\d+$') FROM argo",
        "SELECT replace(name, 'a', 'b') FROM argo ORDER BY name DESC",
        "SELECT * FROM argo -- a comment at the end",
        "SELECT 1\r\n-- windows line end\r\nFROM argo"
    ])("%s", (sql) => {
        expect(readOnlyReason(sql)).toBeNull();
    });
});

describe("readOnlyReason refuses a statement that is not a read", () => {
    it.each([
        "INSERT INTO argo VALUES (1)",
        "UPDATE argo SET depth = 1",
        "DELETE FROM argo",
        "CREATE TABLE t AS SELECT 1",
        "DROP TABLE argo",
        "ALTER TABLE argo ADD COLUMN x INT",
        "TRUNCATE argo",
        "COPY argo TO 'out.csv'",
        "SET datafusion.execution.batch_size = 1",
        "ATTACH 'http://node' AS other",
        "GRANT SELECT ON argo TO reader",
        "REFRESH argo",
        "EXPLAIN ANALYZE SELECT 1",
        "SHOW TABLES",
        "SUMMARIZE argo",
        "MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN DELETE",
        "(INSERT INTO t VALUES (1))"
    ])("%s", (sql) => {
        expect(keyOf(sql)).toBe("workbench.sql.guard.notRead");
    });
});

describe("readOnlyReason refuses a write inside a read", () => {
    it.each([
        ["SELECT * INTO t2 FROM argo", "INTO"],
        ["WITH d AS (DELETE FROM argo RETURNING *) SELECT * FROM d", "DELETE"],
        ["WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x", "INSERT"],
        ["select 1into t2", "INTO"],
        ["SELECT ınsert FROM argo", "INSERT"]
    ])("%s", (sql, word) => {
        expect(readOnlyReason(sql)).toEqual({
            key: "workbench.sql.guard.writeWord",
            values: { word }
        });
    });
});

describe("readOnlyReason refuses more than one statement", () => {
    it.each(["SELECT 1; DROP TABLE argo", "SELECT 1; SELECT 2", "SELECT 1;\n;SELECT 2"])(
        "%s",
        (sql) => {
            expect(keyOf(sql)).toBe("workbench.sql.guard.several");
        }
    );
});

describe("readOnlyReason refuses a text that another dialect reads in another way", () => {
    it.each([
        ["SELECT $$'$$, 1; DROP TABLE t; --'", "workbench.sql.guard.mark"],
        ["SELECT `'`, 1; DROP TABLE t; --'", "workbench.sql.guard.mark"],
        ["SELECT 1 # '\n; DROP TABLE t; -- '", "workbench.sql.guard.mark"],
        ["SELECT $1", "workbench.sql.guard.mark"],
        ["SELECT 'a\\'; DROP TABLE t; --'", "workbench.sql.guard.backslashQuote"],
        ["SELECT 'a\\''", "workbench.sql.guard.backslashQuote"],
        ['SELECT "a\\"; DROP TABLE t; --"', "workbench.sql.guard.backslashQuote"],
        ["/* /* */ DROP TABLE t */ SELECT 1", "workbench.sql.guard.nestedComment"],
        ["/* a /*/ SELECT 1", "workbench.sql.guard.nestedComment"],
        ["SELECT 1 -- x\r'\n; DROP TABLE t; --'", "workbench.sql.guard.lineEnd"]
    ])("%s", (sql, key) => {
        expect(keyOf(sql)).toBe(key);
    });

    it("names the sign", () => {
        expect(readOnlyReason("SELECT `name` FROM argo")?.values).toEqual({ mark: "`" });
    });
});

describe("readOnlyReason refuses an incomplete text", () => {
    it.each(["SELECT 'abc", 'SELECT "abc', "SELECT 1 /* open"])("%s", (sql) => {
        expect(keyOf(sql)).toBe("workbench.sql.guard.unclosed");
    });

    it.each(["", "   ", "-- only a comment", "/* only */", ";"])("%j holds no statement", (sql) => {
        expect(keyOf(sql)).toBe("workbench.sql.guard.empty");
    });
});

describe("hasRowFilter", () => {
    it("finds WHERE and LIMIT in the code", () => {
        expect(hasRowFilter("SELECT * FROM argo WHERE depth < 10")).toBe(true);
        expect(hasRowFilter("select * from argo limit 5")).toBe(true);
    });

    it("ignores the words in strings, names and comments", () => {
        expect(hasRowFilter("SELECT 'WHERE' FROM argo -- LIMIT 5")).toBe(false);
        expect(hasRowFilter('SELECT "limit" FROM argo /* WHERE */')).toBe(false);
    });

    it("gives false for a text that the scan refuses", () => {
        expect(hasRowFilter("SELECT 'a\\' WHERE 1")).toBe(false);
    });
});

describe("sqlBlockReason", () => {
    it("gives the read-only reason first", () => {
        expect(sqlBlockReason("DROP TABLE argo", { requireFilter: true })?.key).toBe(
            "workbench.sql.guard.notRead"
        );
        expect(sqlBlockReason("DROP TABLE argo", { requireFilter: false })?.key).toBe(
            "workbench.sql.guard.notRead"
        );
    });

    it("asks for WHERE or LIMIT only with the safeguard on", () => {
        expect(sqlBlockReason("SELECT * FROM argo", { requireFilter: true })?.key).toBe(
            "workbench.sql.guard.noFilter"
        );
        expect(sqlBlockReason("SELECT * FROM argo", { requireFilter: false })).toBeNull();
        expect(sqlBlockReason("SELECT * FROM argo LIMIT 10", { requireFilter: true })).toBeNull();
    });

    it("gives the English text", () => {
        expect(translate(sqlBlockReason("SELECT * FROM argo", { requireFilter: true })!)).toBe(
            'This SQL query has no WHERE or LIMIT clause. Add one, or turn off "Require a filter" in the settings.'
        );
        expect(translate(readOnlyReason("SELECT * INTO t FROM argo")!)).toBe(
            "The workbench runs only queries that read data. Remove INTO, or put a column name in double quotes."
        );
    });
});

function batchSource() {
    const batch = tableFromArrays({ n: Int32Array.from([1, 2]) }).batches[0];
    const queryBatches = vi.fn<BatchSource["queryBatches"]>(async () => ({
        queryId: null,
        batches: (async function* () {
            yield batch as unknown as ArrowRecordBatch;
        })()
    }));
    const source: BatchSource = { queryBatches };
    return { source, queryBatches };
}

describe("readOnlyPreview", () => {
    it("sends no request for refused SQL", async () => {
        const { source, queryBatches } = batchSource();
        const signal = new AbortController().signal;

        const result = await readOnlyPreview(source, "DROP TABLE argo", {
            signal,
            requireFilter: false
        });

        expect(result).toEqual({ kind: "refused", reason: { key: "workbench.sql.guard.notRead" } });
        expect(queryBatches).not.toHaveBeenCalled();
    });

    it("sends no request without a filter while the safeguard is on", async () => {
        const { source, queryBatches } = batchSource();

        const result = await readOnlyPreview(source, "SELECT * FROM argo", {
            signal: new AbortController().signal,
            requireFilter: true
        });

        expect(result.kind).toBe("refused");
        expect(queryBatches).not.toHaveBeenCalled();
    });

    it("sends the checked text as SQL", async () => {
        const { source, queryBatches } = batchSource();

        const result = await readOnlyPreview(source, "  SELECT n FROM argo LIMIT 2  ", {
            signal: new AbortController().signal,
            requireFilter: true
        });

        expect(queryBatches).toHaveBeenCalledWith(
            { sql: "SELECT n FROM argo LIMIT 2" },
            expect.any(AbortSignal)
        );
        expect(result.kind).toBe("done");
        if (result.kind === "done") expect(result.value.rows).toHaveLength(2);
    });
});

describe("readOnlyDownload", () => {
    it("sends no request for refused SQL", async () => {
        const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response("x"));

        const result = await readOnlyDownload({ queryRaw }, "SELECT 1; DROP TABLE argo", "csv", {
            requireFilter: false
        });

        expect(result.kind).toBe("refused");
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it("sends the checked text with the output format", async () => {
        const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response("x"));

        const result = await readOnlyDownload({ queryRaw }, "SELECT 1 LIMIT 1\n", "parquet", {
            requireFilter: true
        });

        expect(queryRaw).toHaveBeenCalledWith({
            sql: "SELECT 1 LIMIT 1",
            output: { format: "parquet" }
        });
        expect(result.kind).toBe("done");
    });
});

describe("readOnlyResult", () => {
    // A copy owns a plain ArrayBuffer, which `BodyInit` asks for.
    const ipc = () => tableToIPC(tableFromArrays({ n: Int32Array.from([1, 2]) }), "stream").slice();

    it("sends no request for refused SQL", async () => {
        const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response(ipc()));

        const result = await readOnlyResult({ queryRaw }, "DELETE FROM argo", {
            signal: new AbortController().signal,
            requireFilter: false,
            cellLimit: 1000
        });

        expect(result.kind).toBe("refused");
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it("sends no request without a filter while the safeguard is on", async () => {
        const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response(ipc()));

        const result = await readOnlyResult({ queryRaw }, "SELECT * FROM argo", {
            signal: new AbortController().signal,
            requireFilter: true,
            cellLimit: 1000
        });

        expect(result.kind).toBe("refused");
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it("sends the checked text as SQL with no output format", async () => {
        const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response(ipc()));

        const result = await readOnlyResult({ queryRaw }, "  SELECT n FROM argo LIMIT 2\n", {
            signal: new AbortController().signal,
            requireFilter: true,
            cellLimit: 1000
        });

        expect(queryRaw).toHaveBeenCalledWith(
            { sql: "SELECT n FROM argo LIMIT 2" },
            undefined,
            expect.any(AbortSignal)
        );
        expect(result.kind).toBe("done");
        if (result.kind === "done") expect(result.value.table.numRows).toBe(2);
    });
});
