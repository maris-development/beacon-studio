import type { Table } from "apache-arrow";
import {
    getArrowDecoder,
    rowsFromBatch,
    type ArrowRecordBatch,
    type OutputFormat,
    type QueryInput
} from "@maris-development/beacon-client";

export const PREVIEW_ROW_LIMIT = 500;

export interface PreviewResult {
    columns: string[];
    /** The Arrow type of each column, in the order of `columns`. */
    types: unknown[];
    rows: Record<string, unknown>[];
    /** More rows exist after the limit. */
    truncated: boolean;
    /** The user stopped the run. The rows hold what arrived before. */
    cancelled: boolean;
}

/** The part of the SDK client that the preview needs. */
export interface BatchSource {
    queryBatches(
        query: QueryInput,
        signal?: AbortSignal
    ): Promise<{ queryId: string | null; batches: AsyncIterable<ArrowRecordBatch> }>;
}

/** The part of the SDK client that a raw read needs. */
export interface RawSource {
    queryRaw(query: QueryInput, format?: OutputFormat, signal?: AbortSignal): Promise<Response>;
}

/** The result of {@link readLimited}. */
export interface LimitedResult {
    /** The query id header of the node, or null. */
    queryId: string | null;
    table: Table;
    /** The IPC stream as the node sent it. Null for a cut result: those bytes hold more rows than the table. */
    bytes: Uint8Array | null;
    /** The cell limit stopped the read. */
    truncated: boolean;
    /** The highest row count: the cell limit divided by the column count. */
    rowLimit: number;
    /** Time until the node answered with its headers. */
    serverMs: number;
    /** Time to read and decode the body. */
    transferMs: number;
    /** The size of the body that arrived, in bytes. */
    byteLength: number;
}

const STOPPED = Symbol("stopped");

/** Streams the result and stops at `limit` rows. A stop through `signal` keeps the rows so far. */
export async function runPreview(
    source: BatchSource,
    query: QueryInput,
    options: { signal: AbortSignal; limit?: number }
): Promise<PreviewResult> {
    const columns: string[] = [];
    const types: unknown[] = [];
    const rows: Record<string, unknown>[] = [];
    const cancelled = () => ({ columns, types, rows, truncated: false, cancelled: true });

    // An aborted signal sends no `abort` event.
    if (options.signal.aborted) return cancelled();

    const limit = options.limit ?? PREVIEW_ROW_LIMIT;
    // The request has its own controller, so the limit can end it without a user stop.
    const request = new AbortController();
    let forward = () => {};
    const stopped = new Promise<typeof STOPPED>((resolve) => {
        forward = () => {
            request.abort();
            resolve(STOPPED);
        };
    });
    options.signal.addEventListener("abort", forward);

    let iterator: AsyncIterator<ArrowRecordBatch> | undefined;
    let truncated = false;

    try {
        // Workaround: SDK 2.0.0 drops the abort after the headers and never cancels the body (beacon PR #591).
        const pending = handled(source.queryBatches(query, request.signal));
        const opened = await Promise.race([pending, stopped]);
        if (opened === STOPPED) {
            // A stream that opens after the stop no longer hears the abort.
            handled(pending.then((late) => endIterator(late.batches[Symbol.asyncIterator]())));
            return cancelled();
        }

        iterator = opened.batches[Symbol.asyncIterator]();

        for (;;) {
            const step = await Promise.race([handled(iterator.next()), stopped]);
            if (step === STOPPED) return cancelled();
            if (step.done) {
                iterator = undefined;
                break;
            }

            const batch = step.value;
            if (columns.length === 0) {
                columns.push(...batch.schema.fields.map((field) => field.name));
                types.push(...batch.schema.fields.map((field) => field.type));
            }

            const room = limit - rows.length;
            const batchRows = rowsFromBatch<Record<string, unknown>>(batch);
            rows.push(...batchRows.slice(0, room));

            if (batchRows.length > room) {
                truncated = true;
                break;
            }
        }
    } catch (error) {
        if (!options.signal.aborted) throw error;

        return cancelled();
    } finally {
        options.signal.removeEventListener("abort", forward);
        request.abort();
        if (iterator) endIterator(iterator);
    }

    return { columns, types, rows, truncated, cancelled: false };
}

