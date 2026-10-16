import { describe, expect, it } from 'vitest';
import { tableFromArrays } from 'apache-arrow';
import type { ArrowRecordBatch } from '@maris-development/beacon-client';
import { runPreview, type BatchSource } from '../run';

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
		const fail = () => reject(new DOMException('Aborted', 'AbortError'));
		if (signal.aborted) {
			fail();
			return;
		}
		signal.addEventListener('abort', fail);
	});
}

describe('runPreview', () => {
	it('stops at the limit and marks the result as truncated', async () => {
		let aborted = false;
		const source = sourceOf(async function* (signal) {
			signal.addEventListener('abort', () => (aborted = true));
			yield batch(0, 300);
			yield batch(300, 300);
			yield batch(600, 300);
		});

		const result = await runPreview(source, 'SELECT n', {
			signal: new AbortController().signal,
			limit: 500
		});

		expect(result.rows).toHaveLength(500);
		expect(result.rows[499]).toEqual({ n: 499 });
		expect(result.columns).toEqual(['n']);
		expect(result.truncated).toBe(true);
		expect(result.cancelled).toBe(false);
		expect(aborted).toBe(true);
	});

	it('is not truncated when the rows end exactly at the limit', async () => {
		const source = sourceOf(async function* () {
			yield batch(0, 250);
			yield batch(250, 250);
		});

		const result = await runPreview(source, 'SELECT n', {
			signal: new AbortController().signal,
			limit: 500
		});

		expect(result.rows).toHaveLength(500);
		expect(result.truncated).toBe(false);
	});

	it('keeps the rows received before a stop', async () => {
		const controller = new AbortController();
		const source = sourceOf(async function* (signal) {
			yield batch(0, 10);
			controller.abort();
			await waitForAbort(signal);
		});

		const result = await runPreview(source, 'SELECT n', { signal: controller.signal });

		expect(result.rows).toHaveLength(10);
		expect(result.cancelled).toBe(true);
	});

	it('gives an empty cancelled result for a stop before the first batch', async () => {
		const controller = new AbortController();
		const source: BatchSource = {
			queryBatches: (_query, signal) => {
				controller.abort();
				return waitForAbort(signal!);
			}
		};

		const result = await runPreview(source, 'SELECT n', { signal: controller.signal });

		expect(result).toEqual({ columns: [], types: [], rows: [], truncated: false, cancelled: true });
	});

	it('gives an empty result for a statement with no rows', async () => {
		const source = sourceOf(async function* () {});

		const result = await runPreview(source, 'CREATE VIEW v AS SELECT 1', {
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

	it('passes a server error through', async () => {
		const source: BatchSource = { queryBatches: () => Promise.reject(new Error('bad sql')) };

		await expect(runPreview(source, 'x', { signal: new AbortController().signal })).rejects.toThrow(
			'bad sql'
		);
	});

	it('passes a structured query through to the source', async () => {
		let received: unknown = null;
		const source: BatchSource = {
			queryBatches: async (query) => {
				received = query;
				return { queryId: null, batches: (async function* () {})() };
			}
		};
		const structured = {
			select: [{ column: 'n' }],
			from: { netcdf: { paths: ['a.nc'] } },
			limit: 100
		};

		await runPreview(source, structured, { signal: new AbortController().signal });

		expect(received).toEqual(structured);
	});
});
