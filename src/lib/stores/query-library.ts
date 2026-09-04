/**
 * The query library shows the three {@link StoredQuery} collections as one.
 *
 * An internal deep-link carries a record id as `?q=`. It does not carry the
 * query. Therefore every page that shows a dataset must find the record for an
 * id. The page must not know the collection of that record.
 * {@link resolveStoredQuery} does this. It is the benefit of one shared record
 * type: a block, a saved query and a history entry all use the same link form.
 */

import { queryBlocks } from '@/stores/query-blocks';
import { queryHistory } from '@/stores/query-history';
import { savedQueries } from '@/stores/saved-queries';
import {
	decodeSharedQuery,
	instanceRefFromUrl,
	type InstanceRef,
	type StoredQuery
} from '@/stores/stored-query';
import type { QueryCollection } from '@/stores/query-collection';
import type { CompiledQuery } from '@/beacon-api/types';
import { resolveRef } from '@/services/beacon-instance';
import { addToast } from "@/stores/toasts";

/** The search order for {@link resolveStoredQuery}. The most active collection is first. */
const COLLECTIONS: QueryCollection[] = [queryBlocks, savedQueries, queryHistory];

/**
 * Find a record by id in blocks, saved queries and history.
 *
 * The function returns null for an unknown id. This is a normal result, not an
 * error. History has a limit, so a bookmark to a dropped entry stops to work.
 * A caller must then show the "no query available" state.
 */
export function resolveStoredQuery(id: string | null | undefined): StoredQuery | null {
	if (!id) return null;
	for (const collection of COLLECTIONS) {
		const found = collection.find(id);
		if (found) return found;
	}
	return null;
}

/**
 * Write the result of a run to the record that started it. The function ignores
 * an unknown id. A user can close a block, or the app can drop an entry, while
 * the query runs.
 */
export function recordRunResult(
	id: string | null | undefined,
	result: { datasetKey: string; rowCount: number; duration: number }
): void {
	if (!id) return;
	const now = Date.now();
	for (const collection of COLLECTIONS) {
		if (!collection.find(id)) continue;
		const existing = collection.find(id);
		collection.update(id, {
			datasetKey: result.datasetKey,
			rowCount: result.rowCount,
			duration: result.duration,
			lastExecutedAt: now,
			executionCount: (existing?.executionCount ?? 0) + 1
		});
		return;
	}
}

// -- URL resolution ----------------------------------------------------------

/** The result for a page that a deep-link opened. */
export interface ResolvedUrlQuery {
	/**
	 * The library record that the link named. A `?q=` link has one. A share link
	 * (`?query=`) has none, because it carries a query but no identity. A page
	 * uses the `datasetKey` of this record to show a cached result immediately.
	 */
	entry: StoredQuery | null;
	/** The query to run. Null if the URL carried no usable data. */
	query: CompiledQuery | null;
	/**
	 * The name that the link carried, or null. A share link holds the name that
	 * the sender gave the query. A new block takes it. It is empty when the sender
	 * had no name, and the block then falls back to its own numbering.
	 */
	name: string | null;
	/**
	 * The value of `entry.id`, or undefined if there is no record. Send it to
	 * `ensureQuery(query, instance, storedQueryId)`. The app then writes the run
	 * to the record. See `QueryStore.ensure` for the effects of this link.
	 */
	storedQueryId?: string;
	/**
	 * The node that must run the query. A `?q=` link takes it from the record. A
	 * share link takes it from `?instance=`. It is null when the URL named none.
	 * The caller then falls back to its own default.
	 */
	instance: InstanceRef | null;
	/**
	 * The URL of a node that the link named, but that the instance list does not
	 * hold. The page shows a toast, and asks the user to add that node. It is
	 * null when the node resolves, and when the link named none.
	 */
	missingInstanceUrl: string | null;

	/**
	 * True if the URL had either `?q=` or `?query=`. A page uses this to decide
	 * whether to show a toast for a missing query. A page shows no toast when the
	 * user navigates to the workbench, and then removes all blocks.
	 */
	containsQueryParam: boolean;
}

/**
 * Find the query that a page must show. The URL has one of two forms:
 *
 *   `?q=<id>`      Internal navigation. The link is short. The record holds the
 *                  builder state and the cache key of the last result. Therefore
 *                  the page can show a cached dataset with no query payload.
 *   `?query=<gz>`  A share link. An id works only in the storage of one browser.
 *                  Therefore a link for another person must carry the query.
 *
 * If the URL has both forms, `?q=` wins. If `?q=` finds no record, the function
 * reads `?query=`. History has a limit, so a bookmark can outlive its entry.
 * If both fail, the query is null. A page shows "no query available" for that
 * result. It is not an error.
 */
export function resolveUrlQuery(url: URL): ResolvedUrlQuery {
	// Read this from the URL, and not from the result below. A `?q=` link to a
	// record that history dropped resolves to nothing, but the URL still asked
	// for a query. That stale bookmark is the case the flag exists for.
	const containsQueryParam = url.searchParams.has('q') || url.searchParams.has('query');

	const id = url.searchParams.get('q');
	const entry = resolveStoredQuery(id);

	if (entry?.compiled) {
		return {
			entry,
			query: entry.compiled,
			name: entry.name,
			storedQueryId: entry.id,
			instance: entry.instance,
			missingInstanceUrl: missingUrlOf(entry.instance),
			containsQueryParam
		};
	}

	const shared = url.searchParams.get('query');
	if (shared) {
		try {
			const payload = decodeSharedQuery(shared);
			const instance = sharedInstanceRef(payload.instanceUrl);

			return {
				entry: null,
				query: payload.query,
				name: payload.name,
				instance,
				missingInstanceUrl: missingUrlOf(instance),
				containsQueryParam
			};
		} catch (error) {
			console.error('Failed to decode a shared query from the URL.', error);

			addToast({
				message: `Failed to decode a shared query from the URL: ${error?.message ?? error}`,
				type: 'error'
			});

			return { entry: null, query: null, name: null, instance: null, missingInstanceUrl: null, containsQueryParam };
		}
	}

	return { entry: null, query: null, name: null, instance: null, missingInstanceUrl: null, containsQueryParam };
}

/**
 * The node of a share link, or null. The payload holds an empty URL when the
 * sender named no node. The caller then uses its own default.
 */
function sharedInstanceRef(instanceUrl: string): InstanceRef | null {
	const shared = instanceUrl.trim();
	if (!shared) return null;

	// The list can already hold this node. Take the full ref then, so the record
	// keeps the name that the user gave it.
	const known = resolveRef(instanceRefFromUrl(shared));
	if (known) return { id: known.id, name: known.name, url: known.url };

	return instanceRefFromUrl(shared);
}

/** The URL of a ref that the instance list does not hold, else null. */
function missingUrlOf(ref: InstanceRef | null): string | null {
	if (!ref?.url) return null;
	if (resolveRef(ref)) return null;
	return ref.url;
}