/** Marks a promise as handled, so a rejection after a lost race is not unhandled. */
function handled<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => {});
    return promise;
}

// A pending read holds `return()` back, so it is not awaited.
function endIterator(iterator: AsyncIterator<ArrowRecordBatch>): void {
    try {
        const ended = iterator.return?.();
        if (ended) handled(Promise.resolve(ended));
    } catch {
        // The run already has its result.
    }
}

/**
 * Reads an Arrow result and stops at `cellLimit` cells (rows × columns). The first batch gives the column count.
 * A stop through `signal` rejects with the abort reason of the signal.
 */
export async function readLimited(
    source: RawSource,
    query: QueryInput,
    options: { signal: AbortSignal; cellLimit: number }
): Promise<LimitedResult> {
    const { signal, cellLimit } = options;
    signal.throwIfAborted();

    const start = performance.now();
    const response = await source.queryRaw(query, undefined, signal);
    const answered = performance.now();

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    // SDK 2.0.0 drops the abort after the headers, so a stop cancels the body here.
    const cancel = () => void reader?.cancel().catch(() => {});
    signal.addEventListener("abort", cancel);

    async function* body(): AsyncGenerator<Uint8Array> {
        if (!reader) return;
        for (;;) {
            const step = await reader.read();
            if (step.done) return;
            chunks.push(step.value);
            yield step.value;
        }
    }

    const decoder = await getArrowDecoder();
    const batches: ArrowRecordBatch[] = [];
    let rows = 0;
    let rowLimit = rowLimitOf(cellLimit, 1);
    let truncated = false;
    let iterator: AsyncIterator<ArrowRecordBatch> | undefined;

    try {
        iterator = (await decoder.readStream(body()))[Symbol.asyncIterator]();

        for (;;) {
            const step = await iterator.next();
            if (step.done) {
                iterator = undefined;
                break;
            }

            const batch = step.value;
            if (batches.length === 0) rowLimit = rowLimitOf(cellLimit, batch.schema.fields.length);

            batches.push(batch);
            rows += batch.numRows;

            if (rows >= rowLimit) {
                truncated = true;
                break;
            }
        }
    } catch (error) {
        signal.throwIfAborted();
        throw error;
    } finally {
        signal.removeEventListener("abort", cancel);
        // The cancel ends a pending read first, so the iterator can end.
        if (truncated) cancel();
        if (iterator) endIterator(iterator);
    }

    // A cancelled body ends like a complete one.
    signal.throwIfAborted();

    const transferred = performance.now();
    const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = truncated ? null : concat(chunks, byteLength);

    let table: Table;
    if (batches.length === 0 && byteLength > 0) {
        // A result with no rows has no batch. The stream still holds the schema.
        table = decoder.tableFromIPC(bytes!) as unknown as Table;
    } else {
        table = decoder.tableFromBatches(batches) as unknown as Table;
    }
    if (table.numRows > rowLimit) table = table.slice(0, rowLimit);

    return {
        queryId: response.headers.get("x-beacon-query-id"),
        table,
        bytes,
        truncated,
        rowLimit,
        serverMs: Math.round(answered - start),
        transferMs: Math.round(transferred - answered),
        byteLength
    };
}

/** The highest row count for a cell limit. The query store uses the same rule for a compiled query. */
function rowLimitOf(cellLimit: number, columns: number): number {
    return Math.max(1, Math.round(cellLimit / Math.max(1, columns)));
}

function concat(chunks: Uint8Array[], byteLength: number): Uint8Array {
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
