/**
 * A persisted collection of {@link StoredQuery} records.
 *
 * The app has three query collections: workbench blocks, saved queries and
 * execution history. They hold the same record type. They differ in two
 * policies. These two policies are the reason for three collections:
 *
 *   identity  What makes two records the same. Blocks and saved queries use
 *             `id`. Two entries with an identical query stay two entries.
 *             A duplicate of a block must not merge into the original.
 *             History uses `datasetKey`. A second run of a query updates one
 *             row. The log does not grow.
 *
 *   max       History has a limit. It drops the least recently active entries.
 *             Blocks and saved queries have no limit. The user removes them.
 *
 * This module holds all other behaviour: persistence, CRUD and order.
 */

import { get, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import {
	makeStoredQuery,
	type StoredQuery,
	type StoredQueryInput,
	type StoredQueryRole
} from '@/stores/stored-query';

/** What makes two records the same entry within one collection. */
export type CollectionIdentity = 'id' | 'datasetKey';

export interface QueryCollectionOptions {
	/** The localStorage key for this collection. */
	storageKey: string;
	/** The role that this collection sets on every record. */
	role: StoredQueryRole;
	identity: CollectionIdentity;
	/**
	 * The maximum number of records. Above this limit the collection drops the
	 * least recently active records. Omit the field for no limit.
	 */
	max?: number;
}

/**
 * The recency of a record. The collection uses it to drop records above the
 * limit, and to sort. It is the time of the last run. If the app never ran the
 * record, it is the time of the last edit.
 */
function recencyOf(entry: StoredQuery): number {
	return entry.lastExecutedAt ?? entry.updatedAt ?? entry.createdAt;
}

export class QueryCollection implements Readable<StoredQuery[]> {
	private readonly store: ReturnType<typeof persisted<StoredQuery[]>>;
	private readonly options: QueryCollectionOptions;

	/** The Svelte store contract. Pages can use `$collection` directly. */
	readonly subscribe: Readable<StoredQuery[]>['subscribe'];

	constructor(options: QueryCollectionOptions) {
		this.options = options;
		this.store = persisted<StoredQuery[]>(options.storageKey, []);
		this.subscribe = this.store.subscribe;
	}

	get role(): StoredQueryRole {
		return this.options.role;
	}

	/** The current records, in stored order. */
	all(): StoredQuery[] {
		return [...get(this.store)];
	}

	/** The current records. The most recently active record comes first. */
	byRecency(): StoredQuery[] {
		return this.all().sort((a, b) => recencyOf(b) - recencyOf(a));
	}

	find(id: string | null | undefined): StoredQuery | null {
		if (!id) return null;
		return get(this.store).find((entry) => entry.id === id) ?? null;
	}

	/** Find a record by the cache key of the result that it produced. */
	findByDatasetKey(datasetKey: string | null | undefined): StoredQuery | null {
		if (!datasetKey) return null;
		return get(this.store).find((entry) => entry.datasetKey === datasetKey) ?? null;
	}

	/**
	 * Add a new record at the front of the list and return it. The result is
	 * always a separate entry, also under `identity: 'datasetKey'`. To apply the
	 * identity policy of the collection, use {@link upsert}.
	 */
	add(input: Omit<StoredQueryInput, 'role'>): StoredQuery {
		const entry = makeStoredQuery({ ...input, role: this.options.role });
		this.store.update((entries) => this.enforceMax([entry, ...entries]));
		return entry;
	}

	/** Add a record at the end of the list. Blocks keep an order, not a stack. */
	append(input: Omit<StoredQueryInput, 'role'>): StoredQuery {
		const entry = makeStoredQuery({ ...input, role: this.options.role });
		this.store.update((entries) => this.enforceMax([...entries, entry]));
		return entry;
	}

	/** Put a complete record at a position in the list. "Duplicate" uses this. */
	insertAt(index: number, entry: StoredQuery): StoredQuery {
		const stamped = { ...entry, role: this.options.role };
		this.store.update((entries) => {
			const next = [...entries];
			next.splice(Math.max(0, Math.min(index, next.length)), 0, stamped);
			return this.enforceMax(next);
		});
		return stamped;
	}

	/**
	 * Merge a record with the identity policy of the collection. The method
	 * updates a match in place. If there is no match, it adds the record at the
	 * front.
	 *
	 * The optional `merge` function receives the record that matched, or null.
	 * Therefore a caller can add 1 to a counter and keep the old row count in one
	 * step. This prevents a read-modify-write race.
	 */
	upsert(
		input: Omit<StoredQueryInput, 'role'>,
		merge?: (existing: StoredQuery | null, incoming: StoredQuery) => StoredQuery
	): StoredQuery {
		const incoming = makeStoredQuery({ ...input, role: this.options.role });
		let result = incoming;

		this.store.update((entries) => {
			const index = entries.findIndex((entry) => this.matches(entry, incoming));

			let existing: StoredQuery | null = null;
			if (index !== -1) {
				existing = entries[index];
			}

			let merged: StoredQuery;
			if (merge) {
				merged = merge(existing, incoming);
			} else {
				merged = { ...incoming, id: existing?.id ?? incoming.id };
			}
			result = merged;

			if (index === -1) {
				return this.enforceMax([merged, ...entries]);
			}

			const rest = entries.filter((_, i) => i !== index);
			return this.enforceMax([merged, ...rest]);
		});

		return result;
	}

	/**
	 * Apply a patch to a record with this id, and set a new `updatedAt`. The
	 * method does nothing if the id is unknown. It returns the new record, or
	 * null if it found no record.
	 */
	update(id: string, patch: Partial<StoredQuery>): StoredQuery | null {
		let result: StoredQuery | null = null;
		this.store.update((entries) =>
			entries.map((entry) => {
				if (entry.id !== id) return entry;
				result = { ...entry, ...patch, id: entry.id, updatedAt: Date.now() };
				return result;
			})
		);
		return result;
	}

	remove(id: string): void {
		this.store.update((entries) => entries.filter((entry) => entry.id !== id));
	}

	clear(): void {
		this.store.set([]);
	}

	private matches(entry: StoredQuery, incoming: StoredQuery): boolean {
		// The app never ran a record without a dataset key. Such a record cannot be
		// the same execution as another one. In that case, compare the id.
		if (this.options.identity === 'datasetKey' && incoming.datasetKey !== null) {
			return entry.datasetKey === incoming.datasetKey;
		}
		return entry.id === incoming.id;
	}

	/** Drop the least recently active records above the limit. */
	private enforceMax(entries: StoredQuery[]): StoredQuery[] {
		const max = this.options.max;
		if (!max || entries.length <= max) return entries;
		return [...entries].sort((a, b) => recencyOf(b) - recencyOf(a)).slice(0, max);
	}
}

export function createQueryCollection(options: QueryCollectionOptions): QueryCollection {
	return new QueryCollection(options);
}
