/**
 * OPFS-backed cache of raw query results — the second tier under the in-memory
 * `QueryStore` cache (see [[persistent-query-migration]]).
 *
 * Each entry is the server's zstd-compressed Arrow IPC stream, persisted byte-for-
 * byte as it came off the wire (never re-serialized), plus a JSON sidecar with the
 * result's metadata. Entries survive reloads and full app restarts, so a memory
 * eviction or a fresh session rehydrates locally instead of re-running the query.
 *
 * Layout (OPFS directory `query-cache/`, filenames are SHA-256 of the cache key):
 *   <hash>.arrows     raw compressed Arrow IPC bytes
 *   <hash>.meta.json  {@link OpfsDatasetMeta} — written last, so it doubles as the
 *                     commit marker; an `.arrows` file without valid meta (or with
 *                     a size mismatch) is a torn write and gets discarded.
 *
 * Everything here is best-effort: any failure (unsupported browser, quota, torn
 * writes, concurrent tabs racing) degrades to a cache miss, never an error for the
 * caller. All entry points no-op when OPFS is unavailable (e.g. during SSR).
 */

import type { QueryWarning } from '@/beacon-api/types';
import { getSettings } from '@/stores/settings';

/** Bump to invalidate all previously persisted entries on format changes. */
const CACHE_VERSION = 1;

/**
 * The budgets of this cache. The user sets them on the settings page:
 * `diskCacheMaxEntries`, `diskCacheMaxTotalBytes` and `diskCacheMaxAgeMs`.
 * Read them at the point of use, so a change applies to the next call.
 */
function limits(): { maxEntries: number; maxTotalBytes: number; maxAgeMs: number } {
	const settings = getSettings();
	return {
		maxEntries: settings.diskCacheMaxEntries,
		maxTotalBytes: settings.diskCacheMaxTotalBytes,
		maxAgeMs: settings.diskCacheMaxAgeMs
	};
}

const DIR_NAME = 'query-cache';
const DATA_SUFFIX = '.arrows';
const META_SUFFIX = '.meta.json';

/** Sidecar metadata persisted next to each `.arrows` payload. */
export interface OpfsDatasetMeta {
	version: number;
	key: string;
	rowCount: number;
	/** Original fetch + decode duration (ms) — shown as-is on rehydrated entries. */
	duration: number;
	queryId: string | null;
	warnings: QueryWarning[];
	/** Size of the `.arrows` payload; mismatch with the file marks a torn write. */
	byteLength: number;
	createdAt: number;
	lastAccessedAt: number;
}

/** Fields the caller provides on `put`; the rest is filled in by the cache. */
export type OpfsDatasetMetaInput = Pick<
	OpfsDatasetMeta,
	'rowCount' | 'duration' | 'queryId' | 'warnings'
>;

/** Aggregate + per-entry stats for the OPFS (disk) tier, for the cache-info UI. */
export interface DiskCacheStats {
	/** False when OPFS isn't available in this environment (SSR, old browsers). */
	supported: boolean;
	entryCount: number;
	maxEntries: number;
	totalBytes: number;
	maxTotalBytes: number;
	/** TTL after which entries are considered stale and dropped on read. */
	maxAgeMs: number;
	/** Valid entries, most-recently-accessed first. */
	entries: OpfsDatasetMeta[];
}

/** `FileSystemDirectoryHandle` async iteration isn't in TS's lib.dom yet. */
type IterableDirectoryHandle = FileSystemDirectoryHandle & {
	values(): AsyncIterableIterator<FileSystemHandle>;
};

/** True when this environment supports OPFS with main-thread writable streams. */
export function isOpfsCacheSupported(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.storage?.getDirectory === 'function' &&
		typeof FileSystemFileHandle !== 'undefined' &&
		'createWritable' in FileSystemFileHandle.prototype
	);
}

class OpfsArrowCache {
	/** Memoized handle to the cache directory (reset by {@link clear}). */
	private dirPromise: Promise<IterableDirectoryHandle> | null = null;

