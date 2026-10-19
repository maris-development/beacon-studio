import { describe, expect, it } from "vitest";
import { editorLink, parseDate } from "../editor-link";

describe("editorLink", () => {
    it("puts the SQL and the node URL in the query", () => {
        const link = editorLink("/sql-editor", 'SELECT 1 AS "a"', "https://beacon.test/");
        const url = new URL(link, "http://x");

        expect(url.pathname).toBe("/sql-editor");
        expect(url.searchParams.get("sql")).toBe('SELECT 1 AS "a"');
        expect(url.searchParams.get("node")).toBe("https://beacon.test/");
    });
});

describe("parseDate", () => {
    it("reads an ISO string", () => {
        expect(parseDate("2024-05-06T10:00:00Z")?.toISOString()).toBe("2024-05-06T10:00:00.000Z");
    });

    it("returns null for text that is not a date", () => {
        expect(parseDate("yesterday")).toBeNull();
    });

    it("returns null for a missing value", () => {
        expect(parseDate(null)).toBeNull();
    });
});
