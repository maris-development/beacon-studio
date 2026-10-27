import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/telemetry", () => ({ track: vi.fn(), describeQuery: vi.fn(() => ({})) }));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("@/services/beacon-node", () => ({ getCurrentNode: () => null }));

const NODE_A = { id: "a", name: "A", url: "https://a.example.org" };
const NODE_B = { id: "b", name: "B", url: "https://b.example.org" };

async function load() {
    vi.resetModules();
    const saved = await import("../saved-queries");
    const stored = await import("../stored-query");
    return { ...saved, ...stored };
}

describe("isSaved for a SQL block", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("finds a saved copy with the same SQL on the same node", async () => {
        const { isSaved, makeStoredQuery, saveQueryFrom } = await load();
        const block = makeStoredQuery({
            role: "block",
            mode: "sql",
            sql: "SELECT 1",
            node: NODE_A
        });

        expect(isSaved(block)).toBe(false);

        saveQueryFrom(block);

        expect(isSaved(block)).toBe(true);
        expect(isSaved({ ...block, sql: "  SELECT 1\n" })).toBe(true);
    });

    it("finds no saved copy for other SQL or another node", async () => {
        const { isSaved, makeStoredQuery, saveQueryFrom } = await load();
        const block = makeStoredQuery({
            role: "block",
            mode: "sql",
            sql: "SELECT 1",
            node: NODE_A
        });
        saveQueryFrom(block);

        expect(isSaved({ ...block, sql: "SELECT 2" })).toBe(false);
        expect(isSaved({ ...block, node: NODE_B })).toBe(false);
    });

    it("keeps the mode and the SQL in the saved copy", async () => {
        const { makeStoredQuery, saveQueryFrom } = await load();
        const block = makeStoredQuery({
            role: "block",
            mode: "sql",
            sql: "SELECT 1",
            node: NODE_A
        });

        const copy = saveQueryFrom(block);

        expect(copy.role).toBe("saved");
        expect(copy.mode).toBe("sql");
        expect(copy.sql).toBe("SELECT 1");
        expect(copy.compiled).toBeNull();
    });
});
