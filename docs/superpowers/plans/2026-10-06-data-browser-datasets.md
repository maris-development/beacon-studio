# Data Browser: Datasets (step 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Datasets list and detail pages with the Datasets screen of the data-browser spec: folders, search, upload, download, delete, storage use, schema and preview.

**Architecture:** Rules go in `src/lib/data-browser/datasets.ts` and `upload.ts` (plain TypeScript, unit tested). The pages reuse the step 3 parts (`BackLink`, `SchemaTable`, `PreviewGrid`, `DetailTabs`, `backTarget`, `normalizeFolder`). `runPreview` learns to take a structured query, so the dataset preview streams through it. Admin calls go through `withAdmin`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `@maris-development/beacon-client` 2.0.0, Vitest 3 with jsdom.

**Spec:** `docs/superpowers/specs/2026-10-06-data-browser-design.md` (sections "Shared parts", "Datasets", "Change to step 2")
**Depends on:** step 3 is built (`docs/superpowers/plans/2026-10-06-data-browser-tables.md`). Check that these exist before you start: `src/lib/data-browser/back.ts`, `folders.ts`, `tables.ts`, and `src/lib/components/data-browser/BackLink.svelte`, `SchemaTable.svelte`, `PreviewGrid.svelte`, `DetailTabs.svelte`. If one is missing, stop and report.
**Roadmap:** `docs/superpowers/admin-mode-roadmap.md` (update row 4 when done)

## Global Constraints

- Do not run `git commit` unless the user writes "commit". Never create a branch. No worktree.
- Edit files with the Edit or Write tool only. Never with `sed`, `perl` or `echo`.
- Tests go in `tests/` next to the code. Import with `../`.
- Prettier with tabs on new or rewritten files only. SCSS only. No new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100.
- Prefer `if`/`else` over `?:` in script code. Markup expressions are exempt.
- Layer rule: `src/lib/data-browser/*` imports only SDK types and values, `src/lib/sql/*` and other `src/lib/data-browser/*` files. No Svelte, `$app/*`, DOM, `services`, `stores`, `components` or `@/utils`.
- Every page uses `page-wrapper` and `page-container`.
- URLs stay: `/data-browser/datasets` (now with `?folder=` and `?q=`) and `/data-browser/datasets/detail?file=…&node=…`.
- Telemetry: keep `browser.dataset.open` and `browser.search` with their current props. No new event names.
- List limit: `DATASET_LIST_LIMIT = 100000`. Preview: 100 rows (`DETAIL_PREVIEW_ROWS` from step 3).
- Storage use loads only when `hasAdminSession(node.id)` is true. It never opens the sign-in dialog.
- Texts: `This node has more than 100,000 files. The list is incomplete.` / `Beacon cannot read this file format.` / delete note `A table that reads this file stops working.` / after upload `To query these files, create a table: run a crawler, or use Create external table.`

## Review Focus

- A path with a quote (`it's.nc`): "Open in SQL Editor" escapes it (`''`). Test in Task 2.
- A file in the root (no folder): it shows in the root listing, and "← Datasets" goes to the root. Tests in Task 2.
- An upload with one failed file among several: the others still upload, and "Retry failed" sends only the failed one. Tests in Task 3, manual check in Task 8.
- A close of the upload dialog during an upload: the upload stops, and no file shows "done" that did not finish. Manual check in Task 8.
- A file with `can_inspect: false`: Schema and Preview show the fixed text, and no request goes out. Manual check in Task 8.

---

### Task 1: `runPreview` takes a structured query

**Files:**
- Modify: `src/lib/sql/run.ts` (the `BatchSource` interface and the `runPreview` signature)
- Modify: `src/lib/sql/tests/run.test.ts` (append one test)

**Interfaces:**
- Produces: `BatchSource.queryBatches(query: QueryInput, signal?)` and `runPreview(source, query: QueryInput, options)`. `QueryInput` is the SDK type (`string | SqlQuery | StructuredQuery`). Every caller that passes a string keeps working.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/sql/tests/run.test.ts`, inside the `describe('runPreview', ...)` block:

```ts
	it('passes a structured query through to the source', async () => {
		let received: unknown = null;
		const source: BatchSource = {
			queryBatches: async (query) => {
				received = query;
				return { queryId: null, batches: (async function* () {})() };
			}
		};
		const structured = { select: [{ column: 'n' }], from: { netcdf: { paths: ['a.nc'] } }, limit: 100 };

		await runPreview(source, structured, { signal: new AbortController().signal });

		expect(received).toEqual(structured);
	});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm run check`
Expected: a type error. `runPreview` takes a `string` as its second argument. (Vitest itself does not check types, so `npm test` passes; the type check is the failing test here.)

- [ ] **Step 3: Widen the types**

In `src/lib/sql/run.ts`, change the import to:

```ts
import { rowsFromBatch, type ArrowRecordBatch, type QueryInput } from '@maris-development/beacon-client';
```

Change the `BatchSource` method to:

```ts
	queryBatches(
		query: QueryInput,
		signal?: AbortSignal
	): Promise<{ queryId: string | null; batches: AsyncIterable<ArrowRecordBatch> }>;
