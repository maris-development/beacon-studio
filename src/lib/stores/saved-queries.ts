/**
 * Saved queries — a persisted list of explicitly saved query drafts, separate
 * from execution history. Entries are created by the user clicking "Save Query"
 * in the workbench and can be replayed, renamed, removed, or opened for editing.
 *
 * Unlike execution history, these are never auto-recorded and never deduplicated;
 * each save is a distinct named entry. Timestamps are epoch milliseconds.
 */

import { get } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import type { CompiledQuery } from '@/beacon-api/types';

/** One saved query entry with the metadata needed to display and replay it. */
export interface SavedQueryEntry {
	/** Stable identity generated at save time. */
	id: string;
	/** User-visible name, defaults to the active block name ("Query 1", …). */
	name: string;
	/** The query at save time (a clone), for re-run / view / open in workbench. */
	query: CompiledQuery;
	/** Instance snapshot so the entry stays meaningful if the instance changes. */
	instanceId: string;
	instanceName: string;
	instanceUrl: string;
	/** Epoch ms when first saved. */
	createdAt: number;
	/** Epoch ms of the most recent rename/re-save. */
	updatedAt: number;
}

/** The fields a caller supplies when saving a query. */
export type SaveQueryInput = Omit<SavedQueryEntry, 'id' | 'createdAt' | 'updatedAt'>;

/** The persisted, app-wide list of saved queries (order = insertion, newest first). */
export const savedQueries = persisted<SavedQueryEntry[]>('beacon-saved-queries', []);

/**
 * Adds a new saved query entry, prepending it to the list.
 * Returns the generated id so callers can reference the new entry.
 */
export function addSavedQuery(input: SaveQueryInput): string {
	const id =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `sq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const now = Date.now();
	const entry: SavedQueryEntry = { ...input, id, createdAt: now, updatedAt: now };
	savedQueries.update((entries) => [entry, ...entries]);
	return id;
}

/** Renames a saved query by id. No-op if the id is not found. */
export function renameSavedQuery(id: string, name: string): void {
	savedQueries.update((entries) =>
		entries.map((e) => (e.id === id ? { ...e, name, updatedAt: Date.now() } : e))
	);
}

/** Removes a single saved query by id. */
export function removeSavedQuery(id: string): void {
	savedQueries.update((entries) => entries.filter((e) => e.id !== id));
}

/** Clears all saved queries. */
export function clearSavedQueries(): void {
	savedQueries.set([]);
}

/** A snapshot of the current saved queries, newest-first. */
export function getSavedQueriesSnapshot(): SavedQueryEntry[] {
	return [...get(savedQueries)];
}