	/**
	 * Reads a cached result. Returns `undefined` on any miss: unsupported browser,
	 * absent/stale/torn entry, version or key (hash-collision) mismatch.
	 */
	async get(key: string): Promise<{ bytes: Uint8Array; meta: OpfsDatasetMeta } | undefined> {
		if (!isOpfsCacheSupported()) return undefined;
		try {
			const dir = await this.dir();
			const name = await hashKey(key);

			const meta = await readMeta(dir, name);
			if (!meta || meta.version !== CACHE_VERSION || meta.key !== key) return undefined;
			if (Date.now() - meta.createdAt > limits().maxAgeMs) {
				void this.removeByName(name);
				return undefined;
			}

			const dataHandle = await dir.getFileHandle(name + DATA_SUFFIX);
			const file = await dataHandle.getFile();
			if (file.size !== meta.byteLength) {
				void this.removeByName(name);
				return undefined;
			}
			const bytes = new Uint8Array(await file.arrayBuffer());

			// Bump recency for LRU eviction; losing this update is harmless.
			meta.lastAccessedAt = Date.now();
			void writeFile(dir, name + META_SUFFIX, JSON.stringify(meta)).catch(() => {});

			return { bytes, meta };
		} catch {
			return undefined;
		}
	}

	/**
	 * Persists a result's raw bytes. Fire-and-forget friendly: quota pressure
	 * triggers eviction and one retry, any other failure is swallowed.
	 */
	async put(key: string, bytes: Uint8Array, meta: OpfsDatasetMetaInput): Promise<void> {
		if (!isOpfsCacheSupported()) return;
		try {
			// console.log('OPFSArrowCache.put', meta);

			await this.write(key, bytes, meta);
			await this.evict();

		} catch (error) {
			if (!isQuotaError(error)) {
				console.warn('OPFS query cache: failed to persist result.', error);
				return;
			}
			try {
				// Free roughly half the budget, then try once more.
				const { maxEntries, maxTotalBytes } = limits();
				await this.evict(maxTotalBytes / 2, Math.floor(maxEntries / 2));
				await this.write(key, bytes, meta);
			} catch (retryError) {
				console.warn('OPFS query cache: gave up persisting after quota error.', retryError);
			}
		}
	}

	/**
	 * Lists valid persisted entries (most-recently-accessed first) without mutating
	 * the cache. Torn/invalid entries are skipped but not deleted here.
	 */
	async list(): Promise<OpfsDatasetMeta[]> {
		if (!isOpfsCacheSupported()) return [];
		try {
			const dir = await this.dir();
			const dataNames = new Set<string>();
			const metaNames: string[] = [];
			for await (const handle of dir.values()) {
				if (handle.kind !== 'file') continue;
				if (handle.name.endsWith(DATA_SUFFIX)) dataNames.add(handle.name);
				else if (handle.name.endsWith(META_SUFFIX)) metaNames.push(handle.name);
			}

			const metas: OpfsDatasetMeta[] = [];
			for (const fileName of metaNames) {
				const name = fileName.slice(0, -META_SUFFIX.length);
				const meta = await readMeta(dir, name);
				if (meta && meta.version === CACHE_VERSION && dataNames.has(name + DATA_SUFFIX)) {
					metas.push(meta);
				}
			}
			metas.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
			return metas;
		} catch {
			return [];
		}
	}

	/** Aggregate stats for the cache-info UI (safe when OPFS is unsupported). */
	async stats(): Promise<DiskCacheStats> {
		const supported = isOpfsCacheSupported();
		const entries = supported ? await this.list() : [];
		const { maxEntries, maxTotalBytes, maxAgeMs } = limits();
		return {
			supported,
			entryCount: entries.length,
			maxEntries,
			totalBytes: entries.reduce((sum, m) => sum + m.byteLength, 0),
			maxTotalBytes,
			maxAgeMs,
			entries
		};
	}

	/** Removes a single entry (no-op if absent). */
	async remove(key: string): Promise<void> {
		if (!isOpfsCacheSupported()) return;
		try {
			await this.removeByName(await hashKey(key));
		} catch {
			// Best-effort.
		}
	}

	/** Removes all persisted entries. */
	async clear(): Promise<void> {
		if (!isOpfsCacheSupported()) return;
		try {
			const root = await navigator.storage.getDirectory();
			this.dirPromise = null;
			await root.removeEntry(DIR_NAME, { recursive: true });
		} catch {
			// Absent directory or a concurrent clear — nothing to do.
		}
	}

