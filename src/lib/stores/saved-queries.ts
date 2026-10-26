/**
 * Saved queries are a persisted list of queries that a user kept. They are
 * separate from the execution history. The user makes an entry with the "Save
 * Query" button in the workbench. The user can run, rename, remove or edit it.
 *
 * The app never writes these entries automatically, and it never merges them.
 * A save is a snapshot. Each save is a separate entry with its own identity.
 * Later edits to the source block do not change it.
 *
 * The records are {@link StoredQuery} objects. A saved record holds the `draft`
 * of the block with the compiled query. Therefore the workbench restores the
 * exact builder state, and does not rebuild it from the compiled form.
 */

import { createQueryCollection } from '@/stores/query-collection';
import {
	cloneStoredQuery,
	snapshotNode,
	type NodeRef,
	type StoredQuery
} from '@/stores/stored-query';
import type { CompiledQuery } from '@/beacon-api/types';
import { compileDraft, type QueryDraft } from '@/query/draft';
import { getCurrentNode } from '@/services/beacon-node';
import { describeQuery, track } from '@/telemetry';

/** The persisted list of saved queries for the full app. The newest comes first. */
export const savedQueries = createQueryCollection({
	storageKey: 'beacon-query-library.saved',
	role: 'saved',
	identity: 'id'
});

/** The fields that a caller supplies to save a query directly. */
export interface SaveQueryInput {
	name: string;
	compiled: CompiledQuery;
	draft?: QueryDraft | null;
	node?: NodeRef;
}

/**
 * Save a query at the front of the list. The function returns the new record.
 * A caller can then point to it, for example to build a link.
 */
export function addSavedQuery(input: SaveQueryInput): StoredQuery {
	const saved = savedQueries.add({
		name: input.name,
		draft: input.draft ?? null,
		compiled: input.compiled,
		node: input.node ?? snapshotNode(getCurrentNode())
	});

	track('query.save', {
		nodeHost: saved.node?.url,
		props: { ...describeQuery(saved.compiled), copy: false, hasDraft: saved.draft !== null }
	});

	return saved;
}

/**
 * Save a copy of a record. The source is usually a workbench block. The copy is
 * independent of the source. It gets a new identity and no run stats. The user
 * never ran the copy, although the app did run the query inside it.
 */
export function saveQueryFrom(source: StoredQuery, name?: string): StoredQuery {
	const copy = cloneStoredQuery(source, { role: 'saved', name: name ?? source.name });
	savedQueries.insertAt(0, copy);

	track('query.save', {
		nodeHost: copy.node?.url,
		props: { ...describeQuery(copy.compiled), copy: true, source: source.role }
	});

	return copy;
}

/**
 * True when a saved query holds the same query on the same node as this record.
 * A save keeps no link to its source, so the check compares the content. The
 * name does not count, because a rename loses no work.
 */
export function isSaved(record: StoredQuery): boolean {
	const query = queryOf(record);
	if (!query) return false;

	return savedQueries
		.all()
		.some((saved) => saved.node?.url === record.node?.url && queryOf(saved) === query);
}

/** The compiled query of a record as JSON, or null when the draft is incomplete. */
function queryOf(record: StoredQuery): string | null {
	const query = record.compiled ?? compileDraft(record.draft, record.coordinateColumns ?? null);
	if (!query) return null;

	return JSON.stringify(query);
}

/** Give a saved query a new name. The function does nothing for an unknown id. */
export function renameSavedQuery(id: string, name: string): void {
	savedQueries.update(id, { name });
}

/** Remove one saved query by id. */
export function removeSavedQuery(id: string): void {
	savedQueries.remove(id);
}

/** Remove all saved queries. */
export function clearSavedQueries(): void {
	savedQueries.clear();
}

/** A copy of the current saved queries. */
export function getSavedQueriesSnapshot(): StoredQuery[] {
	return savedQueries.all();
}

