import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompiledQuery } from "@/beacon-api/types";
import { Utils } from "@/utils";

vi.mock("@/telemetry", () => ({ track: vi.fn(), describeQuery: vi.fn(() => ({})) }));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("@/stores/toasts", () => ({ addToast: vi.fn() }));
vi.mock("@/services/beacon-node", () => ({
    resolveRef: () => null,
    getCurrentNode: () => null
}));

const NODE_URL = "https://beacon.example.org";

function compiledQuery(): CompiledQuery {
    return {
        query_parameters: [{ column: "TEMP", alias: null }],
        filters: [],
        from: "wod",
        output: { format: "csv" }
    };
}

function urlWith(params: Record<string, string>): URL {
    const url = new URL("http://localhost/queries/workbench");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
}

async function load() {
    vi.resetModules();
    const library = await import("../query-library");
    const saved = await import("../saved-queries");
    const stored = await import("../stored-query");
    return { ...library, ...saved, ...stored };
}

describe("resolveUrlQuery", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("gives the SQL of a SQL share link", async () => {
        const { resolveUrlQuery, encodeSharedQuery } = await load();
        const payload = encodeSharedQuery({
            query: null,
            sql: "SELECT * FROM argo LIMIT 10",
            name: "SQL 1",
            nodeUrl: NODE_URL
        });

        const resolved = resolveUrlQuery(urlWith({ query: payload }));

        expect(resolved.entry).toBeNull();
        expect(resolved.query).toBeNull();
        expect(resolved.sql).toBe("SELECT * FROM argo LIMIT 10");
        expect(resolved.name).toBe("SQL 1");
        expect(resolved.node?.url).toBe(NODE_URL);
        expect(resolved.missingNodeUrl).toBe(NODE_URL);
        expect(resolved.containsQueryParam).toBe(true);
    });

    it("gives the SQL of a `?q=` SQL record", async () => {
        const { resolveUrlQuery, savedQueries } = await load();
        const record = savedQueries.add({
            name: "Saved SQL",
            mode: "sql",
            sql: " SELECT 1 ",
            node: { id: "n1", name: "Node", url: NODE_URL }
        });

        const resolved = resolveUrlQuery(urlWith({ q: record.id }));

        expect(resolved.entry?.id).toBe(record.id);
        expect(resolved.query).toBeNull();
        expect(resolved.sql).toBe("SELECT 1");
        expect(resolved.storedQueryId).toBe(record.id);
    });

    it("gives no SQL for a builder share link", async () => {
        const { resolveUrlQuery, encodeSharedQuery } = await load();
        const query = compiledQuery();
        const payload = encodeSharedQuery({ query, name: "Argo", nodeUrl: NODE_URL });

        const resolved = resolveUrlQuery(urlWith({ query: payload }));

        expect(resolved.query).toEqual(query);
        expect(resolved.sql).toBeNull();
    });

    it("still opens an old link with a bare query and its node in `?instance=`", async () => {
        const { resolveUrlQuery } = await load();
        const query = compiledQuery();

        const resolved = resolveUrlQuery(
            urlWith({ query: Utils.objectToGzipString(query), instance: NODE_URL })
        );

        expect(resolved.query).toEqual(query);
        expect(resolved.sql).toBeNull();
        expect(resolved.node?.url).toBe(NODE_URL);
    });
});
