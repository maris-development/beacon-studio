import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import { Utils } from "@/utils";
import {
    buildShareLink,
    decodeSharedQuery,
    encodeSharedQuery,
    runQueryOf,
    SHARE_LINK_PATH,
    type ShareableQuery,
    type StoredQuery
} from "../stored-query";

vi.mock("@/telemetry", () => ({ track: vi.fn(), describeQuery: vi.fn(() => ({})) }));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));

const NODE_URL = "https://beacon.example.org";

function compiledQuery(): CompiledQuery {
    return {
        query_parameters: [
            { column: "TEMP", alias: null },
            { column: "LATITUDE", alias: null }
        ],
        filters: [{ for_query_parameter: "TEMP", min: 0, max: 10 }],
        from: "wod",
        output: { format: "csv" }
    };
}

function shareable(overrides: Partial<ShareableQuery> = {}): ShareableQuery {
    return {
        compiled: null,
        name: "Query 1",
        node: { id: "n1", name: "Node", url: NODE_URL },
        coordinateColumns: null,
        ...overrides
    };
}

/** The `?query=` value of a share link. */
function payloadOf(link: string): string {
    const value = new URL(link).searchParams.get("query");
    if (!value) throw new Error("The link holds no payload.");
    return value;
}

describe("share link payload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("reads back a builder payload", () => {
        const query = compiledQuery();
        const pair = { latitude: "LATITUDE", longitude: "LONGITUDE" };

        const shared = decodeSharedQuery(
            encodeSharedQuery({ query, name: "Argo", nodeUrl: NODE_URL, coordinateColumns: pair })
        );

        expect(shared.query).toEqual(query);
        expect(shared.name).toBe("Argo");
        expect(shared.nodeUrl).toBe(NODE_URL);
        expect(shared.coordinateColumns).toEqual(pair);
    });

    it("reads back a SQL payload", () => {
        const shared = decodeSharedQuery(
            encodeSharedQuery({
                query: { sql: "SELECT * FROM argo LIMIT 10" },
                name: "SQL 1",
                nodeUrl: NODE_URL
            })
        );

        expect(shared.query).toEqual({ sql: "SELECT * FROM argo LIMIT 10" });
        expect(shared.name).toBe("SQL 1");
        expect(shared.nodeUrl).toBe(NODE_URL);
    });

    it("trims the SQL of a payload", () => {
        const shared = decodeSharedQuery(
            Utils.objectToGzipString({ query: { sql: "\n  SELECT 1\n" }, name: "", nodeUrl: "" })
        );

        expect(shared.query).toEqual({ sql: "SELECT 1" });
    });

    it("refuses a payload with no query", () => {
        expect(() =>
            decodeSharedQuery(Utils.objectToGzipString({ name: "x", nodeUrl: "" }))
        ).toThrow();
        expect(() =>
            decodeSharedQuery(Utils.objectToGzipString({ query: null, nodeUrl: "" }))
        ).toThrow();
    });

    it("refuses a payload with a blank SQL", () => {
        expect(() =>
            decodeSharedQuery(Utils.objectToGzipString({ query: { sql: "  " }, nodeUrl: "" }))
        ).toThrow();
    });
});

describe("old share link shapes", () => {
    it("reads a bare compiled query with its node in the legacy parameter", () => {
        const query = compiledQuery();
        const shared = decodeSharedQuery(Utils.objectToGzipString(query), NODE_URL);

        expect(shared.query).toEqual(query);
        expect(shared.nodeUrl).toBe(NODE_URL);
        expect(shared.name).toBe("");
    });

    it("reads a bare compiled query as a JSON string", () => {
        const query = compiledQuery();
        const shared = decodeSharedQuery(Utils.objectToGzipString(JSON.stringify(query)));

        expect(shared.query).toEqual(query);
        expect(shared.nodeUrl).toBe("");
    });

    it("reads the node of an `instanceUrl` payload", () => {
        const query = compiledQuery();
        const shared = decodeSharedQuery(
            Utils.objectToGzipString({ query, name: "Old", instanceUrl: NODE_URL })
        );

        expect(shared.query).toEqual(query);
        expect(shared.name).toBe("Old");
        expect(shared.nodeUrl).toBe(NODE_URL);
    });
});

describe("buildShareLink", () => {
    it("puts the SQL of a SQL record in the link", () => {
        const link = buildShareLink(
            shareable({ mode: "sql", sql: "  SELECT * FROM argo LIMIT 5  ", name: "SQL 1" })
        );

        expect(link).not.toBeNull();
        expect(new URL(link!).pathname).toBe(SHARE_LINK_PATH);

        const shared = decodeSharedQuery(payloadOf(link!));
        expect(shared.query).toEqual({ sql: "SELECT * FROM argo LIMIT 5" });
        expect(shared.name).toBe("SQL 1");
        expect(shared.nodeUrl).toBe(NODE_URL);

        const raw = Utils.gzipStringToObject<Record<string, unknown>>(payloadOf(link!));
        expect(raw.query).toEqual({ sql: "SELECT * FROM argo LIMIT 5" });
        expect(raw).not.toHaveProperty("sql");
    });

    it("keeps the coordinate pair of a SQL record", () => {
        const pair = { latitude: "lat", longitude: "lon" };
        const link = buildShareLink(
            shareable({ mode: "sql", sql: "SELECT 1", coordinateColumns: pair })
        );

        expect(decodeSharedQuery(payloadOf(link!)).coordinateColumns).toEqual(pair);
    });

    it("builds no link for a SQL record with no text", () => {
        expect(buildShareLink(shareable({ mode: "sql", sql: "  " }))).toBeNull();
    });

    it("puts the query of a builder record in the link", () => {
        const query = compiledQuery();
        const link = buildShareLink(shareable({ compiled: query }));

        const shared = decodeSharedQuery(payloadOf(link!));
        expect(shared.query).toEqual(query);
        expect(shared.nodeUrl).toBe(NODE_URL);
    });

    it("builds no link for a builder record with no query", () => {
        expect(buildShareLink(shareable())).toBeNull();
    });
});

describe("runQueryOf", () => {
    function record(overrides: Partial<StoredQuery>): StoredQuery {
        return {
            id: "sq-1",
            role: "block",
            name: "Query 1",
            draft: null,
            compiled: null,
            node: { id: "", name: "", url: "" },
            coordinateColumns: null,
            view: null,
            datasetKey: null,
            createdAt: 0,
            updatedAt: 0,
            lastExecutedAt: null,
            executionCount: 0,
            rowCount: null,
            duration: null,
            ...overrides
        };
    }

    it("gives the trimmed text of a SQL record", () => {
        expect(runQueryOf(record({ mode: "sql", sql: " SELECT 1 \n" }))).toEqual({
            sql: "SELECT 1"
        });
    });

    it("gives null for a SQL record with no text", () => {
        expect(runQueryOf(record({ mode: "sql", sql: "" }))).toBeNull();
    });

    it("gives the compiled query of a builder record", () => {
        const query = compiledQuery();
        expect(runQueryOf(record({ mode: "builder", compiled: query }))).toEqual(query);
    });

    it("reads a record with no mode as a builder record", () => {
        const query = compiledQuery();
        expect(runQueryOf(record({ compiled: query, sql: "SELECT 1" }))).toEqual(query);
    });

    it("gives null for no record", () => {
        expect(runQueryOf(null)).toBeNull();
    });
});