```

Change the `runPreview` parameter `sql: string` to `query: QueryInput`, and the call inside to `source.queryBatches(query, request.signal)`.

- [ ] **Step 4: Check**

Run: `npm test -- src/lib/sql` and `npm run check`
Expected: tests pass; 0 type errors. The SQL editor page and `PreviewGrid` pass strings, which still fit.

---

### Task 2: Dataset rules

**Files:**
- Create: `src/lib/data-browser/datasets.ts`
- Test: `src/lib/data-browser/tests/datasets.test.ts`

**Interfaces:**
- Consumes: `normalizeFolder` (`../folders`), `DETAIL_PREVIEW_ROWS` (`../tables`).
- Produces:
  - `DATASET_LIST_LIMIT = 100000`
  - `interface DatasetEntry { path: string; format: string; canInspect: boolean; size: number | null; lastModified: string | null }`
  - `parseEntries(raw: unknown): DatasetEntry[]`
  - `interface FolderRow { name: string; path: string; count: number }`
  - `listFolder(entries: DatasetEntry[], folder: string): { folders: FolderRow[]; files: DatasetEntry[] }`
  - `searchEntries(entries: DatasetEntry[], needle: string): DatasetEntry[]`
  - `type FileSort = 'name' | 'size' | 'date'`
  - `sortFiles(files: DatasetEntry[], key: FileSort, direction: 'asc' | 'desc'): DatasetEntry[]`
  - `folderParts(folder: string): { name: string; path: string }[]`
  - `fileName(path: string): string`, `folderOf(path: string): string`
  - `formatSize(bytes: number | null): string`
  - `previewQuery(entry: DatasetEntry, columns: string[], limit?: number): Record<string, unknown>`
  - `datasetEditorSql(entry: DatasetEntry): string`
  - `datasetDetailQuery(path: string, nodeUrl: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/datasets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	datasetDetailQuery,
	datasetEditorSql,
	fileName,
	folderOf,
	folderParts,
	formatSize,
	listFolder,
	parseEntries,
	previewQuery,
	searchEntries,
	sortFiles,
	type DatasetEntry
} from '../datasets';

function entry(path: string, extra: Partial<DatasetEntry> = {}): DatasetEntry {
	return { path, format: 'nc', canInspect: true, size: null, lastModified: null, ...extra };
}

const entries = [
	entry('argo/2024/a.nc'),
	entry('argo/2024/b.nc'),
	entry('argo/2023/c.nc'),
	entry('argo/index.csv', { format: 'csv' }),
	entry('top.parquet', { format: 'parquet' })
];

describe('parseEntries', () => {
	it('reads the server fields and drops bad entries', () => {
		const raw = [
			{ file_path: 'a.nc', format: 'nc', can_inspect: true, size: 10, last_modified: '2026-01-01T00:00:00Z' },
			{ file_path: 'b.txt', format: 'txt', can_inspect: false },
			{ format: 'nc' },
			'junk'
		];
		expect(parseEntries(raw)).toEqual([
			{ path: 'a.nc', format: 'nc', canInspect: true, size: 10, lastModified: '2026-01-01T00:00:00Z' },
			{ path: 'b.txt', format: 'txt', canInspect: false, size: null, lastModified: null }
		]);
	});

	it('gives no entries for a value of the wrong shape', () => {
		expect(parseEntries({})).toEqual([]);
	});
});

describe('listFolder', () => {
	it('lists the root', () => {
		const { folders, files } = listFolder(entries, '');
		expect(folders).toEqual([{ name: 'argo', path: 'argo/', count: 4 }]);
		expect(files.map((f) => f.path)).toEqual(['top.parquet']);
	});

	it('lists a folder with sub-folders and files', () => {
		const { folders, files } = listFolder(entries, 'argo');
		expect(folders).toEqual([
			{ name: '2023', path: 'argo/2023/', count: 1 },
			{ name: '2024', path: 'argo/2024/', count: 2 }
		]);
		expect(files.map((f) => f.path)).toEqual(['argo/index.csv']);
	});

	it('gives nothing for an unknown folder', () => {
		expect(listFolder(entries, 'nope/')).toEqual({ folders: [], files: [] });
	});
});

describe('searchEntries', () => {
	it('matches the full path in every folder, without case', () => {
		expect(searchEntries(entries, '2024/A').map((f) => f.path)).toEqual(['argo/2024/a.nc']);
	});

	it('gives every entry for an empty search', () => {
		expect(searchEntries(entries, ' ')).toHaveLength(5);
	});
});

