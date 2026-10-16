import {
	rowsFromBatch,
	type ArrowRecordBatch,
	type QueryInput
} from '@maris-development/beacon-client';

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

/** Streams the result and stops at `limit` rows. A stop through `signal` keeps the rows so far. */
export async function runPreview(
	source: BatchSource,
	query: QueryInput,
	options: { signal: AbortSignal; limit?: number }
): Promise<PreviewResult> {
	const limit = options.limit ?? PREVIEW_ROW_LIMIT;
	// The request has its own controller, so the limit can end it without a user stop.
	const request = new AbortController();
	const forward = () => request.abort();
	options.signal.addEventListener('abort', forward);

	const columns: string[] = [];
	const types: unknown[] = [];
	const rows: Record<string, unknown>[] = [];
	let truncated = false;

	try {
		const { batches } = await source.queryBatches(query, request.signal);

		for await (const batch of batches) {
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

		return { columns, types, rows, truncated: false, cancelled: true };
	} finally {
		options.signal.removeEventListener('abort', forward);
		request.abort();
	}

	return { columns, types, rows, truncated, cancelled: false };
}
