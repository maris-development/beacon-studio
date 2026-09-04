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

import type { BeaconInstance, CompiledQuery, InstanceRef } from '@/beacon-api/types';
import type { ChartViewState } from '@/plots/plot-config';
import type { QueryDraft } from '@/query/draft';
import { compileDraft } from '@/query/draft';
import { Utils } from '@/utils';

export type { InstanceRef };

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
	/**
	 * The id of the colormap that paints the points. See `colors/palettes.ts`.
	 * An unknown id falls back to the default, so an old record still draws.
	 */
	palette: string;
	/** Turn the palette around. A depth column often needs this. */
	paletteReverse: boolean;
	camera: MapCameraState | null;
}

/** The display state of each visualisation page for one query. */
export interface QueryViewState {
	map?: MapViewState;
	/** The plots of the chart explorer. See {@link ChartViewState}. */
	chart?: ChartViewState;
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
	/**
	 * The Beacon node that runs this query. It is the connection of the record,
	 * not a label. Every run, download and cache key uses it. Resolve it with
	 * `matchRef` or `resolveRef` in `@/services/beacon-instance`.
	 */
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

/** Copies a config instance down to the fields a record needs. Never the token. */
export function snapshotInstance(instance: BeaconInstance | null | undefined): InstanceRef {
	return {
		id: instance?.id ?? '',
		name: instance?.name ?? '',
		url: instance?.url ?? ''
	};
}

/**
 * A ref for a node that the app knows by URL only. A share link gives this.
 * `matchRef` finds the instance if the list holds that URL. If it does not, the
 * UI reads `url` and asks the user to add the node.
 */
export function instanceRefFromUrl(url: string): InstanceRef {
	return { id: '', name: '', url: url.trim() };
}

/** True when a ref names a node at all. An empty ref names none. */
export function hasInstanceRef(ref: InstanceRef | null | undefined): boolean {
	return !!ref && (!!ref.id || !!ref.url);
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
		name: input.name ?? 'Untitled',
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

	// The copy keeps the view state of the source — the map and the plots — as
	// its own object. The user expects the same map and the same charts after
	// "duplicate" or "save this query".
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

/** The search parameter that carries the node of a shared query. */
export const SHARE_INSTANCE_PARAM = 'instance';

/**
 * Build an absolute share URL for a query. Returns null if the app cannot encode
 * the query. Supply `resolve(SHARE_LINK_PATH)` as `basePath`. Path resolution is
 * a SvelteKit task, so this module does not do it.
 *
 * The link carries the URL of the node as `?instance=`. A query runs on one node
 * only, so the receiver needs it. The link never carries the token. The receiver
 * supplies their own credentials for a node that needs one.
 */
export function buildShareLink(
	query: CompiledQuery | null,
	basePath: string,
	instance?: InstanceRef | null
): string | null {
	if (!query) return null;
	const gzipped = Utils.objectToGzipString(query);
	if (!gzipped) return null;

	let origin = 'http://localhost';
	if (typeof window !== 'undefined') {
		origin = window.location.origin;
	}

	const url = new URL(basePath, origin);
	url.searchParams.set('query', gzipped);

	if (instance?.url) {
		url.searchParams.set(SHARE_INSTANCE_PARAM, instance.url);
	}

	return url.toString();
}
