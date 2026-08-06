/**
 * Query history is a persisted log of executed queries. A user can open, run
 * again, view or edit an earlier query. See the query-history page.
 *
 * The query store writes these entries. Every visualiser runs its queries
 * through that one point. Entries use {@link StoredQuery.datasetKey} as their
 * identity. That key is the result-cache key, and it includes the Beacon
 * instance URL. Therefore one query against two instances gives two rows.
 *
 * A second run of a known query sets a new timestamp and row count, and adds 1
 * to the execution count. It does not add a row.
 *
 * The records are {@link StoredQuery} objects. Saved queries and workbench
 * blocks use the same shape. The collection options below hold the identity
 * policy and the limit that make this collection a history.
 */

import { get } from 'svelte/store';
import { createQueryCollection } from '@/stores/query-collection';
import { snapshotInstance, type InstanceRef, type StoredQuery } from '@/stores/stored-query';
import type { CompiledQuery } from '@/beacon-api/types';
import type { QueryDraft } from '@/query/draft';
import { currentBeaconInstance } from '@/stores/config';
import { getSettings } from '@/stores/settings';

/**
 * The maximum number of rows. Above this limit the oldest runs go away. The user
 * sets the value on the settings page (`queryHistoryMax`).
 */
export function maxHistory(): number {
	return getSettings().queryHistoryMax;
}

/** The persisted query history for the full app. */
export const queryHistory = createQueryCollection({
	storageKey: 'beacon-query-library.history',
	role: 'history',
	identity: 'datasetKey',
	max: maxHistory
});

/**
 * The fields that a caller supplies for one execution. `rowCount` and `duration`
 * are optional. The server builds a download, so the client never learns the row
 * count. In that case the values of the known entry stay.
 */
export interface RecordExecutionInput {
	/** The result-cache key. History uses it as the identity. */
	datasetKey: string;
	compiled: CompiledQuery;
	/** The builder state of the record that started the run, if it had one. */
	draft?: QueryDraft | null;
	name?: string;
	instance?: InstanceRef;
	rowCount?: number;
	duration?: number;
}

/**
 * Record one execution of a query.
 *
 * A known entry keeps its identity and its creation time. The function sets a
 * new timestamp and adds 1 to the execution count. It sets a new row count and
 * duration if the caller supplies them, else it keeps the old values.
 *
 * The function puts a new query at the front. The list holds at most
 * {@link maxHistory} rows.
 */
export function recordExecution(input: RecordExecutionInput): StoredQuery {
	const now = Date.now();

	return queryHistory.upsert(
		{
			name: input.name ?? 'Query',
			draft: input.draft ?? null,
			compiled: input.compiled,
			instance: input.instance ?? snapshotInstance(get(currentBeaconInstance)),
			datasetKey: input.datasetKey,
			rowCount: input.rowCount ?? null,
			duration: input.duration ?? null
		},
		(existing, incoming) => ({
			...incoming,
			id: existing?.id ?? incoming.id,
			// A share link and the JSON editor have no draft. A run from such a
			// source must not delete the builder state from an earlier run.
			draft: incoming.draft ?? existing?.draft ?? null,
			name: input.name ?? existing?.name ?? incoming.name,
			createdAt: existing?.createdAt ?? incoming.createdAt,
			updatedAt: now,
			lastExecutedAt: now,
			executionCount: (existing?.executionCount ?? 0) + 1,
			rowCount: input.rowCount ?? existing?.rowCount ?? null,
			duration: input.duration ?? existing?.duration ?? null
		})
	);
}

/** Remove one history entry by the cache key of its result. */
export function removeHistoryEntry(datasetKey: string): void {
	const entry = queryHistory.findByDatasetKey(datasetKey);
	if (entry) queryHistory.remove(entry.id);
}

/** Remove all history entries. */
export function clearHistory(): void {
	queryHistory.clear();
}

/** A copy of the current history. The most recent run comes first. */
export function getHistorySnapshot(): StoredQuery[] {
	return queryHistory.byRecency();
}

