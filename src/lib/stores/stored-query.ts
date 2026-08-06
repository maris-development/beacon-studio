/**
 * StoredQuery is the record shape for every persisted query in the app.
 * Workbench blocks, saved queries and execution history all use it.
 *
 * The three types before this shared about 80% of their fields. They keep three
 * separate collections, because their identity and retention policies differ.
 * See `query-collection.ts`. Their shape is now the same. To move a record
 * between roles, copy it and set a new `role`.
 *
 * Every record holds both forms of the query:
 *   - `draft`    the editable builder state (table, columns, filters, output)
 *   - `compiled` the runnable CompiledQuery, always derived from the draft
 *
 * Saved and history records also hold the draft. Therefore "open in workbench"
 * restores the exact builder state. A record without a draft must rebuild an
 * approximate state from the compiled query.
 *
 * `datasetKey` links a record to its cached result. It is the `QueryStore` cache
 * key. The OPFS tier uses the same key. It is null before the first run.
 */

import type { CompiledQuery } from '@/beacon-api/types';
import type { BeaconInstance } from '@/stores/config';
import type { QueryDraft } from '@/query/draft';
import { compileDraft } from '@/query/draft';
import { Utils } from '@/utils';

/**
 * A snapshot of the Beacon instance that owns a query. The app copies these
 * fields by value. Therefore the record stays readable after a user renames or
 * removes that instance.
 */
export interface InstanceRef {
	id: string;
	name: string;
	url: string;
}

/** Which collection a record belongs to. */
export type StoredQueryRole = 'block' | 'saved' | 'history';

/**
 * The camera of the map viewer. The values match the MapLibre camera options.
 * `center` is [longitude, latitude].
 */
export interface MapCameraState {
	center: [number, number];
	zoom: number;
	bearing: number;
	pitch: number;
}

/**
 * The display state of the map viewer for one query: the column that the map
 * paints, the range of the legend and the camera.
 *
 * This is not part of the query. It never reaches the server, and it never
 * changes the cache key of a result. Therefore it lives beside `draft` and
 * `compiled`, and not inside them. A change to it must not drop the result of
 * the last run.
 */
export interface MapViewState {
	/** The column that the map paints. Null while the user picked none. */
	dataColumn: string | null;
	colorScaleMin: number;
	colorScaleMax: number;
	camera: MapCameraState | null;
}

/** The display state of each visualisation page for one query. */
export interface QueryViewState {
	map?: MapViewState;
}

export interface StoredQuery {
	/** Stable identity. Internal deep-links put this id on the URL as `?q=`. */
	id: string;
	role: StoredQueryRole;
	/** The name the user sees ("Query 1", …). */
	name: string;
	/** Builder state. Null for a record from a share link or from the JSON editor. */
	draft: QueryDraft | null;
	/** The runnable query. Null while the draft is incomplete. */
	compiled: CompiledQuery | null;
	instance: InstanceRef;
	/**
	 * How the visualisation pages show this query. Null for a record that the
	 * user never opened on the map. See {@link QueryViewState}.
	 */
	view: QueryViewState | null;
	/** The {@link QueryStore} cache key of the last result. Null before the first run. */
	datasetKey: string | null;
	createdAt: number;
	updatedAt: number;
	/** Epoch ms of the most recent execution, or null if never run. */
	lastExecutedAt: number | null;
	executionCount: number;
	/** Row count of the most recent result. */
	rowCount: number | null;
	/** Duration (ms) of the most recent execution. */
	duration: number | null;
}

/** The fields a caller supplies; everything else is defaulted. */
export type StoredQueryInput = Partial<Omit<StoredQuery, 'id' | 'role'>> & {
	role: StoredQueryRole;
};

/** Copies a config instance down to the fields a record needs. */
export function snapshotInstance(instance: BeaconInstance | null | undefined): InstanceRef {
	return {
		id: instance?.id ?? '',
		name: instance?.name ?? '',
		url: instance?.url ?? ''
	};
}

export function createId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `sq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Build a record. This function adds the identity, the timestamps and empty run
 * stats. If the input has a `draft` but no `compiled`, it derives the compiled
 * form from the draft. Therefore callers do not sync the two forms manually.
 */
export function makeStoredQuery(input: StoredQueryInput): StoredQuery {
	const now = Date.now();
	let draft: QueryDraft | null = null;
	if (input.draft) {
		draft = Utils.cloneObject(input.draft);
	}

	let compiled: CompiledQuery | null;
	if (input.compiled) {
		compiled = Utils.cloneObject(input.compiled);
	} else {
		compiled = compileDraft(draft);
	}

	return {
		id: createId(),
		role: input.role,
		name: input.name ?? 'Query',
		draft,
		compiled,
		instance: input.instance ?? snapshotInstance(null),
		view: input.view ?? null,
		datasetKey: input.datasetKey ?? null,
		createdAt: input.createdAt ?? now,
		updatedAt: input.updatedAt ?? now,
		lastExecutedAt: input.lastExecutedAt ?? null,
		executionCount: input.executionCount ?? 0,
		rowCount: input.rowCount ?? null,
		duration: input.duration ?? null
	};
}

/**
 * Copy a record under a new identity. "Save this block" and "duplicate" use this
 * function. The copy is independent of the source.
 *
 * The copy does not keep the run stats. The user never ran the copy, although
 * the app did run the query inside it.
 */
export function cloneStoredQuery(
	source: StoredQuery,
	overrides: Partial<StoredQuery> = {}
): StoredQuery {
	const now = Date.now();

	let draft: QueryDraft | null = null;
	if (source.draft) {
		draft = Utils.cloneObject(source.draft);
	}

	let compiled: CompiledQuery | null = null;
	if (source.compiled) {
		compiled = Utils.cloneObject(source.compiled);
	}

	// The copy keeps the map view of the source, as its own object. The user
	// expects the same map after "duplicate" or "save this query".
	let view: QueryViewState | null = null;
	if (source.view) {
		view = Utils.cloneObject(source.view);
	}

	return {
		...source,
		id: createId(),
		draft,
		compiled,
		view,
		instance: { ...source.instance },
		datasetKey: null,
		createdAt: now,
		updatedAt: now,
		lastExecutedAt: null,
		executionCount: 0,
		rowCount: null,
		duration: null,
		...overrides
	};
}

// -- share links -------------------------------------------------------------

/**
 * Internal navigation sends a record `id` as `?q=`. That id resolves only
 * against the storage of this browser. Therefore a share link must carry the
 * query itself, as gzip in `?query=`. The app keeps that older encoding for this
 * purpose alone.
 *
 * Every share link opens the workbench. The workbench is the only page that
 * accepts a query without a record. From there the user can open any other page.
 */
export const SHARE_LINK_PATH = '/queries/workbench';

/**
 * Build an absolute share URL for a query. Returns null if the app cannot encode
 * the query. Supply `resolve(SHARE_LINK_PATH)` as `basePath`. Path resolution is
 * a SvelteKit task, so this module does not do it.
 */
export function buildShareLink(query: CompiledQuery | null, basePath: string): string | null {
	if (!query) return null;
	const gzipped = Utils.objectToGzipString(query);
	if (!gzipped) return null;

	let origin = 'http://localhost';
	if (typeof window !== 'undefined') {
		origin = window.location.origin;
	}

	const url = new URL(basePath, origin);
	url.searchParams.set('query', gzipped);
	return url.toString();
}
