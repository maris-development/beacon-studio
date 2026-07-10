/**
 * Query history — a persisted log of executed queries, so users can revisit,
 * re-run, view, or edit a query they ran earlier (see the query-history page).
 *
 * Entries are recorded by `queryStore.ensure()` (the single choke point every
 * visualizer runs a query through) and deduplicated by the query store's cache
 * `key`, which already folds in the Beacon instance URL — so the same query run
 * against two instances is correctly two rows. Re-running an existing query updates
 * its timestamp / row count and bumps its execution count rather than duplicating.
 *
 * Persisted to localStorage (like the instance config) so history survives reloads
 * and app restarts. Timestamps are epoch milliseconds, not `Date` objects, to keep
 * JSON round-trips lossless.
 */

import { get } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import type { CompiledQuery } from '@/beacon-api/types';

/** Max rows kept; oldest (by last execution) are dropped past this. */
const MAX_HISTORY = 100;

/** One executed query, with the metadata needed to display and replay it. */
export interface QueryHistoryEntry {
	/** The query store's cache key — stable identity for dedupe. */
	key: string;
	/** The executed query (a clone), for re-execute / view / edit. */
	query: CompiledQuery;
	/** Instance snapshot, so the row stays meaningful if the instance is later renamed or removed. */
	instanceId: string;
	instanceName: string;
	instanceUrl: string;
	/** Epoch ms of the most recent execution. */
	lastExecutedAt: number;
	/** How many times this query has been run (from history's perspective). */
	executionCount: number;
	/** Row count of the most recent result. */
	rowCount: number;
	/** Duration (ms) of the most recent execution. */
	duration: number;
}

/** The fields a caller supplies when recording an execution. */
export type RecordExecutionInput = Pick<
	QueryHistoryEntry,
	'key' | 'query' | 'instanceId' | 'instanceName' | 'instanceUrl' | 'rowCount' | 'duration'
>;

/** The persisted, app-wide query history (newest activity anywhere in the list). */
export const queryHistory = persisted<QueryHistoryEntry[]>('beacon-query-history', []);

/**
 * Records (or refreshes) an executed query. Upserts by `key`: an existing entry has
 * its timestamp, row count and duration updated and its execution count bumped; a
 * new query is prepended. The list is capped to {@link MAX_HISTORY} by dropping the
 * least-recently-executed entries.
 */
export function recordExecution(input: RecordExecutionInput): void {
	queryHistory.update((entries) => {
		const now = Date.now();
		const existing = entries.find((entry) => entry.key === input.key);

		const updated: QueryHistoryEntry = {
			...input,
			lastExecutedAt: now,
			executionCount: (existing?.executionCount ?? 0) + 1
		};

		const rest = entries.filter((entry) => entry.key !== input.key);
		const next = [updated, ...rest];

		if (next.length > MAX_HISTORY) {
			next.sort((a, b) => b.lastExecutedAt - a.lastExecutedAt);
			next.length = MAX_HISTORY;
		}
		return next;
	});
}

/** Removes a single history entry by its cache key. */
export function removeHistoryEntry(key: string): void {
	queryHistory.update((entries) => entries.filter((entry) => entry.key !== key));
}

/** Clears the entire query history. */
export function clearHistory(): void {
	queryHistory.set([]);
}

/** A snapshot of the current history, sorted most-recently-executed first. */
export function getHistorySnapshot(): QueryHistoryEntry[] {
	return [...get(queryHistory)].sort((a, b) => b.lastExecutedAt - a.lastExecutedAt);
}
