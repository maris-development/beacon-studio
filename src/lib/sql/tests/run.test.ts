import { describe, expect, it, vi } from "vitest";
import { Table, tableFromArrays, tableToIPC, type RecordBatch } from "apache-arrow";
import type { ArrowRecordBatch } from "@maris-development/beacon-client";
import { readLimited, runPreview, type BatchSource, type RawSource } from "../run";

function batch(from: number, count: number): ArrowRecordBatch {
    const n = Int32Array.from({ length: count }, (_, i) => from + i);
    return tableFromArrays({ n }).batches[0] as unknown as ArrowRecordBatch;
}

function sourceOf(make: (signal: AbortSignal) => AsyncIterable<ArrowRecordBatch>): BatchSource {
    return {
        queryBatches: async (_query, signal) => ({ queryId: null, batches: make(signal!) })
    };
}

// The signal can already be aborted, and then no `abort` event comes.
function waitForAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
        const fail = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) {
            fail();
            return;
        }
        signal.addEventListener("abort", fail);
    });
}

// Like the SDK stream: it ignores the signal, and after the given batches it never ends.
function hangingSource(batches: ArrowRecordBatch[]) {
    const queue = [...batches];
    const returned = vi.fn(() => new Promise<IteratorResult<ArrowRecordBatch>>(() => {}));
    const iterator: AsyncIterator<ArrowRecordBatch> = {
        next: () => {
            const next = queue.shift();
            if (next) return Promise.resolve({ done: false, value: next });
            return new Promise(() => {});
        },
        return: returned
    };
    const queryBatches = vi.fn(async () => ({
        queryId: null,
        batches: { [Symbol.asyncIterator]: () => iterator }
    }));
    const source: BatchSource = { queryBatches };
    return { source, queryBatches, returned };
}

describe("runPreview", () => {
    it("returns the rows so far on a stop while the stream hangs", async () => {
        const controller = new AbortController();
        const { source, returned } = hangingSource([batch(0, 10)]);

        const running = runPreview(source, "SELECT n", { signal: controller.signal });
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.abort();
        const result = await running;

        expect(result.rows).toHaveLength(10);
        expect(result.columns).toEqual(["n"]);
        expect(result.cancelled).toBe(true);
        expect(returned).toHaveBeenCalled();
    });

    it("ends the iterator at the row limit", async () => {
        const { source, returned } = hangingSource([batch(0, 300), batch(300, 300)]);

        const result = await runPreview(source, "SELECT n", {
            signal: new AbortController().signal,
            limit: 500
        });

        expect(result.rows).toHaveLength(500);
        expect(result.truncated).toBe(true);
        expect(returned).toHaveBeenCalled();
    });

    it("ends the iterator of a stream that opens after a stop", async () => {
        const controller = new AbortController();
        const { source: inner, returned } = hangingSource([batch(0, 10)]);
        let open = () => {};
        const source: BatchSource = {
            queryBatches: (query, signal) =>
                new Promise((resolve) => {
                    open = () => resolve(inner.queryBatches(query, signal));
                })
        };

        const running = runPreview(source, "SELECT n", { signal: controller.signal });
        controller.abort();
        const result = await running;
        open();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(result.cancelled).toBe(true);
        expect(returned).toHaveBeenCalled();
    });

    it("does not run the statement when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const { source, queryBatches } = hangingSource([batch(0, 10)]);

        const result = await runPreview(source, "SELECT n", { signal: controller.signal });

        expect(result).toEqual({
            columns: [],
            types: [],
            rows: [],
            truncated: false,
            cancelled: true
        });
        expect(queryBatches).not.toHaveBeenCalled();
    });

    it("stops at the limit and marks the result as truncated", async () => {
        let aborted = false;
        const source = sourceOf(async function* (signal) {
            signal.addEventListener("abort", () => (aborted = true));
            yield batch(0, 300);
            yield batch(300, 300);
            yield batch(600, 300);
        });

        const result = await runPreview(source, "SELECT n", {
            signal: new AbortController().signal,
            limit: 500
        });

        expect(result.rows).toHaveLength(500);
        expect(result.rows[499]).toEqual({ n: 499 });
        expect(result.columns).toEqual(["n"]);
        expect(result.truncated).toBe(true);
        expect(result.cancelled).toBe(false);
        expect(aborted).toBe(true);
    });

    it("is not truncated when the rows end exactly at the limit", async () => {
        const source = sourceOf(async function* () {
            yield batch(0, 250);
            yield batch(250, 250);
        });

        const result = await runPreview(source, "SELECT n", {
            signal: new AbortController().signal,
            limit: 500
        });

        expect(result.rows).toHaveLength(500);
        expect(result.truncated).toBe(false);
    });

    it("keeps the rows received before a stop", async () => {
        const controller = new AbortController();
        const source = sourceOf(async function* (signal) {
            yield batch(0, 10);
            controller.abort();
            await waitForAbort(signal);
        });

        const result = await runPreview(source, "SELECT n", { signal: controller.signal });

        expect(result.rows).toHaveLength(10);
        expect(result.cancelled).toBe(true);
    });

    it("gives an empty cancelled result for a stop before the first batch", async () => {
        const controller = new AbortController();
        const source: BatchSource = {
            queryBatches: (_query, signal) => {
                controller.abort();
                return waitForAbort(signal!);
            }
        };

        const result = await runPreview(source, "SELECT n", { signal: controller.signal });

        expect(result).toEqual({
            columns: [],
            types: [],
            rows: [],
            truncated: false,
            cancelled: true
        });
    });

    it("gives an empty result for a statement with no rows", async () => {
        const source = sourceOf(async function* () {});

        const result = await runPreview(source, "CREATE VIEW v AS SELECT 1", {
            signal: new AbortController().signal
        });

        expect(result).toEqual({
            columns: [],
            types: [],
            rows: [],
            truncated: false,
            cancelled: false
        });
    });

    it("passes a server error through", async () => {
        const source: BatchSource = { queryBatches: () => Promise.reject(new Error("bad sql")) };

        await expect(
            runPreview(source, "x", { signal: new AbortController().signal })
        ).rejects.toThrow("bad sql");
    });

    it("passes a structured query through to the source", async () => {
        let received: unknown = null;
        const source: BatchSource = {
            queryBatches: async (query) => {
                received = query;
                return { queryId: null, batches: (async function* () {})() };
            }
        };
        const structured = {
            select: [{ column: "n" }],
            from: { netcdf: { paths: ["a.nc"] } },
            limit: 100
        };

        await runPreview(source, structured, { signal: new AbortController().signal });

        expect(received).toEqual(structured);
    });
});

