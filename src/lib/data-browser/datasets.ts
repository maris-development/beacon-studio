import type { StructuredQuery } from '@maris-development/beacon-client';
import { normalizeFolder } from './folders';
import { DETAIL_PREVIEW_ROWS } from './tables';

export const DATASET_LIST_LIMIT = 100000;

export interface DatasetEntry {
	path: string;
	format: string;
	canInspect: boolean;
	size: number | null;
	lastModified: string | null;
}

/** Reads `GET /api/list-datasets`. */
export function parseEntries(raw: unknown): DatasetEntry[] {
	if (!Array.isArray(raw)) return [];

	const result: DatasetEntry[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		if (typeof record.file_path !== 'string') continue;

		let size: number | null = null;
		if (typeof record.size === 'number') size = record.size;

		let lastModified: string | null = null;
		if (typeof record.last_modified === 'string') lastModified = record.last_modified;

		let format = '';
		if (typeof record.format === 'string') format = record.format;

		result.push({
			path: record.file_path,
			format,
			canInspect: record.can_inspect !== false,
			size,
			lastModified
		});
	}

	return result;
}

export interface FolderRow {
	name: string;
	path: string;
	/** Files in this folder and all its sub-folders. */
	count: number;
}

/** The direct sub-folders and files of one folder. */
export function listFolder(
	entries: DatasetEntry[],
	folder: string
): { folders: FolderRow[]; files: DatasetEntry[] } {
	const prefix = normalizeFolder(folder);
	const folders = new Map<string, FolderRow>();
	const files: DatasetEntry[] = [];

	for (const entry of entries) {
		if (!entry.path.startsWith(prefix)) continue;

		const rest = entry.path.slice(prefix.length);
		const slash = rest.indexOf('/');

		if (slash === -1) {
			files.push(entry);
			continue;
		}

		const name = rest.slice(0, slash);
		const row = folders.get(name);
		if (row) {
			row.count += 1;
		} else {
			folders.set(name, { name, path: `${prefix}${name}/`, count: 1 });
		}
	}

	const sorted = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name));
	return { folders: sorted, files };
}

export function searchEntries(entries: DatasetEntry[], needle: string): DatasetEntry[] {
	const query = needle.trim().toLowerCase();
	if (!query) return entries;

	return entries.filter((entry) => entry.path.toLowerCase().includes(query));
}

export type FileSort = 'name' | 'size' | 'date';

/** An unknown size or date sorts last in both directions. */
export function sortFiles(
	files: DatasetEntry[],
	key: FileSort,
	direction: 'asc' | 'desc'
): DatasetEntry[] {
	let sign = 1;
	if (direction === 'desc') sign = -1;

	const value = (entry: DatasetEntry): string | number | null => {
		if (key === 'size') return entry.size;
		if (key === 'date') return entry.lastModified;
		return entry.path;
	};

	return [...files].sort((a, b) => {
		const left = value(a);
		const right = value(b);

		if (left === null && right === null) return 0;
		if (left === null) return 1;
		if (right === null) return -1;

		if (typeof left === 'number' && typeof right === 'number') return sign * (left - right);
		return sign * String(left).localeCompare(String(right));
	});
}

export function folderParts(folder: string): { name: string; path: string }[] {
	const parts: { name: string; path: string }[] = [];
	let path = '';

	for (const name of normalizeFolder(folder).split('/')) {
		if (name === '') continue;
		path += `${name}/`;
		parts.push({ name, path });
	}

	return parts;
}

export function fileName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

export function folderOf(path: string): string {
	return path.slice(0, path.lastIndexOf('/') + 1);
}

export function formatSize(bytes: number | null): string {
	if (bytes === null) return '';
	if (bytes < 1024) return `${bytes} B`;

	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unit = 0;

	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}

	return `${value.toFixed(1)} ${units[unit]}`;
}

// The query DSL names NetCDF `netcdf`. A file with no detected format reads as Parquet.
function fromKey(format: string): string {
	if (format === '') return 'parquet';
	if (format === 'nc') return 'netcdf';
	return format;
}

/** The structured preview query, the same shape as beacon-web uses. */
export function previewQuery(
	entry: DatasetEntry,
	columns: string[],
	limit = DETAIL_PREVIEW_ROWS
): StructuredQuery {
	return {
		select: columns.map((column) => ({ column })),
		from: { [fromKey(entry.format)]: { paths: [entry.path] } },
		limit
	};
}

// Not always `read_<format>`: ODV text files read with `read_odv_ascii`.
const READ_FUNCTIONS: Record<string, string> = {
	nc: 'read_netcdf',
	parquet: 'read_parquet',
	csv: 'read_csv',
	arrow: 'read_arrow',
	zarr: 'read_zarr',
	geoparquet: 'read_geoparquet',
	txt: 'read_odv_ascii',
	tiff: 'read_tiff',
	bbf: 'read_bbf',
	atlas: 'read_atlas'
};

export function datasetEditorSql(entry: DatasetEntry): string {
	const fn = READ_FUNCTIONS[entry.format] ?? 'read_parquet';
	const escaped = entry.path.replace(/'/g, "''");

	return `SELECT * FROM ${fn}(['${escaped}']) LIMIT 100`;
}

export function datasetDetailQuery(path: string, nodeUrl: string): string {
	return new URLSearchParams({ file: path, node: nodeUrl }).toString();
}
