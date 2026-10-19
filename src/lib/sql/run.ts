import {
    rowsFromBatch,
    type ArrowRecordBatch,
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