/** A batch with two columns, so a cell limit of 1000 gives 500 rows. */
function pairBatch(from: number, count: number): RecordBatch {
    const n = Int32Array.from({ length: count }, (_, i) => from + i);
    return tableFromArrays({ n, m: Float64Array.from(n) }).batches[0];
}

/** An Arrow IPC stream with one batch for each count. */
function ipcOf(...counts: number[]): Uint8Array {
    let from = 0;
    const batches = counts.map((count) => {
        const next = pairBatch(from, count);
        from += count;
        return next;
    });
    return tableToIPC(new Table(batches), "stream");
}

// The 8 bytes of the end marker. A stream without them waits for more batches.
const END_MARKER_BYTES = 8;

/** A body that sends `bytes` and then never ends, like a node that still runs. */
function hangingBody(bytes: Uint8Array) {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
        start: (controller) => controller.enqueue(bytes),
        cancel: cancelled
    });
    return { body, cancelled };
}

function bodyOf(body: Uint8Array | ReadableStream<Uint8Array>): BodyInit {
    // A copy owns a plain ArrayBuffer, which `BodyInit` asks for.
    if (body instanceof Uint8Array) return body.slice();
    return body;
}

function rawSourceOf(
    body: Uint8Array | ReadableStream<Uint8Array>,
    headers: Record<string, string> = {}
) {
    const init = bodyOf(body);
    const queryRaw = vi.fn<RawSource["queryRaw"]>(async () => new Response(init, { headers }));
    return { source: { queryRaw } as RawSource, queryRaw };
}

describe("readLimited", () => {
    it("reads a complete result and keeps the bytes of the node", async () => {
        const bytes = ipcOf(100, 100);
        const { source } = rawSourceOf(bytes, { "x-beacon-query-id": "q1" });

        const result = await readLimited(
            source,
            { sql: "SELECT n, m" },
            {
                signal: new AbortController().signal,
                cellLimit: 10_000
            }
        );

        expect(result.table.numRows).toBe(200);
        expect(result.truncated).toBe(false);
        expect(result.rowLimit).toBe(5000);
        expect(result.bytes).toEqual(bytes);
        expect(result.byteLength).toBe(bytes.byteLength);
        expect(result.queryId).toBe("q1");
    });

    it("stops at the cell limit and cuts the table", async () => {
        const { source } = rawSourceOf(ipcOf(300, 300, 300));

        const result = await readLimited(
            source,
            { sql: "SELECT n, m" },
            {
                signal: new AbortController().signal,
                cellLimit: 1000
            }
        );

        expect(result.rowLimit).toBe(500);
        expect(result.table.numRows).toBe(500);
        expect(result.table.getChild("n")?.get(499)).toBe(499);
        expect(result.truncated).toBe(true);
        expect(result.bytes).toBeNull();
    });

    it("cancels the body at the cell limit", async () => {
        const { body, cancelled } = hangingBody(ipcOf(300, 300));
        const { source } = rawSourceOf(body);

        const result = await readLimited(
            source,
            { sql: "SELECT n, m" },
            {
                signal: new AbortController().signal,
                cellLimit: 1000
            }
        );

        expect(result.truncated).toBe(true);
        expect(cancelled).toHaveBeenCalled();
    });

    it("rejects with the abort and cancels the body on a stop while the body hangs", async () => {
        const controller = new AbortController();
        const bytes = ipcOf(10);
        const { body, cancelled } = hangingBody(
            bytes.subarray(0, bytes.byteLength - END_MARKER_BYTES)
        );
        const { source } = rawSourceOf(body);

        const running = readLimited(
            source,
            { sql: "SELECT n, m" },
            {
                signal: controller.signal,
                cellLimit: 1000
            }
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.abort();

        await expect(running).rejects.toMatchObject({ name: "AbortError" });
        expect(cancelled).toHaveBeenCalled();
    });

    it("sends no request when the signal is already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const { source, queryRaw } = rawSourceOf(ipcOf(10));

        await expect(
            readLimited(
                source,
                { sql: "SELECT n, m" },
                { signal: controller.signal, cellLimit: 1000 }
            )
        ).rejects.toMatchObject({ name: "AbortError" });
        expect(queryRaw).not.toHaveBeenCalled();
    });

    it("keeps the schema of a result with no rows", async () => {
        const schema = pairBatch(0, 1).schema;
        const { source } = rawSourceOf(tableToIPC(new Table(schema), "stream"));

        const result = await readLimited(
            source,
            { sql: "SELECT n, m WHERE false" },
            {
                signal: new AbortController().signal,
                cellLimit: 1000
            }
        );

        expect(result.table.numRows).toBe(0);
        expect(result.table.schema.fields.map((field) => field.name)).toEqual(["n", "m"]);
        expect(result.truncated).toBe(false);
    });
});
