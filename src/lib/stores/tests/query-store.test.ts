import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeaconNode } from "@/beacon-api/types";
import { track } from "@/telemetry";
import { queryStore } from "../query-store.svelte";

vi.mock("@/telemetry", () => ({
    track: vi.fn(),
    describeQuery: vi.fn((query: { sql: string }) => ({ mode: "sql", sql: query.sql }))
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("@/stores/toasts", () => ({ addToast: vi.fn() }));
vi.mock("@/stores/query-history", () => ({ recordExecution: vi.fn() }));
vi.mock("@/stores/query-library", () => ({
    resolveStoredQuery: () => null,
    recordRunResult: vi.fn()
}));
vi.mock("@/beacon-api/client", () => ({ makeBeaconClient: vi.fn() }));
vi.mock("@/stores/opfs-arrow-cache", () => ({
    opfsArrowCache: { get: vi.fn(), put: vi.fn(), remove: vi.fn(), clear: vi.fn() }
}));
vi.mock("@/workers/ArrowProcessingWorkerManager", () => ({ getArrowWorker: vi.fn() }));

const NODE: BeaconNode = {
    id: "n1",
    name: "Node",
    url: "https://beacon.example.org",
    status: "online",
    latencyMs: 1,
    lastCheckedAt: null
};

describe("recordSqlRun telemetry", () => {
    beforeEach(() => {
        vi.mocked(track).mockClear();
    });

    it("sends a preview as query.execute with preview: true", () => {
        queryStore.recordSqlRun(" SELECT 1 ", NODE, { kind: "preview", duration: 12, rowCount: 1 });

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith("query.execute", {
            nodeHost: NODE.url,
            rowCount: 1,
            durationMs: 12,
            props: { mode: "sql", sql: "SELECT 1", preview: true }
        });
    });

    it("sends a download as query.download with its format", () => {
        queryStore.recordSqlRun("SELECT 1", NODE, {
            kind: "download",
            duration: 30,
            format: "csv"
        });

        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith("query.download", {
            nodeHost: NODE.url,
            durationMs: 30,
            props: { mode: "sql", sql: "SELECT 1", format: "csv" }
        });
    });
});