	private dir(): Promise<IterableDirectoryHandle> {
		if (!this.dirPromise) {
			this.dirPromise = navigator.storage
				.getDirectory()
				.then((root) => root.getDirectoryHandle(DIR_NAME, { create: true })) as Promise<IterableDirectoryHandle>;
			// A failed open shouldn't poison every later call.
			this.dirPromise.catch(() => {
				this.dirPromise = null;
			});
		}
		return this.dirPromise;
	}

	/** Writes payload first, meta last (meta is the commit marker). */
	private async write(key: string, bytes: Uint8Array, meta: OpfsDatasetMetaInput): Promise<void> {
		const dir = await this.dir();
		const name = await hashKey(key);
		const now = Date.now();
		const fullMeta: OpfsDatasetMeta = {
			version: CACHE_VERSION,
			key,
			...meta,
			byteLength: bytes.byteLength,
			createdAt: now,
			lastAccessedAt: now
		};
		await writeFile(dir, name + DATA_SUFFIX, bytes);
		await writeFile(dir, name + META_SUFFIX, JSON.stringify(fullMeta));
	}

	private async removeByName(name: string): Promise<void> {
		const dir = await this.dir();
		// Meta first, so a half-removed entry reads as a torn write, not a valid one.
		await dir.removeEntry(name + META_SUFFIX).catch(() => {});
		await dir.removeEntry(name + DATA_SUFFIX).catch(() => {});
	}

	/**
	 * Deletes least-recently-used entries until within the given budgets, plus any
	 * orphaned/torn files left behind by interrupted writes.
	 */
	private async evict(
		maxBytes: number = limits().maxTotalBytes,
		maxEntries: number = limits().maxEntries
	): Promise<void> {
		const dir = await this.dir();

		const fileNames = new Set<string>();
		for await (const handle of dir.values()) {
			if (handle.kind === 'file') fileNames.add(handle.name);
		}

		const entries: Array<{ name: string; meta: OpfsDatasetMeta }> = [];
		for (const fileName of fileNames) {
			if (!fileName.endsWith(META_SUFFIX)) continue;
			const name = fileName.slice(0, -META_SUFFIX.length);
			const meta = await readMeta(dir, name);
			if (!meta || meta.version !== CACHE_VERSION || !fileNames.has(name + DATA_SUFFIX)) {
				await this.removeByName(name);
				continue;
			}
			entries.push({ name, meta });
		}

		// Orphaned payloads whose meta never landed (torn writes).
		for (const fileName of fileNames) {
			if (!fileName.endsWith(DATA_SUFFIX)) continue;
			const name = fileName.slice(0, -DATA_SUFFIX.length);
			if (!fileNames.has(name + META_SUFFIX)) {
				await dir.removeEntry(fileName).catch(() => {});
			}
		}

		// Most-recently-used first; drop everything past the budgets.
		entries.sort((a, b) => b.meta.lastAccessedAt - a.meta.lastAccessedAt);
		let bytes = 0;
		for (let i = 0; i < entries.length; i++) {
			bytes += entries[i].meta.byteLength;
			if (i >= maxEntries || bytes > maxBytes) {
				await this.removeByName(entries[i].name);
			}
		}
	}
}

/** SHA-256 of the cache key, hex-encoded — safe and short as an OPFS filename. */
async function hashKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readMeta(
	dir: FileSystemDirectoryHandle,
	name: string
): Promise<OpfsDatasetMeta | undefined> {
	try {
		const handle = await dir.getFileHandle(name + META_SUFFIX);

		const text = await (await handle.getFile()).text();

		return JSON.parse(text) as OpfsDatasetMeta;

	} catch {
		return undefined;
	}
}

async function writeFile(
	dir: FileSystemDirectoryHandle,
	name: string,
	contents: Uint8Array | string
): Promise<void> {
	const handle = await dir.getFileHandle(name, { create: true });
	const writable = await handle.createWritable();
	try {
		await writable.write(contents as FileSystemWriteChunkType);
		await writable.close();
	} catch (error) {
		await writable.abort().catch(() => {});
		throw error;
	}
}

function isQuotaError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'QuotaExceededError';
}

/** The app-wide OPFS tier of the query-result cache. */
export const opfsArrowCache = new OpfsArrowCache();