describe('sortFiles', () => {
	const files = [
		entry('b.nc', { size: 5, lastModified: '2026-02-01T00:00:00Z' }),
		entry('a.nc', { size: null, lastModified: null }),
		entry('c.nc', { size: 50, lastModified: '2026-01-01T00:00:00Z' })
	];

	it('sorts by name', () => {
		expect(sortFiles(files, 'name', 'asc').map((f) => f.path)).toEqual(['a.nc', 'b.nc', 'c.nc']);
		expect(sortFiles(files, 'name', 'desc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
	});

	it('sorts by size and date, with unknown values last', () => {
		expect(sortFiles(files, 'size', 'desc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
		expect(sortFiles(files, 'date', 'asc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
	});
});

describe('names and paths', () => {
	it('splits a folder into parts', () => {
		expect(folderParts('argo/2024/')).toEqual([
			{ name: 'argo', path: 'argo/' },
			{ name: '2024', path: 'argo/2024/' }
		]);
		expect(folderParts('')).toEqual([]);
	});

	it('reads the name and folder of a path', () => {
		expect(fileName('argo/2024/a.nc')).toBe('a.nc');
		expect(folderOf('argo/2024/a.nc')).toBe('argo/2024/');
		expect(folderOf('top.nc')).toBe('');
	});

	it('writes a size', () => {
		expect(formatSize(null)).toBe('');
		expect(formatSize(512)).toBe('512 B');
		expect(formatSize(1536)).toBe('1.5 KB');
		expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
	});
});

describe('queries', () => {
	it('builds the preview for each format key', () => {
		expect(previewQuery(entry('a.nc'), ['n', 't'])).toEqual({
			select: [{ column: 'n' }, { column: 't' }],
			from: { netcdf: { paths: ['a.nc'] } },
			limit: 100
		});
		expect(previewQuery(entry('a.parquet', { format: 'parquet' }), ['n'], 5).from).toEqual({
			parquet: { paths: ['a.parquet'] }
		});
		expect(previewQuery(entry('x', { format: '' }), ['n']).from).toEqual({ parquet: { paths: ['x'] } });
	});

	it('builds the SQL editor query with the right read function, and escapes a quote', () => {
		expect(datasetEditorSql(entry("it's.nc"))).toBe("SELECT * FROM read_netcdf(['it''s.nc']) LIMIT 100");
		expect(datasetEditorSql(entry('a.txt', { format: 'txt' }))).toBe(
			"SELECT * FROM read_odv_ascii(['a.txt']) LIMIT 100"
		);
		expect(datasetEditorSql(entry('a.xyz', { format: 'xyz' }))).toBe(
			"SELECT * FROM read_parquet(['a.xyz']) LIMIT 100"
		);
	});

	it('builds the detail query', () => {
		expect(datasetDetailQuery('argo/a b.nc', 'https://a.org')).toBe(
			'file=argo%2Fa+b.nc&node=https%3A%2F%2Fa.org'
		);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with a missing-module error for `../datasets`.

- [ ] **Step 3: Write `datasets.ts`**

Create `src/lib/data-browser/datasets.ts`:

```ts
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
): Record<string, unknown> {
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 3: Upload plan and progress

**Files:**
- Create: `src/lib/data-browser/upload.ts`
- Test: `src/lib/data-browser/tests/upload.test.ts`

**Interfaces:**
- Consumes: `normalizeFolder` (`../folders`).
- Produces:
  - `type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed'`
  - `interface UploadItem { id: number; relativePath: string; target: string; size: number; status: UploadStatus; uploaded: number; error: string }`
  - `planUpload(destination: string, files: { relativePath: string; size: number }[]): UploadItem[]`
  - `uploadProgress(items: UploadItem[]): number` (0 to 100, weighted by bytes)
  - `retryItems(items: UploadItem[]): UploadItem[]` (failed items back to waiting)
  - `uploadSummary(items: UploadItem[]): { done: number; failed: number; total: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planUpload, retryItems, uploadProgress, uploadSummary } from '../upload';

describe('planUpload', () => {
	it('puts each file under the normalized destination, with its folder path', () => {
		const items = planUpload(' /argo//2024', [
			{ relativePath: 'a.nc', size: 10 },
			{ relativePath: 'sub/b.nc', size: 20 }
		]);
		expect(items.map((item) => item.target)).toEqual(['argo/2024/a.nc', 'argo/2024/sub/b.nc']);
		expect(items.every((item) => item.status === 'waiting' && item.uploaded === 0)).toBe(true);
		expect(new Set(items.map((item) => item.id)).size).toBe(2);
	});

	it('uploads to the root for an empty destination', () => {
		expect(planUpload('', [{ relativePath: 'a.nc', size: 1 }])[0].target).toBe('a.nc');
	});

	it('removes a leading slash from a relative path', () => {
		expect(planUpload('x/', [{ relativePath: '/a.nc', size: 1 }])[0].target).toBe('x/a.nc');
	});
});

describe('progress', () => {
	const items = planUpload('', [
		{ relativePath: 'a', size: 100 },
		{ relativePath: 'b', size: 300 }
	]);

	it('weights by bytes, and counts a done file whole', () => {
		const next = [
			{ ...items[0], status: 'done' as const, uploaded: 100 },
			{ ...items[1], status: 'uploading' as const, uploaded: 100 }
		];
		expect(uploadProgress(next)).toBe(50);
	});

	it('gives 0 for no bytes and 100 when all are done', () => {
		expect(uploadProgress([])).toBe(0);
		expect(uploadProgress(items.map((item) => ({ ...item, status: 'done' as const })))).toBe(100);
	});

	it('counts a failed file as not sent', () => {
		const next = [
			{ ...items[0], status: 'failed' as const, uploaded: 50 },
			{ ...items[1], status: 'done' as const, uploaded: 300 }
		];
		expect(uploadProgress(next)).toBe(75);
	});
});

describe('retry and summary', () => {
	it('puts only failed items back to waiting', () => {
		const items = planUpload('', [
			{ relativePath: 'a', size: 1 },
			{ relativePath: 'b', size: 1 }
		]);
		const next = retryItems([
			{ ...items[0], status: 'done', uploaded: 1 },
			{ ...items[1], status: 'failed', uploaded: 0, error: 'exists' }
		]);
		expect(next.map((item) => item.status)).toEqual(['done', 'waiting']);
		expect(next[1].error).toBe('');
	});

	it('counts done and failed', () => {
		const items = planUpload('', [
			{ relativePath: 'a', size: 1 },
			{ relativePath: 'b', size: 1 },
			{ relativePath: 'c', size: 1 }
		]);
		const next = [
			{ ...items[0], status: 'done' as const },
			{ ...items[1], status: 'failed' as const },
			items[2]
		];
		expect(uploadSummary(next)).toEqual({ done: 1, failed: 1, total: 3 });
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with a missing-module error for `../upload`.

- [ ] **Step 3: Write `upload.ts`**

Create `src/lib/data-browser/upload.ts`:

```ts
import { normalizeFolder } from './folders';

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface UploadItem {
	id: number;
	/** The path inside the picked or dropped folder, or the file name. */
	relativePath: string;
	/** The destination key in the datasets store. */
	target: string;
	size: number;
	status: UploadStatus;
	uploaded: number;
	error: string;
}

export function planUpload(
	destination: string,
	files: { relativePath: string; size: number }[]
): UploadItem[] {
	const folder = normalizeFolder(destination);

	return files.map((file, index) => ({
		id: index,
		relativePath: file.relativePath,
		target: `${folder}${file.relativePath.replace(/^\/+/, '')}`,
		size: file.size,
		status: 'waiting',
		uploaded: 0,
		error: ''
	}));
}

/** Percent of all bytes sent. A done file counts whole, a failed file counts zero. */
export function uploadProgress(items: UploadItem[]): number {
	const total = items.reduce((sum, item) => sum + item.size, 0);
	if (total === 0) {
		if (items.length > 0 && items.every((item) => item.status === 'done')) return 100;
		return 0;
	}

	const sent = items.reduce((sum, item) => {
		if (item.status === 'done') return sum + item.size;
		if (item.status === 'uploading') return sum + Math.min(item.uploaded, item.size);
		return sum;
	}, 0);

	return Math.round((sent / total) * 100);
}

export function retryItems(items: UploadItem[]): UploadItem[] {
	return items.map((item) => {
		if (item.status !== 'failed') return item;
		return { ...item, status: 'waiting', uploaded: 0, error: '' };
	});
}

export function uploadSummary(items: UploadItem[]): { done: number; failed: number; total: number } {
	return {
		done: items.filter((item) => item.status === 'done').length,
		failed: items.filter((item) => item.status === 'failed').length,
		total: items.length
	};
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 4: Upload dialog

**Files:**
- Create: `src/lib/components/data-browser/UploadDialog.svelte`
- Create: `src/lib/components/data-browser/dropped-files.ts`
- Delete: `src/lib/components/modals/UploadDatasetsModal.svelte`

**Interfaces:**
- Consumes: `planUpload`, `uploadProgress`, `retryItems`, `uploadSummary`, `UploadItem` (Task 3). `withAdmin`, `adminErrorMessage` (`@/services/admin-session`). `settings` (`@/stores/settings`).
- Produces:
  - `UploadDialog` props `{ node: BeaconNode; folder: string; onClose: () => void; onUploaded: () => void }`
  - `dropped-files.ts`: `filesFromDrop(event: DragEvent): Promise<{ file: File; relativePath: string }[]>` and `filesFromInput(list: FileList): { file: File; relativePath: string }[]`

No unit tests: `dropped-files.ts` uses the browser File System API, which jsdom does not have. Task 8 tests both files by hand.

- [ ] **Step 1: Create `dropped-files.ts`**

```ts
export type PickedFile = { file: File; relativePath: string };

/** Files from an `<input type="file">`. A folder pick fills `webkitRelativePath`. */
export function filesFromInput(list: FileList): PickedFile[] {
	return Array.from(list).map((file) => ({
		file,
		relativePath: file.webkitRelativePath || file.name
	}));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
	return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
	if (entry.isFile) {
		out.push({ file: await fileOf(entry as FileSystemFileEntry), relativePath: `${prefix}${entry.name}` });
		return;
	}

	const reader = (entry as FileSystemDirectoryEntry).createReader();
	// `readEntries` returns at most 100 entries per call, so it runs until it returns none.
	for (;;) {
		const batch = await readEntries(reader);
		if (batch.length === 0) break;
		for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
	}
}

/** Files and folders dropped on the dialog, with the folder path kept. */
export async function filesFromDrop(event: DragEvent): Promise<PickedFile[]> {
	const items = event.dataTransfer?.items;
	if (!items) return [];

	const entries = Array.from(items)
		.map((item) => item.webkitGetAsEntry())
		.filter((entry): entry is FileSystemEntry => entry !== null);

	const out: PickedFile[] = [];
	for (const entry of entries) await walk(entry, '', out);

	return out;
}
```

- [ ] **Step 2: Create `UploadDialog.svelte`**

```svelte
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { filesFromDrop, filesFromInput, type PickedFile } from './dropped-files';
	import {
		planUpload,
		retryItems,
		uploadProgress,
		uploadSummary,
		type UploadItem
	} from '@/data-browser/upload';
	import { formatSize } from '@/data-browser/datasets';

	type Props = { node: BeaconNode; folder: string; onClose: () => void; onUploaded: () => void };

	let { node, folder, onClose, onUploaded }: Props = $props();

	let destination = $state(folder);
	let overwrite = $state(false);
	let picked: PickedFile[] = $state([]);
	let items: UploadItem[] = $state([]);
	let running = $state(false);
	let finished = $state(false);
	let dragOver = $state(false);
	let controller: AbortController | null = null;

	let progress = $derived(uploadProgress(items));
	let summary = $derived(uploadSummary(items));

	function setPicked(files: PickedFile[]) {
		picked = files;
		items = planUpload(
			destination,
			files.map((entry) => ({ relativePath: entry.relativePath, size: entry.file.size }))
		);
		finished = false;
	}

	async function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		if (running) return;
		setPicked(await filesFromDrop(event));
	}

	function update(id: number, patch: Partial<UploadItem>) {
		items = items.map((item) => {
			if (item.id !== id) return item;
			return { ...item, ...patch };
		});
	}

	async function start() {
		if (running || items.length === 0) return;

		// The destination can change after the pick, so the targets follow it.
		const planned = planUpload(
			destination,
			picked.map((entry) => ({ relativePath: entry.relativePath, size: entry.file.size }))
		);
		items = planned.map((item, index) => ({ ...item, status: items[index]?.status ?? 'waiting' }));

		running = true;
		controller = new AbortController();
		const signal = controller.signal;

		try {
			for (const item of items) {
				if (item.status === 'done') continue;
				if (signal.aborted) break;

				update(item.id, { status: 'uploading', uploaded: 0, error: '' });
				const file = picked[item.id].file;

				try {
					const result = await withAdmin(node, (client) =>
						client.admin.uploadDataset(item.target, file, {
							overwrite,
							signal,
							onProgress: ({ uploaded }) => update(item.id, { uploaded })
						})
					);

					if (result === null) {
						update(item.id, { status: 'waiting', uploaded: 0 });
						break;
					}

					update(item.id, { status: 'done', uploaded: item.size });
				} catch (caught) {
					if (signal.aborted) {
						update(item.id, { status: 'waiting', uploaded: 0 });
						break;
					}
					update(item.id, { status: 'failed', error: adminErrorMessage(caught) });
				}
			}
		} finally {
			running = false;
			controller = null;
			finished = items.length > 0 && items.every((item) => item.status !== 'waiting');
			if (uploadSummary(items).done > 0) onUploaded();
		}
	}

	function stop() {
		controller?.abort();
	}

	function retry() {
		items = retryItems(items);
		void start();
	}

	function close() {
		stop();
		onClose();
	}

	onDestroy(stop);
</script>

<Modal title="Upload datasets" onClose={close} width="680px">
	<div class="form">
		<div class="field">
			<Label for="upload-dest">Destination folder</Label>
			<Input id="upload-dest" bind:value={destination} placeholder="argo/2024/" disabled={running} />
		</div>

		<div
			class="drop"
			class:over={dragOver}
			role="region"
			aria-label="Drop files or folders here"
			ondragover={(event) => {
				event.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={onDrop}
		>
			<p>Drop files or folders here, or</p>
			<div class="pickers">
				<label class="pick">
					Pick files
					<input
						type="file"
						multiple
						disabled={running}
						onchange={(event) => setPicked(filesFromInput(event.currentTarget.files!))}
					/>
				</label>
				<label class="pick">
					Pick a folder
					<input
						type="file"
						webkitdirectory
						disabled={running}
						onchange={(event) => setPicked(filesFromInput(event.currentTarget.files!))}
					/>
				</label>
			</div>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={overwrite} disabled={running} />
			Replace existing files
		</label>

		{#if items.length > 0}
			<div class="bar" aria-label="Progress"><span style="width: {progress}%"></span></div>
			<p class="muted">{summary.done} of {summary.total} done{#if summary.failed > 0}, {summary.failed} failed{/if}</p>

			<ul class="items">
				{#each items as item (item.id)}
					<li class={item.status}>
						<span class="path">{item.target}</span>
						<span class="size">{formatSize(item.size)}</span>
						<span class="status">
							{#if item.status === 'failed'}
								{item.error}
							{:else}
								{item.status}
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if finished && summary.done > 0}
			<p class="muted">To query these files, create a table: run a crawler, or use Create external table.</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={close}>Close</Button>
		{#if running}
			<Button variant="destructive" onclick={stop}>Stop</Button>
		{:else if summary.failed > 0}
			<Button onclick={retry}>Retry failed</Button>
		{:else}
			<Button onclick={start} disabled={items.length === 0 || finished}>Upload</Button>
		{/if}
	</div>
</Modal>

<style lang="scss">
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.375rem;
	}

	.drop {
		padding: 1rem;
		border: 2px dashed var(--border);
		border-radius: 0.5rem;
		text-align: center;

		&.over {
			border-color: var(--primary);
			background: var(--accent);
		}

		p {
			margin: 0 0 0.5rem;
		}
	}

	.pickers {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
	}

	.pick {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		cursor: pointer;

		input {
			display: none;
		}
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.bar {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
			transition: width 0.2s;
		}
	}

	.items {
		max-height: 14rem;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
		font-size: 0.8125rem;

		li {
			display: grid;
			grid-template-columns: 1fr auto 8rem;
			gap: 0.5rem;
			padding: 0.25rem 0;
			border-bottom: 1px solid var(--border);

			&.failed .status {
				color: var(--destructive);
			}

			&.done .status {
				color: var(--muted-foreground);
			}
		}
	}

	.path {
		word-break: break-all;
	}

	.size,
	.muted {
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
```

Notes for the implementer:
- `webkitdirectory` on `<input>` can give a Svelte type error. If it does, add it in an `$effect` on a bound input element (`input.webkitdirectory = true`) instead of the attribute.
- A failed file keeps the reason from `adminErrorMessage`. A 409 shows the server text ("already exists").

- [ ] **Step 3: Delete the old modal**

Run: `git rm src/lib/components/modals/UploadDatasetsModal.svelte`
Expected: `npm run check` fails until Task 6 rewrites the list page. That is expected.

- [ ] **Step 4: Format and lint**

Run: `npx prettier --write src/lib/components/data-browser`, `npx eslint src/lib/components/data-browser`
Expected: no errors.

---

### Task 5: Storage bar

**Files:**
- Create: `src/lib/components/data-browser/StorageBar.svelte`

**Interfaces:**
- Consumes: `hasAdminSession`, `signedInNodeIds`, `makeAdminClient`, `credentialsOf` (`@/services/admin-session`). `formatSize` (Task 2). `settings`.
- Produces: `StorageBar` props `{ node: BeaconNode }`. Renders nothing without a session.

- [ ] **Step 1: Create the component**

```svelte
<!-- Disk use of the datasets store. Only with a session: it never asks for a sign-in. -->
<script lang="ts">
	import type { DatasetStorage } from '@maris-development/beacon-client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { credentialsOf, makeAdminClient, signedInNodeIds } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { formatSize } from '@/data-browser/datasets';

	let { node }: { node: BeaconNode } = $props();

	let storage: DatasetStorage | null = $state(null);

	let active = $derived($settings.adminFeatures && $signedInNodeIds.has(node.id));

	$effect(() => {
		storage = null;
		if (!active) return;

		const credentials = credentialsOf(node.id);
		if (!credentials) return;

		let current = true;
		makeAdminClient(node, credentials)
			.admin.datasetStorage()
			.then(
				(value) => {
					if (current) storage = value;
				},
				() => {
					if (current) storage = null;
				}
			);

		return () => (current = false);
	});
</script>

{#if storage}
	<div class="storage">
		{#if storage.used_percent !== null}
			<div class="bar"><span style="width: {storage.used_percent}%"></span></div>
			<span>
				{formatSize(storage.used_space)} used of {formatSize(storage.total_space)}, {formatSize(storage.free_space)} free
			</span>
		{:else}
			<span>
				{formatSize(storage.used_space)} in {storage.object_count ?? 0} objects ({storage.location})
			</span>
		{/if}
	</div>
{/if}

<style lang="scss">
	.storage {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.bar {
		width: 10rem;
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
		}
	}
</style>
```

Note: the effect reads `node` (a prop that changes object on each health check). That re-runs the request on a health check. If that shows up in the network tab, track `node.id` and `node.url` as primitives and read `node` with `untrack`.

- [ ] **Step 2: Lint**

Run: `npx prettier --write src/lib/components/data-browser/StorageBar.svelte`, `npx eslint src/lib/components/data-browser`
Expected: no errors.

---

### Task 6: Datasets list page

**Files:**
- Modify (rewrite): `src/routes/data-browser/datasets/+page.svelte`

**Interfaces:**
- Consumes: `parseEntries`, `listFolder`, `searchEntries`, `sortFiles`, `folderParts`, `fileName`, `formatSize`, `datasetDetailQuery`, `DATASET_LIST_LIMIT`, `DatasetEntry`, `FileSort` (Task 2). `normalizeFolder` (step 3). `withBack` (step 3). `UploadDialog` (Task 4), `StorageBar` (Task 5). `NodePicker`, `AdminAction`, `makeBeaconClient`, `currentNode`, `track`.

- [ ] **Step 1: Rewrite the page**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FileIcon from '@lucide/svelte/icons/file';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import UploadDialog from '@/components/data-browser/UploadDialog.svelte';
	import StorageBar from '@/components/data-browser/StorageBar.svelte';
	import { Input } from '@/components/ui/input';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { track } from '@/telemetry';
	import { withBack } from '@/data-browser/back';
	import { normalizeFolder } from '@/data-browser/folders';
	import {
		DATASET_LIST_LIMIT,
		datasetDetailQuery,
		fileName,
		folderParts,
		formatSize,
		listFolder,
		parseEntries,
		searchEntries,
		sortFiles,
		type DatasetEntry,
		type FileSort
	} from '@/data-browser/datasets';
	import { sqlErrorMessage } from '@/sql/statement';

	const PAGE_SIZE = 100;

	let entries: DatasetEntry[] = $state([]);
	let total: number | null = $state(null);
	let loading = $state(false);
	let error = $state('');
	let uploadOpen = $state(false);
	let needle = $state(page.url.searchParams.get('q') ?? '');
	let sortKey: FileSort = $state('name');
	let sortDirection: 'asc' | 'desc' = $state('asc');
	let pageIndex = $state(Number(page.url.searchParams.get('page') ?? '1'));

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let folder = $derived(normalizeFolder(page.url.searchParams.get('folder') ?? ''));
	let searching = $derived(needle.trim() !== '');
	let cut = $derived(entries.length >= DATASET_LIST_LIMIT);

	let listing = $derived.by(() => {
		if (searching) return { folders: [], files: sortFiles(searchEntries(entries, needle), sortKey, sortDirection) };

		const { folders, files } = listFolder(entries, folder);
		return { folders, files: sortFiles(files, sortKey, sortDirection) };
	});

	let rowCount = $derived(listing.folders.length + listing.files.length);
	let pageCount = $derived(Math.max(1, Math.ceil(rowCount / PAGE_SIZE)));
	let pageFolders = $derived(listing.folders.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE));
	let pageFiles = $derived.by(() => {
		const start = Math.max(0, (pageIndex - 1) * PAGE_SIZE - listing.folders.length);
		const room = PAGE_SIZE - pageFolders.length;
		return listing.files.slice(start, start + room);
	});

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => load());
	});

	async function load() {
		const current = node;
		if (!current) return;

		const client = makeBeaconClient(current);
		loading = true;
		error = '';

		try {
			const [raw, count] = await Promise.all([
				client.datasets({ limit: DATASET_LIST_LIMIT }),
				client.totalDatasets().catch(() => null)
			]);
			if (current.url !== nodeUrl) return;

			entries = parseEntries(raw);
			total = count;
		} catch (caught) {
			if (current.url === nodeUrl) {
				entries = [];
				error = sqlErrorMessage(caught);
			}
		} finally {
			if (current.url === nodeUrl) loading = false;
		}
	}

	function listHref(nextFolder: string): string {
		const url = new URL(resolve('/data-browser/datasets'), page.url.origin);
		if (nextFolder) url.searchParams.set('folder', nextFolder);
		return `${url.pathname}${url.search}`;
	}

	function backUrl(): string {
		const url = new URL(page.url);
		if (needle.trim()) {
			url.searchParams.set('q', needle.trim());
		} else {
			url.searchParams.delete('q');
		}
		url.searchParams.set('page', String(pageIndex));
		return `${url.pathname}${url.search}`;
	}

	function detailHref(entry: DatasetEntry): string {
		if (!node) return '#';
		const href = `${resolve('/data-browser/datasets/detail')}?${datasetDetailQuery(entry.path, node.url)}`;
		return withBack(href, backUrl());
	}

	function openFolder(path: string) {
		needle = '';
		pageIndex = 1;
		goto(listHref(path), { keepFocus: true, noScroll: true });
	}

	function setSort(key: FileSort) {
		if (sortKey === key) {
			if (sortDirection === 'asc') {
				sortDirection = 'desc';
			} else {
				sortDirection = 'asc';
			}
		} else {
			sortKey = key;
			sortDirection = 'asc';
		}
	}

	function onSearch() {
		pageIndex = 1;
		if (searching) {
			track('browser.search', {
				props: { scope: 'datasets', term: needle.trim().slice(0, 60), results: listing.files.length }
			});
		}
	}
</script>

<svelte:head>
	<title>Datasets - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Datasets', href: resolve('/data-browser/datasets') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Datasets</h1>

		<p>Explore the files of your Beacon node.</p>

		<NodePicker>
			{#snippet actions()}
				<AdminAction>
					{#snippet children({ disabled })}
						<Button variant="outline" disabled={disabled || !node} onclick={() => (uploadOpen = true)}>
							Upload
						</Button>
					{/snippet}
				</AdminAction>
			{/snippet}
		</NodePicker>

		{#if !node}
			<p>Pick a Beacon node.</p>
		{:else}
			<StorageBar {node} />

			<div class="toolbar">
				<Input type="search" placeholder="Search all folders" bind:value={needle} onchange={onSearch} />
				{#if total !== null}<span class="muted">{total.toLocaleString()} files</span>{/if}
			</div>

			{#if cut}
				<p class="warning">This node has more than 100,000 files. The list is incomplete.</p>
			{/if}

			{#if !searching}
				<nav class="path" aria-label="Folder">
					<a href={listHref('')}>All</a>
					{#each folderParts(folder) as part (part.path)}
						<span>/</span>
						<a href={listHref(part.path)}>{part.name}</a>
					{/each}
				</nav>
			{/if}

			{#if loading && entries.length === 0}
				<p class="muted">Loading the files...</p>
			{:else if error}
				<p class="error">{error}</p>
			{:else if rowCount === 0}
				<p class="muted">No files here.</p>
			{:else}
				<table class="files">
					<thead>
						<tr>
							<th><button type="button" onclick={() => setSort('name')}>Name</button></th>
							<th>Format</th>
							<th><button type="button" onclick={() => setSort('size')}>Size</button></th>
							<th><button type="button" onclick={() => setSort('date')}>Modified</button></th>
						</tr>
					</thead>
					<tbody>
						{#each pageFolders as row (row.path)}
							<tr>
								<td colspan="4">
									<button type="button" class="link" onclick={() => openFolder(row.path)}>
										<FolderIcon class="size-4" />
										{row.name}
										<span class="muted">({row.count})</span>
									</button>
								</td>
							</tr>
						{/each}
						{#each pageFiles as entry (entry.path)}
							<tr>
								<td>
									<a class="link" href={detailHref(entry)}>
										<FileIcon class="size-4" />
										{#if searching}{entry.path}{:else}{fileName(entry.path)}{/if}
									</a>
								</td>
								<td>{entry.format}</td>
								<td>{formatSize(entry.size)}</td>
								<td>{entry.lastModified?.slice(0, 10) ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>

				{#if pageCount > 1}
					<div class="pager">
						<Button variant="outline" size="sm" disabled={pageIndex <= 1} onclick={() => (pageIndex -= 1)}>Previous</Button>
						<span class="muted">Page {pageIndex} of {pageCount}</span>
						<Button variant="outline" size="sm" disabled={pageIndex >= pageCount} onclick={() => (pageIndex += 1)}>Next</Button>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{#if uploadOpen && node}
	<UploadDialog {node} {folder} onClose={() => (uploadOpen = false)} onUploaded={load} />
{/if}

<style lang="scss">
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.path {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		font-family: monospace;
	}

	.files {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;

		th,
		td {
			padding: 0.375rem 0.5rem;
			border-bottom: 1px solid var(--border);
			text-align: left;
		}

		th button {
			padding: 0;
			border: 0;
			background: none;
			font-weight: 600;
			cursor: pointer;
		}
	}

	.link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		word-break: break-all;

		&:hover {
			text-decoration: underline;
		}
	}

	.pager {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.warning {
		color: var(--destructive);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

Note: `entry.lastModified?.slice(0, 10) ?? ''` shows the date part of the RFC 3339 value. That is enough for a list; the detail page shows the full value.

- [ ] **Step 2: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser/datasets/+page.svelte`, `npx prettier --write src/routes/data-browser/datasets/+page.svelte`
Expected: no errors.

---

### Task 7: Dataset detail page and landing page

**Files:**
- Modify (rewrite): `src/routes/data-browser/datasets/detail/+page.svelte`
- Modify: `src/routes/data-browser/+page.svelte` (script only: the counts through the SDK)

**Interfaces:**
- Consumes: `BackLink`, `SchemaTable`, `PreviewGrid`, `DetailTabs` (step 3). `parseEntries`, `previewQuery`, `datasetEditorSql`, `folderOf`, `formatSize`, `DatasetEntry` (Task 2). `parseSchema` (`@/sql/catalog`). `withAdmin`, `adminErrorMessage`. `askConfirm`, `addToast`. `saveBlob` (`@/components/sql-editor/save-blob`).

- [ ] **Step 1: Rewrite the detail page**

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { error as kitError } from '@sveltejs/kit';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import BackLink from '@/components/data-browser/BackLink.svelte';
	import SchemaTable from '@/components/data-browser/SchemaTable.svelte';
	import PreviewGrid from '@/components/data-browser/PreviewGrid.svelte';
	import DetailTabs from '@/components/data-browser/DetailTabs.svelte';
	import { saveBlob } from '@/components/sql-editor/save-blob';
	import { makeBeaconClient } from '@/beacon-api/client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { findByUrl } from '@/services/beacon-node';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { track } from '@/telemetry';
	import { backTarget } from '@/data-browser/back';
	import {
		datasetEditorSql,
		fileName,
		folderOf,
		formatSize,
		parseEntries,
		previewQuery,
		type DatasetEntry
	} from '@/data-browser/datasets';
	import { parseSchema } from '@/sql/catalog';
	import { base } from '$app/paths';

	const LIST = resolve('/data-browser/datasets');

	const file = page.url.searchParams.get('file') ?? '';
	if (!file) throw kitError(400, 'Missing `file` query parameter');

	const nodeUrl = page.url.searchParams.get('node') ?? '';
	if (!nodeUrl) throw kitError(400, 'Missing `node` query parameter');

	// Admin actions need a saved node: the sign-in session belongs to its id.
	const savedNode = findByUrl(nodeUrl);

	function readNode(): BeaconNode {
		if (savedNode) return savedNode;
		return { id: '', name: nodeUrl, url: nodeUrl, status: 'unknown', latencyMs: null, lastCheckedAt: null };
	}

	const client = makeBeaconClient(readNode());

	// The list builds the detail link from a known entry. A share link has only the path.
	let entry: DatasetEntry = $state({ path: file, format: '', canInspect: true, size: null, lastModified: null });
	let tab = $state('schema');
	let columns: string[] | null = $state(null);
	let busy = $state(false);

	let folderList = $derived(
		backTarget(page.url.searchParams.get('back'), base, `${LIST}?folder=${encodeURIComponent(folderOf(file))}`)
	);

	onMount(async () => {
		track('browser.dataset.open', { nodeHost: nodeUrl, props: { file } });

		try {
			const found = parseEntries(await client.datasets({ pattern: file, limit: 1 }));
			if (found[0]?.path === file) entry = found[0];
		} catch {
			// The details stay unknown. Schema and preview still try.
		}
	});

	async function loadSchema(): Promise<unknown> {
		const schema = await client.datasetSchema(file);
		columns = parseSchema(schema).map((column) => column.name);
		return schema;
	}

	async function selectTab(id: string) {
		tab = id;
		if (id === 'preview' && columns === null) {
			try {
				await loadSchema();
			} catch {
				columns = [];
			}
		}
	}

	async function download() {
		if (!savedNode) return;
		busy = true;

		try {
			const blob = await withAdmin(savedNode, (admin) => admin.admin.downloadDataset(file));
			if (blob !== null) saveBlob(blob, fileName(file));
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!savedNode) return;

		const sure = await askConfirm({
			title: `Delete ${fileName(file)}`,
			message: `Delete "${file}" from ${savedNode.name}?`,
			note: 'A table that reads this file stops working.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!sure) return;

		busy = true;

		try {
			const done = await withAdmin(savedNode, async (admin) => {
				await admin.admin.deleteDataset(file);
				return true;
			});
			if (done) {
				addToast({ type: 'success', message: `Deleted ${fileName(file)}.` });
				goto(folderList);
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	function openInEditor() {
		goto(`${resolve('/sql-editor')}?sql=${encodeURIComponent(datasetEditorSql(entry))}`);
	}
</script>

<svelte:head>
	<title>Dataset {fileName(file)} - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Datasets', href: LIST },
		{ label: fileName(file), href: '' }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<BackLink label="Datasets" fallback={`${LIST}?folder=${encodeURIComponent(folderOf(file))}`} />

		<header class="head">
			<div>
				<h1>{fileName(file)}</h1>
				<p class="meta">
					{file}
					{#if entry.format}· {entry.format}{/if}
					{#if entry.size !== null}· {formatSize(entry.size)}{/if}
					{#if entry.lastModified}· {entry.lastModified}{/if}
					· {savedNode?.name ?? nodeUrl}
				</p>
			</div>

			<div class="actions">
				<Button variant="outline" onclick={openInEditor}>
					<SquareTerminalIcon />
					Open in SQL Editor
				</Button>

				{#if savedNode}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="outline" disabled={disabled || busy} onclick={download}>Download</Button>
						{/snippet}
					</AdminAction>
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="destructive" disabled={disabled || busy} onclick={remove}>Delete</Button>
						{/snippet}
					</AdminAction>
				{/if}
			</div>
		</header>

		<DetailTabs
			tabs={[
				{ id: 'schema', label: 'Schema' },
				{ id: 'preview', label: 'Preview' }
			]}
			active={tab}
			onSelect={selectTab}
		/>

		{#if !entry.canInspect}
			<p class="muted">Beacon cannot read this file format.</p>
		{:else if tab === 'schema'}
			<SchemaTable load={loadSchema} />
		{:else if columns === null}
			<p class="muted">Loading the columns...</p>
		{:else if columns.length === 0}
			<p class="muted">This file has no columns to preview.</p>
		{:else}
			<PreviewGrid source={client} query={previewQuery(entry, columns)} />
		{/if}
	</div>
</div>

<style lang="scss">
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;

		h1 {
			margin: 0;
			word-break: break-all;
		}
	}

	.meta {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-family: monospace;
		word-break: break-all;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.muted {
		color: var(--muted-foreground);
	}
</style>
```

- [ ] **Step 2: Rename the `PreviewGrid` prop**

`PreviewGrid` (step 3) takes `sql: string`. Change it to `query: QueryInput`:

- In `src/lib/components/data-browser/PreviewGrid.svelte`, import `type QueryInput` from `@maris-development/beacon-client`, change the prop to `{ source: BatchSource; query: QueryInput }`, and pass `query` to `runPreview`.
- In `src/routes/data-browser/data-tables/detail/+page.svelte`, change `sql={previewSql(ref, defaults!)}` to `query={previewSql(ref, defaults!)}`.

- [ ] **Step 3: Move the landing page counts to the SDK**

In `src/routes/data-browser/+page.svelte`, replace the script block with:

```svelte
<script lang="ts">
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';

	let datasetsTitle: string = $state('Datasets');
	let dataTablesTitle: string = $state('Data Tables');

	let nodeUrl = $derived($currentNode?.url ?? null);

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => count());
	});

	function plural(count: number, word: string): string {
		if (count === 1) return `1 ${word}`;
		return `${count.toLocaleString()} ${word}s`;
	}

	function count() {
		const node = $currentNode;
		if (!node) return;

		const client = makeBeaconClient(node);
		datasetsTitle = 'Datasets';
		dataTablesTitle = 'Data Tables';

		client.totalDatasets().then(
			(total) => {
				if (total > 0) datasetsTitle = plural(total, 'dataset');
			},
			() => {}
		);

		client.tables().then(
			(tables) => {
				if (tables.length > 0) dataTablesTitle = plural(tables.length, 'data table');
			},
			() => {}
		);
	}
</script>
```

Keep the markup and the style unchanged. Change the `Cookiecrumb` `href` from `'/data-browser'` to `resolve('/data-browser')` while you are there.

- [ ] **Step 4: Check**

Run: `npm test`, `npm run check`, `npx eslint src/routes/data-browser src/lib/components/data-browser`, `npx prettier --write src/routes/data-browser/datasets/detail/+page.svelte`
Expected: no errors.

---

### Task 8: Docs, checks and manual test

**Files:**
- Modify: `docs/superpowers/admin-mode-roadmap.md`

- [ ] **Step 1: Run every check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/components/data-browser src/routes/data-browser src/lib/sql`
Expected: all pass.

- [ ] **Step 2: Manual test**

Run `npm run dev`. Use a node with folders of files, and its admin credentials.

1. `/data-browser/datasets`: the root shows folders with counts, then files. The total shows.
2. Open a folder, then a sub-folder. The folder path shows "All / a / b"; each part works. The URL holds `?folder=`.
3. Sort by size and by date, both directions.
4. Search for part of a file name: matches from all folders show with their full path.
5. Open a file. "← Datasets" goes back to the same folder and page. Open a search result, then go back: the search term is still there.
6. Schema tab: columns. Preview tab: up to 100 rows. A NetCDF file previews too.
7. A file with `can_inspect: false` (for example a `.txt` that is not ODV): the fixed text shows.
8. "Open in SQL Editor": a new tab with `SELECT * FROM read_<fn>(['path']) LIMIT 100`.
9. Settings off: Upload, Download and Delete are greyed out. No storage bar.
10. Settings on, no session: no storage bar, and no sign-in dialog on page load.
11. Upload two files into the current folder: the sign-in dialog opens once; both upload with progress; the list reloads; the "create a table" line shows. The storage bar now shows.
12. Upload the same two files again without "Replace existing files": both fail with "already exists". "Retry failed" with the box on: both succeed.
13. Drop a folder with a sub-folder on the dialog: the targets keep the folder path.
14. Start a large upload and close the dialog: the upload stops.
15. Download a file. Delete it: confirm, then back to its folder with a toast.
16. `/data-browser`: the two cards show the counts for the current node.

- [ ] **Step 3: Update the roadmap**

Set row 4 of the status table: plan link `[plan](plans/2026-10-06-data-browser-datasets.md)` and the build status with the date and the results. Report each failed manual step to the user with what you saw.
