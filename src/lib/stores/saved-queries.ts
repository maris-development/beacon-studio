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
	snapshotInstance,
	type InstanceRef,
	type StoredQuery
} from '@/stores/stored-query';
import type { CompiledQuery } from '@/beacon-api/types';
import type { QueryDraft } from '@/components/query-builder/QueryDraft';
import { get } from 'svelte/store';
import { currentBeaconInstance } from '@/stores/config';

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
	instance?: InstanceRef;
}

/**
 * Save a query at the front of the list. The function returns the new record.
 * A caller can then point to it, for example to build a link.
 */
export function addSavedQuery(input: SaveQueryInput): StoredQuery {
	return savedQueries.add({
		name: input.name,
		draft: input.draft ?? null,
		compiled: input.compiled,
		instance: input.instance ?? snapshotInstance(get(currentBeaconInstance))
	});
}

/**
 * Save a copy of a record. The source is usually a workbench block. The copy is
 * independent of the source. It gets a new identity and no run stats. The user
 * never ran the copy, although the app did run the query inside it.
 */
export function saveQueryFrom(source: StoredQuery, name?: string): StoredQuery {
	const copy = cloneStoredQuery(source, { role: 'saved', name: name ?? source.name });
	savedQueries.insertAt(0, copy);
	return copy;
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

