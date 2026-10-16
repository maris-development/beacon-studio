# Data Browser: Tables (step 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Data Tables list and detail pages with the Tables screen of the data-browser spec, and build the shared data-browser parts that steps 4 and 5 reuse.

**Architecture:** Plain TypeScript in a new domain folder `src/lib/data-browser/` holds the rules (safe way back, folder tree, table statements, external-table body). Shared Svelte parts live in `src/lib/components/data-browser/`. The two route pages use the SDK through `makeBeaconClient`, and admin actions go through `withAdmin`. The SQL editor learns to open `?sql=` in a new tab.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `@maris-development/beacon-client` 2.0.0, Vitest 3 with jsdom.

**Spec:** `docs/superpowers/specs/2026-10-06-data-browser-design.md` (sections "Shared parts", "Tables", "Change to step 2")
**Roadmap:** `docs/superpowers/admin-mode-roadmap.md` (update row 3 when done)

## Global Constraints

- Do not run `git commit` unless the user writes "commit". Never create a branch. No worktree.
- Edit files with the Edit or Write tool only. Never with `sed`, `perl` or `echo`.
- Tests go in a `tests/` folder next to the code: `src/lib/data-browser/tests/back.test.ts`. Import with `../`.
- Formatting: Prettier with tabs. Run `npx prettier --write` on new files only. Do not reformat old files.
- Styles: SCSS only. No new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100. No `-ing` verbs, no em-dashes.
- Prefer `if`/`else` over `?:` in script code. Markup expressions are exempt.
- Layer rule: `src/lib/data-browser/*` imports only SDK types and values, `src/lib/sql/*`, and other `src/lib/data-browser/*` files. No Svelte, no `$app/*`, no DOM, no `services`, `stores` or `components`.
- Every page uses `<div class="page-wrapper"><div class="page-container">`.
- The existing URLs stay: `/data-browser/data-tables` and `/data-browser/data-tables/detail?table_name=…&node=…`. A detail URL without `catalog` and `schema` means the default catalog and schema.
- Telemetry: keep the existing events `browser.table.open` and `browser.search` with their current props. Add no new event names.
- Preview: 100 rows (`DETAIL_PREVIEW_ROWS`).
- Admin buttons go inside `AdminAction` and call `withAdmin` directly.
- Destructive actions ask first with `askConfirm({ ..., destructive: true })` from `@/stores/confirm`.
- Texts: `Beacon stores no definition for this table. A crawler made it, or it is an older table.` / Drop confirm note `The files stay in place.`

## Review Focus

- A crafted `back` value (`https://evil.example`, `//evil.example`, `/data-browserx`, `javascript:…`): the link goes to the plain list. Tests in Task 1.
- A detail page opened from a share link for a node that is not in the node list: the schema and preview load, and no admin button shows. Manual check in Task 9.
- A table name with capitals, spaces or quotes: preview, refresh, drop and "Open in SQL Editor" quote it. Tests in Task 2.
- A user who presses "Open in SQL Editor" twice for the same table: two tabs open, and the URL holds no `sql` after each. Test in Task 4, manual check in Task 9.
- A table outside the default schema: no Refresh or Drop, and the preview uses the qualified name. Tests in Task 2, manual check in Task 9.

---

### Task 1: Safe way back

**Files:**
- Create: `src/lib/data-browser/back.ts`
- Test: `src/lib/data-browser/tests/back.test.ts`

**Interfaces:**
- Produces:
  - `backTarget(back: string | null, base: string, fallback: string): string`
  - `withBack(href: string, back: string): string` (adds `back=<value>` to a URL that can already hold parameters)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/back.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { backTarget, withBack } from '../back';

const fallback = '/data-browser/data-tables';

describe('backTarget', () => {
	it('uses a list URL with its parameters', () => {
		expect(backTarget('/data-browser/datasets?folder=argo%2F&page=2', '', fallback)).toBe(
			'/data-browser/datasets?folder=argo%2F&page=2'
		);
	});

	it('accepts the data-browser root itself', () => {
		expect(backTarget('/data-browser', '', fallback)).toBe('/data-browser');
		expect(backTarget('/data-browser?x=1', '', fallback)).toBe('/data-browser?x=1');
	});

	it('respects the base path', () => {
		expect(backTarget('/studio/data-browser/data-tables', '/studio', fallback)).toBe(
			'/studio/data-browser/data-tables'
		);
		expect(backTarget('/data-browser/data-tables', '/studio', fallback)).toBe(fallback);
	});

	it('falls back for no value', () => {
		expect(backTarget(null, '', fallback)).toBe(fallback);
		expect(backTarget('', '', fallback)).toBe(fallback);
	});

	it('falls back for a value that leaves the data browser or the site', () => {
		for (const bad of [
			'https://evil.example/data-browser',
			'//evil.example/data-browser',
			'/data-browserx',
			'/queries/history',
			'javascript:alert(1)',
			'/data-browser\\..\\x',
			'data-browser/data-tables'
		]) {
			expect(backTarget(bad, '', fallback)).toBe(fallback);
		}
	});
});

describe('withBack', () => {
	it('adds back to a URL with no parameters', () => {
		expect(withBack('/data-browser/data-tables/detail', '/data-browser/data-tables?q=a')).toBe(
			'/data-browser/data-tables/detail?back=%2Fdata-browser%2Fdata-tables%3Fq%3Da'
		);
	});

	it('adds back to a URL with parameters', () => {
		expect(withBack('/d?table_name=t', '/l')).toBe('/d?table_name=t&back=%2Fl');
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with a missing-module error for `../back`.

- [ ] **Step 3: Write `back.ts`**

Create `src/lib/data-browser/back.ts`:

```ts
/**
 * The target of a "back" link. Only a path inside the data browser of this site is
 * accepted, so a crafted link cannot send the user to another site or page.
 */
export function backTarget(back: string | null, base: string, fallback: string): string {
	if (!back || back.includes('\\')) return fallback;

	const root = `${base}/data-browser`;
	if (back === root || back.startsWith(`${root}/`) || back.startsWith(`${root}?`)) {
		return back;
	}

	return fallback;
}

/** Adds `back` to a URL that can already hold parameters. */
export function withBack(href: string, back: string): string {
	let separator = '?';
	if (href.includes('?')) separator = '&';

	return `${href}${separator}back=${encodeURIComponent(back)}`;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 2: Table statements and names

**Files:**
- Create: `src/lib/data-browser/tables.ts`
- Test: `src/lib/data-browser/tests/tables.test.ts`

**Interfaces:**
- Consumes: `quoteIdent`, `sqlName`, `TableRef`, `CatalogDefaults` from `@/sql/identifiers`. `CatalogTree` from `@/sql/catalog`.
- Produces:
  - `DETAIL_PREVIEW_ROWS = 100`
  - `type TableKind = 'table' | 'view'`
  - `tableKind(tableType: string): TableKind`
  - `isDefaultSchema(ref: { catalog: string; schema: string }, defaults: CatalogDefaults): boolean`
  - `canManage(ref: TableRef, defaults: CatalogDefaults): boolean`
  - `previewSql(ref: TableRef, defaults: CatalogDefaults, limit?: number): string`
  - `editorSql(ref: TableRef, defaults: CatalogDefaults): string`
  - `refreshSql(ref: TableRef, defaults: CatalogDefaults): string`
  - `dropSql(ref: TableRef, defaults: CatalogDefaults): string`
  - `createViewSql(name: string, query: string, materialized: boolean): string`
  - `splitTree(tree: CatalogTree): { defaultTables: CatalogTable[]; others: CatalogTree }`
  - `tableDetailQuery(ref: TableRef, defaults: CatalogDefaults, nodeUrl: string): string` (the query string, without `?`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/tables.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTree } from '@/sql/catalog';
import {
	canManage,
	createViewSql,
	dropSql,
	editorSql,
	previewSql,
	refreshSql,
	splitTree,
	tableDetailQuery,
	tableKind
} from '../tables';

const defaults = { catalog: 'beacon', schema: 'public' };
const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };
const odd = { catalog: 'beacon', schema: 'public', name: 'My "Table"' };
const jobs = { catalog: 'beacon', schema: 'system', name: 'jobs' };

describe('table statements', () => {
	it('builds the preview with a bare name in the default schema', () => {
		expect(previewSql(argo, defaults)).toBe('SELECT * FROM argo LIMIT 100');
	});

	it('quotes an odd name and qualifies another schema', () => {
		expect(previewSql(odd, defaults, 5)).toBe('SELECT * FROM "My ""Table""" LIMIT 5');
		expect(previewSql(jobs, defaults)).toBe('SELECT * FROM beacon.system.jobs LIMIT 100');
	});

	it('builds the SQL editor query, refresh and drop', () => {
		expect(editorSql(odd, defaults)).toBe('SELECT * FROM "My ""Table""" LIMIT 100');
		expect(refreshSql(odd, defaults)).toBe('REFRESH "My ""Table"""');
		expect(dropSql(argo, defaults)).toBe('DROP TABLE IF EXISTS argo');
	});

	it('builds a view and a materialized view', () => {
		expect(createViewSql('Recent', ' SELECT 1 AS a; ', false)).toBe(
			'CREATE VIEW "Recent" AS SELECT 1 AS a'
		);
		expect(createViewSql('recent', 'SELECT 1', true)).toBe(
			'CREATE MATERIALIZED VIEW recent AS SELECT 1'
		);
	});
});

describe('table rules', () => {
	it('allows refresh and drop in the default schema only', () => {
		expect(canManage(argo, defaults)).toBe(true);
		expect(canManage(jobs, defaults)).toBe(false);
	});

	it('reads the kind', () => {
		expect(tableKind('VIEW')).toBe('view');
		expect(tableKind('view')).toBe('view');
		expect(tableKind('BASE TABLE')).toBe('table');
	});
});

describe('splitTree', () => {
	const tree = buildTree({
		default_catalog: 'beacon',
		default_schema: 'public',
		catalogs: [
			{
				name: 'beacon',
				schemas: [
					{ name: 'public', tables: [{ name: 'argo', table_type: 'BASE TABLE' }] },
					{ name: 'system', tables: [{ name: 'jobs', table_type: 'VIEW' }] }
				]
			},
			{ name: 'remote', schemas: [{ name: 'public', tables: [{ name: 'r', table_type: 'BASE TABLE' }] }] }
		]
	});

	it('puts the default schema apart from the rest', () => {
		const { defaultTables, others } = splitTree(tree);
		expect(defaultTables.map((t) => t.name)).toEqual(['argo']);
		expect(others.catalogs.map((c) => c.name)).toEqual(['beacon', 'remote']);
		expect(others.catalogs[0].schemas.map((s) => s.name)).toEqual(['system']);
	});

	it('drops a catalog that only held the default schema', () => {
		const only = buildTree({
			default_catalog: 'beacon',
			default_schema: 'public',
			catalogs: [{ name: 'beacon', schemas: [{ name: 'public', tables: [] }] }]
		});
		expect(splitTree(only).others.catalogs).toEqual([]);
	});
});

describe('tableDetailQuery', () => {
	it('leaves out catalog and schema in the default schema', () => {
		expect(tableDetailQuery(argo, defaults, 'https://a.org')).toBe(
			'table_name=argo&node=https%3A%2F%2Fa.org'
		);
	});

	it('adds catalog and schema elsewhere', () => {
		expect(tableDetailQuery(jobs, defaults, 'https://a.org')).toBe(
			'table_name=jobs&node=https%3A%2F%2Fa.org&catalog=beacon&schema=system'
		);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with a missing-module error for `../tables`.

- [ ] **Step 3: Write `tables.ts`**

Create `src/lib/data-browser/tables.ts`:

```ts
import type { CatalogTable } from '@maris-development/beacon-client';
import type { CatalogTree } from '@/sql/catalog';
import { quoteIdent, sqlName, type CatalogDefaults, type TableRef } from '@/sql/identifiers';

export const DETAIL_PREVIEW_ROWS = 100;

export type TableKind = 'table' | 'view';

export function tableKind(tableType: string): TableKind {
	if (tableType.toUpperCase().includes('VIEW')) return 'view';
	return 'table';
}

export function isDefaultSchema(
	ref: { catalog: string; schema: string },
	defaults: CatalogDefaults
): boolean {
	return ref.catalog === defaults.catalog && ref.schema === defaults.schema;
}

/** Refresh and drop act on the default schema only, the same rule as beacon-web. */
export function canManage(ref: TableRef, defaults: CatalogDefaults): boolean {
	return isDefaultSchema(ref, defaults);
}

export function previewSql(ref: TableRef, defaults: CatalogDefaults, limit = DETAIL_PREVIEW_ROWS): string {
	return `SELECT * FROM ${sqlName(ref, defaults)} LIMIT ${limit}`;
}

export function editorSql(ref: TableRef, defaults: CatalogDefaults): string {
	return previewSql(ref, defaults, 100);
}

export function refreshSql(ref: TableRef, defaults: CatalogDefaults): string {
	return `REFRESH ${sqlName(ref, defaults)}`;
}

export function dropSql(ref: TableRef, defaults: CatalogDefaults): string {
	return `DROP TABLE IF EXISTS ${sqlName(ref, defaults)}`;
}

/** A trailing `;` would end the statement before the view, so it goes. */
export function createViewSql(name: string, query: string, materialized: boolean): string {
	const body = query.trim().replace(/;+\s*$/, '');

	let kind = 'VIEW';
	if (materialized) kind = 'MATERIALIZED VIEW';

	return `CREATE ${kind} ${quoteIdent(name)} AS ${body}`;
}

/** The tables of the default schema, and a tree of every other schema. */
export function splitTree(tree: CatalogTree): { defaultTables: CatalogTable[]; others: CatalogTree } {
	let defaultTables: CatalogTable[] = [];

	const catalogs = tree.catalogs
		.map((catalog) => ({
			name: catalog.name,
			schemas: catalog.schemas.filter((schema) => {
				if (isDefaultSchema({ catalog: catalog.name, schema: schema.name }, tree.defaults)) {
					defaultTables = schema.tables;
					return false;
				}
				return true;
			})
		}))
		.filter((catalog) => catalog.schemas.length > 0);

	return { defaultTables, others: { catalogs, defaults: tree.defaults } };
}

/** The query string of a table detail URL. Catalog and schema only outside the default schema. */
export function tableDetailQuery(ref: TableRef, defaults: CatalogDefaults, nodeUrl: string): string {
	const params = new URLSearchParams({ table_name: ref.name, node: nodeUrl });

	if (!isDefaultSchema(ref, defaults)) {
		params.set('catalog', ref.catalog);
		params.set('schema', ref.schema);
	}

	return params.toString();
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 3: Folder tree and external-table body

**Files:**
- Create: `src/lib/data-browser/folders.ts`
- Create: `src/lib/data-browser/external-table.ts`
- Test: `src/lib/data-browser/tests/folders.test.ts`
- Test: `src/lib/data-browser/tests/external-table.test.ts`

**Interfaces:**
- Produces (`folders.ts`, step 4 extends it with file rows):
  - `normalizeFolder(folder: string): string` (trimmed, no leading `/`, no double `/`, a trailing `/`; empty for the root)
  - `allFolders(paths: string[]): string[]` (every folder that holds a file, at any depth, sorted, each with a trailing `/`)
- Produces (`external-table.ts`):
  - `interface FileTypeInfo { value: string; label: string; hint: string }`
  - `FILE_TYPES: FileTypeInfo[]` (14 entries)
  - `interface ExternalTableForm { name: string; location: string; fileType: string; partitionCols: string; options: { key: string; value: string }[]; ifNotExists: boolean }`
  - `externalTableSpec(form: ExternalTableForm): Record<string, unknown>`
  - `externalTableErrors(form: ExternalTableForm): string[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/folders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allFolders, normalizeFolder } from '../folders';

describe('normalizeFolder', () => {
	it('gives the root as an empty string', () => {
		expect(normalizeFolder('')).toBe('');
		expect(normalizeFolder(' / ')).toBe('');
	});

	it('trims, removes the leading slash and repeats, and ends with a slash', () => {
		expect(normalizeFolder(' /argo//2024 ')).toBe('argo/2024/');
		expect(normalizeFolder('argo/')).toBe('argo/');
	});
});

describe('allFolders', () => {
	it('lists every folder at every depth, once, sorted', () => {
		const paths = ['argo/2024/a.nc', 'argo/2024/b.nc', 'argo/2023/c.nc', 'top.parquet', 'wod/x/y/z.csv'];
		expect(allFolders(paths)).toEqual([
			'argo/',
			'argo/2023/',
			'argo/2024/',
			'wod/',
			'wod/x/',
			'wod/x/y/'
		]);
	});

	it('gives no folders for files in the root only', () => {
		expect(allFolders(['a.nc'])).toEqual([]);
	});
});
```

Create `src/lib/data-browser/tests/external-table.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FILE_TYPES, externalTableErrors, externalTableSpec, type ExternalTableForm } from '../external-table';

const form: ExternalTableForm = {
	name: 'argo',
	location: 'argo/**/*.nc',
	fileType: 'NC',
	partitionCols: '',
	options: [],
	ifNotExists: false
};

describe('externalTableSpec', () => {
	it('leaves out empty partition columns and options', () => {
		expect(externalTableSpec(form)).toEqual({
			name: 'argo',
			location: 'argo/**/*.nc',
			file_type: 'NC',
			if_not_exists: false
		});
	});

	it('adds partition columns and options when given, and drops empty option rows', () => {
		const spec = externalTableSpec({
			...form,
			partitionCols: ' year, month ,',
			options: [
				{ key: 'delimiter', value: ';' },
				{ key: ' ', value: 'x' }
			],
			ifNotExists: true
		});
		expect(spec).toEqual({
			name: 'argo',
			location: 'argo/**/*.nc',
			file_type: 'NC',
			if_not_exists: true,
			partition_cols: ['year', 'month'],
			options: { delimiter: ';' }
		});
	});

	it('trims the name and location', () => {
		expect(externalTableSpec({ ...form, name: ' argo ', location: ' a/*.nc ' })).toMatchObject({
			name: 'argo',
			location: 'a/*.nc'
		});
	});
});

describe('externalTableErrors', () => {
	it('asks for a name, a location and a file type', () => {
		expect(externalTableErrors({ ...form, name: ' ', location: '', fileType: '' })).toEqual([
			'Enter a table name.',
			'Enter a location.',
			'Pick a file type.'
		]);
	});

	it('accepts a complete form', () => {
		expect(externalTableErrors(form)).toEqual([]);
	});
});

describe('FILE_TYPES', () => {
	it('holds the 14 server types', () => {
		expect(FILE_TYPES.map((t) => t.value)).toEqual([
			'PARQUET', 'GEOPARQUET', 'CSV', 'ARROW', 'NC', 'HDF5', 'ZARR',
			'ATLAS', 'TIFF', 'BBF', 'ODV', 'DELTA', 'ICEBERG', 'REMOTE'
		]);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with missing-module errors for `../folders` and `../external-table`.

- [ ] **Step 3: Write `folders.ts`**

Create `src/lib/data-browser/folders.ts`:

```ts
/** A folder as the datasets store names it: no leading `/`, a trailing `/`, empty for the root. */
export function normalizeFolder(folder: string): string {
	const cleaned = folder.trim().replace(/\/{2,}/g, '/').replace(/^\/+/, '');
	if (cleaned === '' || cleaned === '/') return '';
	if (cleaned.endsWith('/')) return cleaned;

	return `${cleaned}/`;
}

/** Every folder that holds a file, at any depth. */
export function allFolders(paths: string[]): string[] {
	const folders = new Set<string>();

	for (const path of paths) {
		const parts = path.split('/').slice(0, -1);
		let folder = '';

		for (const part of parts) {
			if (part === '') continue;
			folder += `${part}/`;
			folders.add(folder);
		}
	}

	return [...folders].sort();
}
```

- [ ] **Step 4: Write `external-table.ts`**

Create `src/lib/data-browser/external-table.ts`. The hints come from `beacon-web` (`components/external-table-dialog.tsx:50-65`); keep them short.

```ts
export interface FileTypeInfo {
	value: string;
	label: string;
	hint: string;
}

export const FILE_TYPES: FileTypeInfo[] = [
	{ value: 'PARQUET', label: 'Parquet', hint: 'A path or glob, for example data/**/*.parquet.' },
	{ value: 'GEOPARQUET', label: 'GeoParquet', hint: 'Parquet with a geometry column.' },
	{ value: 'CSV', label: 'CSV', hint: 'Options can set the delimiter and the header.' },
	{ value: 'ARROW', label: 'Arrow IPC', hint: 'Arrow IPC files (.arrow).' },
	{ value: 'NC', label: 'NetCDF', hint: 'NetCDF files, for example argo/**/*.nc.' },
	{ value: 'HDF5', label: 'HDF5', hint: 'HDF5 files.' },
	{ value: 'ZARR', label: 'Zarr', hint: 'The path of a Zarr store.' },
	{ value: 'ATLAS', label: 'Atlas', hint: 'A Beacon Atlas collection.' },
	{ value: 'TIFF', label: 'GeoTIFF', hint: 'TIFF or GeoTIFF rasters.' },
	{ value: 'BBF', label: 'Beacon Binary Format', hint: 'Beacon Binary Format files (.bbf).' },
	{ value: 'ODV', label: 'ODV', hint: 'Ocean Data View spreadsheet files.' },
	{ value: 'DELTA', label: 'Delta Lake', hint: 'The folder of a Delta table, or a URL with a scheme.' },
	{ value: 'ICEBERG', label: 'Iceberg', hint: 'The folder of an Iceberg table, or a URL with a scheme.' },
	{ value: 'REMOTE', label: 'Remote', hint: 'A location with a scheme, for example s3://bucket/path.' }
];

export interface ExternalTableForm {
	name: string;
	location: string;
	fileType: string;
	/** Comma separated. */
	partitionCols: string;
	options: { key: string; value: string }[];
	ifNotExists: boolean;
}

/** The body of `POST /api/admin/external-tables`. Empty lists stay out. */
export function externalTableSpec(form: ExternalTableForm): Record<string, unknown> {
	const spec: Record<string, unknown> = {
		name: form.name.trim(),
		location: form.location.trim(),
		file_type: form.fileType,
		if_not_exists: form.ifNotExists
	};

	const partitionCols = form.partitionCols
		.split(',')
		.map((column) => column.trim())
		.filter((column) => column !== '');
	if (partitionCols.length > 0) spec.partition_cols = partitionCols;

	const options: Record<string, string> = {};
	for (const option of form.options) {
		if (option.key.trim() !== '') options[option.key.trim()] = option.value;
	}
	if (Object.keys(options).length > 0) spec.options = options;

	return spec;
}

export function externalTableErrors(form: ExternalTableForm): string[] {
	const errors: string[] = [];

	if (form.name.trim() === '') errors.push('Enter a table name.');
	if (form.location.trim() === '') errors.push('Enter a location.');
	if (form.fileType === '') errors.push('Pick a file type.');

	return errors;
}
```

Before you finish this step, open `d:\repositories\beacon\beacon-clients\beacon-web\src\components\external-table-dialog.tsx:50-65` and copy any hint there that says more than the one above (for example the CSV options). Keep each hint to one sentence.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 6: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 4: SQL editor opens `?sql=`

**Files:**
- Modify: `src/lib/sql/tabs.ts` (append)
- Modify: `src/lib/sql/tests/tabs.test.ts` (append)
- Modify: `src/routes/sql-editor/+page.svelte` (script: imports, and one `onMount`)

**Interfaces:**
- Produces: `openInNewTab(state: TabsState, sql: string): TabsState` in `@/sql/tabs`.
- Produces: `/sql-editor?sql=<encoded SQL>` opens the SQL in a new tab, runs nothing, and removes `sql` from the URL.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/sql/tests/tabs.test.ts` (add `openInNewTab` to the import from `'../tabs'`):

```ts
describe('openInNewTab', () => {
	it('adds a selected tab that holds the SQL', () => {
		const state = emptyTabs();
		const next = openInNewTab(state, 'SELECT 1');
		expect(next.tabs).toHaveLength(2);
		expect(next.tabs[1].sql).toBe('SELECT 1');
		expect(next.activeId).toBe(next.tabs[1].id);
	});

	it('opens a second tab for the same SQL', () => {
		const once = openInNewTab(emptyTabs(), 'SELECT 1');
		expect(openInNewTab(once, 'SELECT 1').tabs).toHaveLength(3);
	});
});
```

The rule stays simple: a new tab every time, also when the only tab is empty.

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- src/lib/sql/tests/tabs.test.ts`
Expected: FAIL. `openInNewTab` is not exported.

- [ ] **Step 3: Write `openInNewTab`**

Append to `src/lib/sql/tabs.ts`:

```ts
/** A new selected tab that holds `sql`. Another page opens SQL in the editor this way. */
export function openInNewTab(state: TabsState, sql: string): TabsState {
	const added = addTab(state);
	return setTabSql(added, added.activeId, sql);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm test -- src/lib/sql/tests/tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Read `?sql=` in the page**

In `src/routes/sql-editor/+page.svelte`:

Add `onMount` to the `svelte` import, and add:

```ts
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
```

Add `openInNewTab` to the import from `'@/sql/tabs'`.

After the line `let tabs: TabsState = $state(loadTabs());`, add:

```ts
	// Another page hands SQL over in `?sql=`. It opens in a new tab and leaves the URL.
	onMount(() => {
		const handed = page.url.searchParams.get('sql');
		if (handed === null || handed.trim() === '') return;

		tabs = openInNewTab(tabs, handed);

		const url = new URL(page.url);
		url.searchParams.delete('sql');
		replaceState(url, {});
	});
```

- [ ] **Step 6: Check**

Run: `npm run check`, `npx eslint src/routes/sql-editor src/lib/sql`
Expected: no errors.

---

### Task 5: Shared components

**Files:**
- Create: `src/lib/components/data-browser/BackLink.svelte`
- Create: `src/lib/components/data-browser/SchemaTable.svelte`
- Create: `src/lib/components/data-browser/PreviewGrid.svelte`
- Create: `src/lib/components/data-browser/FolderPicker.svelte`
- Create: `src/lib/components/data-browser/DetailTabs.svelte`

**Interfaces:**
- Consumes: `backTarget` (Task 1). `allFolders` (Task 3). `parseSchema`, `COLUMN_PAGE_SIZE`, `SchemaColumn` (`@/sql/catalog`). `runPreview`, `BatchSource`, `PreviewResult` (`@/sql/run`). `ResultGrid` (`@/components/sql-editor/ResultGrid.svelte`). `sqlErrorMessage` (`@/sql/statement`).
- Produces:
  - `BackLink` props `{ label: string; fallback: string }`. Reads `back` from the page URL.
  - `SchemaTable` props `{ load: () => Promise<unknown> }`. Calls `load()` on mount, parses the result with `parseSchema`, and shows name, type and nullable.
  - `PreviewGrid` props `{ source: BatchSource; sql: string }`. Runs once on mount, with an abort on destroy.
  - `FolderPicker` props `{ loadPaths: () => Promise<string[]>; onPick: (folder: string) => void }`.
  - `DetailTabs` props `{ tabs: { id: string; label: string }[]; active: string; onSelect: (id: string) => void }`.

No unit tests: the rules are in the tested domain files. Task 9 tests these by hand.

Note: `parseSchema` drops `nullable`. `SchemaTable` reads `nullable` from the raw fields itself, so `parseSchema` stays unchanged.

- [ ] **Step 1: Create `BackLink.svelte`**

```svelte
<!-- "← Tables": back to the list the user came from, or to the plain list. -->
<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { backTarget } from '@/data-browser/back';

	let { label, fallback }: { label: string; fallback: string } = $props();

	let href = $derived(backTarget(page.url.searchParams.get('back'), base, fallback));
</script>

<a class="back-link" {href}>
	<ArrowLeftIcon class="size-4" />
	{label}
</a>

<style lang="scss">
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		color: var(--muted-foreground);
		text-decoration: none;

		&:hover {
			color: var(--foreground);
			text-decoration: underline;
		}
	}
</style>
```

Note: `base` from `$app/paths` is deprecated in newer SvelteKit versions in favour of `resolve`. If `npm run check` reports it as deprecated, keep it: `backTarget` needs the raw base prefix, and `resolve('/')` gives `base + '/'`. Then compute `const prefix = resolve('/').replace(/\/$/, '')` instead and pass that.

- [ ] **Step 2: Create `SchemaTable.svelte`**

```svelte
<!-- Columns of a table or a file: name, type, nullable. A filter, and 500 at a time. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Input } from '@/components/ui/input';
	import { COLUMN_PAGE_SIZE, stringifyType } from '@/sql/catalog';
	import { sqlErrorMessage } from '@/sql/statement';

	type Row = { name: string; dataType: string; nullable: string };

	let { load }: { load: () => Promise<unknown> } = $props();

	let rows: Row[] = $state([]);
	let loading = $state(true);
	let error = $state('');
	let needle = $state('');
	let shown = $state(COLUMN_PAGE_SIZE);

	// The raw Arrow fields also hold `nullable`, which `parseSchema` leaves out.
	function toRows(schema: unknown): Row[] {
		const fields = (schema as { fields?: unknown })?.fields;
		if (!Array.isArray(fields)) return [];

		return fields
			.filter((field) => field && typeof field.name === 'string')
			.map((field) => {
				let nullable = '';
				if (field.nullable === true) nullable = 'yes';
				if (field.nullable === false) nullable = 'no';

				return { name: field.name, dataType: stringifyType(field.data_type ?? field.type), nullable };
			});
	}

	onMount(async () => {
		try {
			rows = toRows(await load());
		} catch (caught) {
			error = sqlErrorMessage(caught);
		} finally {
			loading = false;
		}
	});

	let matches = $derived.by(() => {
		const query = needle.trim().toLowerCase();
		if (!query) return rows;
		return rows.filter((row) => row.name.toLowerCase().includes(query));
	});
</script>

{#if loading}
	<p class="muted">Loading the columns...</p>
{:else if error}
	<p class="error">{error}</p>
{:else}
	<div class="head">
		<Input type="search" placeholder="Filter columns" bind:value={needle} />
		<span class="muted">{matches.length} of {rows.length} columns</span>
	</div>

	<table class="schema">
		<thead>
			<tr><th>Column</th><th>Type</th><th>Nullable</th></tr>
		</thead>
		<tbody>
			{#each matches.slice(0, shown) as row (row.name)}
				<tr>
					<td>{row.name}</td>
					<td class="type">{row.dataType}</td>
					<td>{row.nullable}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if matches.length > shown}
		<button type="button" class="more" onclick={() => (shown += COLUMN_PAGE_SIZE)}>
			Show more ({matches.length - shown} left)
		</button>
	{/if}
{/if}

<style lang="scss">
	.head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.schema {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;

		th,
		td {
			padding: 0.375rem 0.5rem;
			border-bottom: 1px solid var(--border);
			text-align: left;
		}
	}

	.type {
		font-family: monospace;
		font-size: 0.8125rem;
	}

	.more {
		margin-top: 0.5rem;
		border: 0;
		background: none;
		color: var(--muted-foreground);
		text-decoration: underline;
		cursor: pointer;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

- [ ] **Step 3: Create `PreviewGrid.svelte`**

```svelte
<!-- The first rows of a table or file. It runs when it mounts, so a tab loads it on open. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import ResultGrid from '@/components/sql-editor/ResultGrid.svelte';
	import { DETAIL_PREVIEW_ROWS } from '@/data-browser/tables';
	import { runPreview, type BatchSource, type PreviewResult } from '@/sql/run';
	import { sqlErrorMessage } from '@/sql/statement';

	let { source, sql }: { source: BatchSource; sql: string } = $props();

	let result: PreviewResult | null = $state(null);
	let error = $state('');

	onMount(() => {
		const controller = new AbortController();

		runPreview(source, sql, { signal: controller.signal, limit: DETAIL_PREVIEW_ROWS }).then(
			(value) => (result = value),
			(caught) => (error = sqlErrorMessage(caught))
		);

		return () => controller.abort();
	});
</script>

{#if error}
	<p class="error">{error}</p>
{:else if !result}
	<p class="muted">Loading the first {DETAIL_PREVIEW_ROWS} rows...</p>
{:else if result.rows.length === 0}
	<p class="muted">No rows.</p>
{:else}
	<p class="muted">First {result.rows.length} rows.</p>
	<ResultGrid columns={result.columns} types={result.types} rows={result.rows} />
{/if}

<style lang="scss">
	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

- [ ] **Step 4: Create `FolderPicker.svelte`**

```svelte
<!-- Picks a dataset folder. The list loads on first open. -->
<script lang="ts">
	import FolderIcon from '@lucide/svelte/icons/folder';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { allFolders } from '@/data-browser/folders';
	import { sqlErrorMessage } from '@/sql/statement';

	let {
		loadPaths,
		onPick
	}: { loadPaths: () => Promise<string[]>; onPick: (folder: string) => void } = $props();

	let open = $state(false);
	let folders: string[] | null = $state(null);
	let error = $state('');
	let needle = $state('');

	async function toggle() {
		open = !open;
		if (!open || folders) return;

		try {
			folders = allFolders(await loadPaths());
		} catch (caught) {
			error = sqlErrorMessage(caught);
		}
	}

	let matches = $derived.by(() => {
		if (!folders) return [];
		const query = needle.trim().toLowerCase();
		if (!query) return folders;
		return folders.filter((folder) => folder.toLowerCase().includes(query));
	});

	function pick(folder: string) {
		onPick(folder);
		open = false;
	}
</script>

<div class="folder-picker">
	<Button type="button" variant="outline" size="sm" onclick={toggle}>
		<FolderIcon />
		Pick folder
	</Button>

	{#if open}
		<div class="panel">
			{#if error}
				<p class="error">{error}</p>
			{:else if !folders}
				<p class="muted">Loading the folders...</p>
			{:else if folders.length === 0}
				<p class="muted">This node has no folders.</p>
			{:else}
				<Input type="search" placeholder="Filter folders" bind:value={needle} />
				<ul>
					{#each matches as folder (folder)}
						<li><button type="button" onclick={() => pick(folder)}>{folder}</button></li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style lang="scss">
	.folder-picker {
		position: relative;
	}

	.panel {
		position: absolute;
		z-index: 10;
		top: 100%;
		left: 0;
		width: 22rem;
		max-height: 16rem;
		margin-top: 0.25rem;
		padding: 0.5rem;
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--background);
		box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
	}

	ul {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	li button {
		width: 100%;
		padding: 0.25rem;
		border: 0;
		background: none;
		text-align: left;
		cursor: pointer;
		word-break: break-all;

		&:hover {
			background: var(--accent);
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

- [ ] **Step 5: Create `DetailTabs.svelte`**

```svelte
<script lang="ts">
	type Tab = { id: string; label: string };

	let { tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect: (id: string) => void } =
		$props();
</script>

<div class="detail-tabs" role="tablist">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			aria-selected={tab.id === active}
			class:active={tab.id === active}
			onclick={() => onSelect(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style lang="scss">
	.detail-tabs {
		display: flex;
		gap: 0.25rem;
		margin: 1rem 0 0.75rem;
		border-bottom: 1px solid var(--border);

		button {
			padding: 0.5rem 0.75rem;
			border: 0;
			border-bottom: 2px solid transparent;
			background: none;
			color: var(--muted-foreground);
			cursor: pointer;

			&.active {
				border-bottom-color: var(--primary);
				color: var(--foreground);
				font-weight: 600;
			}
		}
	}
</style>
```

- [ ] **Step 6: Format and check**

Run: `npx prettier --write src/lib/components/data-browser`, `npm run check`, `npx eslint src/lib/components/data-browser`
Expected: no errors.

---

### Task 6: Create dialogs

**Files:**
- Create: `src/lib/components/data-browser/CreateViewDialog.svelte`
- Create: `src/lib/components/data-browser/CreateExternalTableDialog.svelte`
- Delete: `src/lib/components/modals/CreateTableModal.svelte`

**Interfaces:**
- Consumes: `createViewSql` (Task 2). `FILE_TYPES`, `externalTableSpec`, `externalTableErrors`, `ExternalTableForm` (Task 3). `FolderPicker` (Task 5). `withAdmin`, `adminErrorMessage` (`@/services/admin-session`). `Modal` (`@/components/modals/Modal.svelte`).
- Produces:
  - `CreateViewDialog` props `{ node: BeaconNode; materialized: boolean; onClose: () => void; onCreated: (name: string) => void }`
  - `CreateExternalTableDialog` props `{ node: BeaconNode; loadPaths: () => Promise<string[]>; onClose: () => void; onCreated: (name: string) => void }`

- [ ] **Step 1: Create `CreateViewDialog.svelte`**

```svelte
<script lang="ts">
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { createViewSql } from '@/data-browser/tables';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';

	type Props = {
		node: BeaconNode;
		materialized: boolean;
		onClose: () => void;
		onCreated: (name: string) => void;
	};

	let { node, materialized, onClose, onCreated }: Props = $props();

	let name = $state('');
	let query = $state('SELECT ');
	let busy = $state(false);
	let error = $state('');

	let title = $derived.by(() => {
		if (materialized) return 'Create materialized view';
		return 'Create view';
	});

	async function create() {
		if (name.trim() === '' || query.trim() === '') {
			error = 'Enter a name and a query.';
			return;
		}

		busy = true;
		error = '';

		try {
			const sql = createViewSql(name.trim(), query, materialized);
			const done = await withAdmin(node, (client) => client.query(sql));
			if (done !== null) onCreated(name.trim());
		} catch (caught) {
			error = adminErrorMessage(caught);
		} finally {
			busy = false;
		}
	}
</script>

<Modal {title} onClose={onClose} canCloseModal={!busy} width="640px">
	<div class="form">
		<div class="field">
			<Label for="view-name">Name</Label>
			<Input id="view-name" bind:value={name} />
		</div>

		<div class="field">
			<Label for="view-query">Query</Label>
			<textarea id="view-query" rows="8" bind:value={query} spellcheck="false"></textarea>
		</div>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
		<Button onclick={create} disabled={busy}>Create</Button>
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

	textarea {
		padding: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		font-family: monospace;
		font-size: 0.8125rem;
		resize: vertical;
	}

	.error {
		margin: 0;
		color: var(--destructive);
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
```

- [ ] **Step 2: Create `CreateExternalTableDialog.svelte`**

```svelte
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import FolderPicker from '@/components/data-browser/FolderPicker.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import {
		FILE_TYPES,
		externalTableErrors,
		externalTableSpec,
		type ExternalTableForm
	} from '@/data-browser/external-table';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';

	type Props = {
		node: BeaconNode;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onCreated: (name: string) => void;
	};

	let { node, loadPaths, onClose, onCreated }: Props = $props();

	let form: ExternalTableForm = $state({
		name: '',
		location: '',
		fileType: 'PARQUET',
		partitionCols: '',
		options: [],
		ifNotExists: false
	});
	let busy = $state(false);
	let errors: string[] = $state([]);

	let hint = $derived(FILE_TYPES.find((type) => type.value === form.fileType)?.hint ?? '');
	let requestJson = $derived(JSON.stringify(externalTableSpec(form), null, 2));

	async function create() {
		errors = externalTableErrors(form);
		if (errors.length > 0) return;

		busy = true;

		try {
			const spec = externalTableSpec(form);
			const done = await withAdmin(node, async (client) => {
				await client.admin.createExternalTable(spec);
				return true;
			});
			if (done) onCreated(form.name.trim());
		} catch (caught) {
			errors = [adminErrorMessage(caught)];
		} finally {
			busy = false;
		}
	}
</script>

<Modal title="Create external table" onClose={onClose} canCloseModal={!busy} width="640px">
	<div class="form">
		<div class="field">
			<Label for="ext-name">Name</Label>
			<Input id="ext-name" bind:value={form.name} />
		</div>

		<div class="field">
			<Label for="ext-type">File type</Label>
			<select id="ext-type" bind:value={form.fileType}>
				{#each FILE_TYPES as type (type.value)}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>
			<span class="hint">{hint}</span>
		</div>

		<div class="field">
			<Label for="ext-location">Location</Label>
			<div class="row">
				<Input id="ext-location" bind:value={form.location} placeholder="argo/**/*.nc" />
				<FolderPicker {loadPaths} onPick={(folder) => (form.location = `${folder}**/*`)} />
			</div>
			<span class="hint">A path or glob in the datasets store. A picked folder ends in **/*.</span>
		</div>

		<div class="field">
			<Label for="ext-partitions">Partition columns</Label>
			<Input id="ext-partitions" bind:value={form.partitionCols} placeholder="year, month" />
		</div>

		<div class="field">
			<Label>Options</Label>
			{#each form.options as option, index (index)}
				<div class="row">
					<Input placeholder="key" bind:value={option.key} />
					<Input placeholder="value" bind:value={option.value} />
					<button type="button" class="icon" aria-label="Remove option" onclick={() => form.options.splice(index, 1)}>
						<XIcon class="size-4" />
					</button>
				</div>
			{/each}
			<Button type="button" variant="outline" size="sm" onclick={() => form.options.push({ key: '', value: '' })}>
				<PlusIcon />
				Add option
			</Button>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={form.ifNotExists} />
			Only if it does not exist
		</label>

		<details>
			<summary>Request</summary>
			<pre>{requestJson}</pre>
		</details>

		{#each errors as message (message)}
			<p class="error" role="alert">{message}</p>
		{/each}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
		<Button onclick={create} disabled={busy}>Create</Button>
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

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--background);
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.icon {
		display: flex;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	pre {
		padding: 0.5rem;
		overflow: auto;
		border-radius: 0.375rem;
		background: var(--secondary);
		font-size: 0.75rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
```

- [ ] **Step 3: Delete the old modal**

Run: `git rm src/lib/components/modals/CreateTableModal.svelte`
Expected: the only importer is `routes/data-browser/data-tables/+page.svelte`, which Task 7 rewrites. `npm run check` fails until Task 7 is done. That is expected.

- [ ] **Step 4: Format and check the new files**

Run: `npx prettier --write src/lib/components/data-browser`, `npx eslint src/lib/components/data-browser`
Expected: no errors.

---

### Task 7: Tables list page

**Files:**
- Modify (rewrite): `src/routes/data-browser/data-tables/+page.svelte`

**Interfaces:**
- Consumes: `splitTree`, `tableKind`, `tableDetailQuery` (Task 2). `withBack` (Task 1). `buildTree`, `filterTree`, `CatalogTree` (`@/sql/catalog`). `CreateViewDialog`, `CreateExternalTableDialog` (Task 6). `NodePicker`, `AdminAction`. `makeBeaconClient` (`@/beacon-api/client`). `currentNode` (`@/services/beacon-node`).

- [ ] **Step 1: Rewrite the page**

Replace the whole file with:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import CreateViewDialog from '@/components/data-browser/CreateViewDialog.svelte';
	import CreateExternalTableDialog from '@/components/data-browser/CreateExternalTableDialog.svelte';
	import { Input } from '@/components/ui/input';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { track } from '@/telemetry';
	import { withBack } from '@/data-browser/back';
	import { splitTree, tableDetailQuery, tableKind } from '@/data-browser/tables';
	import { buildTree, filterTree, type CatalogTree } from '@/sql/catalog';
	import type { TableRef } from '@/sql/identifiers';
	import { sqlErrorMessage } from '@/sql/statement';

	type Dialog = 'view' | 'materialized' | 'external' | null;

	let tree: CatalogTree | null = $state(null);
	let defaultTable: string | null = $state(null);
	let loading = $state(false);
	let error = $state('');
	let needle = $state(page.url.searchParams.get('q') ?? '');
	let othersOpen = $state(false);
	let dialog: Dialog = $state(null);

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);

	let shown = $derived.by(() => {
		if (!tree) return null;
		return splitTree(filterTree(tree, needle));
	});

	let searching = $derived(needle.trim() !== '');

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
			const [view, fallback] = await Promise.all([
				client.catalogs(),
				client.defaultTable<unknown>().catch(() => null)
			]);

			// A node switch during the load makes this answer stale.
			if (current.url !== nodeUrl) return;

			tree = buildTree(view);
			if (typeof fallback === 'string') {
				defaultTable = fallback;
			} else {
				defaultTable = null;
			}
		} catch (caught) {
			if (current.url === nodeUrl) {
				tree = null;
				error = sqlErrorMessage(caught);
			}
		} finally {
			if (current.url === nodeUrl) loading = false;
		}
	}

	function listUrl(): string {
		const url = new URL(page.url);
		if (needle.trim() === '') {
			url.searchParams.delete('q');
		} else {
			url.searchParams.set('q', needle.trim());
		}
		return `${url.pathname}${url.search}`;
	}

	function detailHref(ref: TableRef): string {
		if (!tree || !node) return '#';

		const href = `${resolve('/data-browser/data-tables/detail')}?${tableDetailQuery(ref, tree.defaults, node.url)}`;
		return withBack(href, listUrl());
	}

	function onSearch() {
		if (searching && shown) {
			const results = shown.defaultTables.length;
			track('browser.search', { props: { scope: 'tables', term: needle.trim().slice(0, 60), results } });
		}
	}

	async function loadPaths(): Promise<string[]> {
		if (!node) return [];

		const list = await makeBeaconClient(node).datasets<{ file_path: string }[]>({ limit: 100000 });
		return list.map((entry) => entry.file_path);
	}

	function onCreated(name: string) {
		dialog = null;
		if (!tree || !node) return;

		const ref = { catalog: tree.defaults.catalog, schema: tree.defaults.schema, name };
		goto(detailHref(ref));
	}
</script>

<svelte:head>
	<title>Data Tables - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Data tables', href: resolve('/data-browser/data-tables') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Data Tables</h1>

		<p>Explore the tables of your Beacon node.</p>

		<NodePicker>
			{#snippet actions()}
				<AdminAction>
					{#snippet children({ disabled })}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger disabled={disabled || !node}>
								<Button variant="outline" disabled={disabled || !node}>Create</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="w-52">
								<DropdownMenu.Item onclick={() => (dialog = 'view')}>View</DropdownMenu.Item>
								<DropdownMenu.Item onclick={() => (dialog = 'materialized')}>Materialized view</DropdownMenu.Item>
								<DropdownMenu.Item onclick={() => (dialog = 'external')}>External table</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/snippet}
				</AdminAction>
			{/snippet}
		</NodePicker>

		{#if !node}
			<p>Pick a Beacon node.</p>
		{:else}
			<Input type="search" placeholder="Search tables" bind:value={needle} onchange={onSearch} />

			{#if loading && !tree}
				<p class="muted">Loading the tables...</p>
			{:else if error}
				<p class="error">{error}</p>
			{:else if shown}
				{#if shown.defaultTables.length === 0}
					<p class="muted">No tables match.</p>
				{:else}
					<ul class="tables">
						{#each shown.defaultTables as table (table.name)}
							{@const ref = { catalog: shown.others.defaults.catalog, schema: shown.others.defaults.schema, name: table.name }}
							<li>
								<a href={detailHref(ref)}>
									<span class="name">{table.name}</span>
									{#if tableKind(table.table_type) === 'view'}
										<span class="badge">View</span>
									{:else}
										<span class="badge">Table</span>
									{/if}
									{#if table.name === defaultTable}
										<span class="badge default">Default</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				{#if shown.others.catalogs.length > 0}
					<details class="others" open={othersOpen || searching}>
						<summary onclick={(event) => {
							event.preventDefault();
							othersOpen = !othersOpen;
						}}>
							<ChevronRightIcon class="size-4 chevron" />
							Other schemas
						</summary>

						{#each shown.others.catalogs as catalog (catalog.name)}
							{#each catalog.schemas as schema (schema.name)}
								<h3 class="schema-title">{catalog.name}.{schema.name}</h3>
								<ul class="tables">
									{#each schema.tables as table (table.name)}
										{@const ref = { catalog: catalog.name, schema: schema.name, name: table.name }}
										<li>
											<a href={detailHref(ref)}>
												<span class="name">{table.name}</span>
												{#if tableKind(table.table_type) === 'view'}
													<span class="badge">View</span>
												{:else}
													<span class="badge">Table</span>
												{/if}
											</a>
										</li>
									{/each}
								</ul>
							{/each}
						{/each}
					</details>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{#if node && (dialog === 'view' || dialog === 'materialized')}
	<CreateViewDialog
		{node}
		materialized={dialog === 'materialized'}
		onClose={() => (dialog = null)}
		{onCreated}
	/>
{/if}

{#if node && dialog === 'external'}
	<CreateExternalTableDialog {node} {loadPaths} onClose={() => (dialog = null)} {onCreated} />
{/if}

<style lang="scss">
	.tables {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;

		li a {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 0.25rem;
			border-bottom: 1px solid var(--border);
			color: inherit;
			text-decoration: none;

			&:hover {
				background: var(--accent);
			}
		}
	}

	.name {
		font-weight: 500;
		word-break: break-all;
	}

	.badge {
		padding: 0 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		color: var(--muted-foreground);
		font-size: 0.75rem;

		&.default {
			background: var(--primary);
			color: var(--primary-foreground);
		}
	}

	.others {
		margin-top: 1rem;

		summary {
			display: flex;
			align-items: center;
			gap: 0.25rem;
			cursor: pointer;
			font-weight: 600;
			list-style: none;
		}

		&[open] :global(.chevron) {
			transform: rotate(90deg);
		}
	}

	.schema-title {
		margin: 0.75rem 0 0;
		color: var(--muted-foreground);
		font-family: monospace;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

Notes for the implementer:
- `h3` keeps its global font styles. The rule above sets only margin, colour and font family on `.schema-title`. If `app.scss` already sets the `h3` font family, drop `font-family` here (AGENTS.md: do not override heading text styles).
- The search term goes in `?q=` only through `back`. The page reads `?q=` on load, so "← Tables" restores the search.

- [ ] **Step 2: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser/data-tables/+page.svelte`, `npx prettier --write src/routes/data-browser/data-tables/+page.svelte`
Expected: no errors. The file is rewritten, so a full format is fine.

---

### Task 8: Table detail page

**Files:**
- Modify (rewrite): `src/routes/data-browser/data-tables/detail/+page.svelte`

**Interfaces:**
- Consumes: `BackLink`, `SchemaTable`, `PreviewGrid`, `DetailTabs` (Task 5). `previewSql`, `editorSql`, `refreshSql`, `dropSql`, `canManage`, `tableKind` (Task 2). `findByUrl` (`@/services/beacon-node`). `withAdmin`, `adminErrorMessage` (`@/services/admin-session`). `askConfirm` (`@/stores/confirm`). `addToast` (`@/stores/toasts`). `settings` (`@/stores/settings`).

- [ ] **Step 1: Rewrite the page**

Replace the whole file with:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { error as kitError } from '@sveltejs/kit';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import BackLink from '@/components/data-browser/BackLink.svelte';
	import SchemaTable from '@/components/data-browser/SchemaTable.svelte';
	import PreviewGrid from '@/components/data-browser/PreviewGrid.svelte';
	import DetailTabs from '@/components/data-browser/DetailTabs.svelte';
	import { makeBeaconClient } from '@/beacon-api/client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { findByUrl } from '@/services/beacon-node';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { settings } from '@/stores/settings';
	import { track } from '@/telemetry';
	import { canManage, dropSql, editorSql, previewSql, refreshSql, tableKind } from '@/data-browser/tables';
	import type { CatalogDefaults, TableRef } from '@/sql/identifiers';
	import { sqlErrorMessage } from '@/sql/statement';

	const LIST = resolve('/data-browser/data-tables');

	const tableName = page.url.searchParams.get('table_name') ?? '';
	if (!tableName) throw kitError(400, 'Missing `table_name` query parameter');

	// The node URL, not its id. An id exists in one browser only, so a shared link names the node.
	const nodeUrl = page.url.searchParams.get('node') ?? '';
	if (!nodeUrl) throw kitError(400, 'Missing `node` query parameter');

	// Admin actions need a saved node: the sign-in session belongs to its id.
	const savedNode = findByUrl(nodeUrl);

	function readNode(): BeaconNode {
		if (savedNode) return savedNode;

		return { id: '', name: nodeUrl, url: nodeUrl, status: 'unknown', latencyMs: null, lastCheckedAt: null };
	}

	const client = makeBeaconClient(readNode());

	let defaults: CatalogDefaults | null = $state(null);
	let tableType = $state('');
	let loadError = $state('');
	let tab = $state('schema');
	let definition: string | null | undefined = $state(undefined);
	let definitionError = $state('');
	let busy = $state(false);

	let ref: TableRef | null = $derived.by(() => {
		if (!defaults) return null;
		return {
			catalog: page.url.searchParams.get('catalog') ?? defaults.catalog,
			schema: page.url.searchParams.get('schema') ?? defaults.schema,
			name: tableName
		};
	});

	let isView = $derived(tableKind(tableType) === 'view');
	let manageable = $derived(savedNode !== null && ref !== null && defaults !== null && canManage(ref, defaults));

	onMount(async () => {
		track('browser.table.open', { nodeHost: nodeUrl, props: { table: tableName } });

		try {
			const view = await client.catalogs();
			defaults = { catalog: view.default_catalog, schema: view.default_schema };

			const catalog = page.url.searchParams.get('catalog') ?? view.default_catalog;
			const schema = page.url.searchParams.get('schema') ?? view.default_schema;
			const found = view.catalogs
				.find((c) => c.name === catalog)
				?.schemas.find((s) => s.name === schema)
				?.tables.find((t) => t.name === tableName);

			if (found) {
				tableType = found.table_type;
			} else {
				loadError = `The node has no table "${tableName}" in ${catalog}.${schema}.`;
			}
		} catch (caught) {
			loadError = sqlErrorMessage(caught);
		}
	});

	async function loadDefinition() {
		if (!savedNode || !ref || definition !== undefined) return;

		definitionError = '';
		const current = ref;

		try {
			const result = await withAdmin(savedNode, (admin) =>
				admin.admin.tableDefinition(current.name, { catalog: current.catalog, schema: current.schema })
			);
			if (result !== null) definition = result.definition;
		} catch (caught) {
			definitionError = adminErrorMessage(caught);
		}
	}

	function selectTab(id: string) {
		tab = id;
		if (id === 'definition' && $settings.adminFeatures) void loadDefinition();
	}

	async function refresh() {
		if (!savedNode || !ref || !defaults) return;

		busy = true;
		const sql = refreshSql(ref, defaults);

		try {
			const done = await withAdmin(savedNode, (admin) => admin.query(sql));
			if (done !== null) addToast({ type: 'success', message: `Refreshed ${tableName}.` });
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	async function drop() {
		if (!savedNode || !ref || !defaults) return;

		const sure = await askConfirm({
			title: `Drop ${tableName}`,
			message: `Drop the table "${tableName}" from ${savedNode.name}?`,
			note: 'The files stay in place.',
			confirmLabel: 'Drop',
			destructive: true
		});
		if (!sure) return;

		busy = true;
		const sql = dropSql(ref, defaults);

		try {
			const done = await withAdmin(savedNode, (admin) => admin.query(sql));
			if (done !== null) {
				addToast({ type: 'success', message: `Dropped ${tableName}.` });
				goto(LIST);
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	function openInEditor() {
		if (!ref || !defaults) return;
		goto(`${resolve('/sql-editor')}?sql=${encodeURIComponent(editorSql(ref, defaults))}`);
	}

	async function copyDefinition() {
		if (!definition) return;
		await navigator.clipboard.writeText(definition);
		addToast({ type: 'success', message: 'Copied the definition.' });
	}
</script>

<svelte:head>
	<title>Table {tableName} - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Data tables', href: LIST },
		{ label: `Table ${tableName}`, href: '' }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<BackLink label="Tables" fallback={LIST} />

		<header class="head">
			<div>
				<h1>{tableName}</h1>
				<p class="meta">
					{#if ref}{ref.catalog}.{ref.schema}{/if}
					{#if tableType}<span class="badge">{isView ? 'View' : 'Table'}</span>{/if}
					<span class="node">· {savedNode?.name ?? nodeUrl}</span>
				</p>
			</div>

			<div class="actions">
				<Button variant="outline" onclick={openInEditor} disabled={!ref}>
					<SquareTerminalIcon />
					Open in SQL Editor
				</Button>

				{#if manageable}
					{#if !isView}
						<AdminAction>
							{#snippet children({ disabled })}
								<Button variant="outline" disabled={disabled || busy} onclick={refresh}>Refresh</Button>
							{/snippet}
						</AdminAction>
					{/if}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="destructive" disabled={disabled || busy} onclick={drop}>Drop</Button>
						{/snippet}
					</AdminAction>
				{/if}
			</div>
		</header>

		{#if loadError}
			<p class="error">{loadError}</p>
		{:else if ref}
			<DetailTabs
				tabs={[
					{ id: 'schema', label: 'Schema' },
					{ id: 'preview', label: 'Preview' },
					{ id: 'definition', label: 'Definition' }
				]}
				active={tab}
				onSelect={selectTab}
			/>

			{#if tab === 'schema'}
				<SchemaTable load={() => client.tableSchema(tableName, { catalog: ref.catalog, schema: ref.schema })} />
			{:else if tab === 'preview'}
				<PreviewGrid source={client} sql={previewSql(ref, defaults!)} />
			{:else if !$settings.adminFeatures}
				<p class="muted">The definition needs admin features. Turn on "Show admin features" in Settings.</p>
			{:else if !savedNode}
				<p class="muted">Add this node on the Beacon Nodes page to see the definition.</p>
			{:else if definitionError}
				<p class="error">{definitionError}</p>
			{:else if definition === undefined}
				<p class="muted">Loading the definition...</p>
			{:else if definition === null}
				<p class="muted">Beacon stores no definition for this table. A crawler made it, or it is an older table.</p>
			{:else}
				<div class="definition">
					<Button variant="outline" size="sm" onclick={copyDefinition}>
						<CopyIcon />
						Copy
					</Button>
					<pre>{definition}</pre>
				</div>
			{/if}
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-family: monospace;
	}

	.badge {
		padding: 0 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		font-family: inherit;
		font-size: 0.75rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.definition {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;

		pre {
			width: 100%;
			padding: 0.75rem;
			overflow: auto;
			border-radius: 0.375rem;
			background: var(--secondary);
			white-space: pre-wrap;
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
```

Notes for the implementer:
- `{isView ? 'View' : 'Table'}` is a markup expression, so `?:` is fine there.
- The definition loads when the Definition tab opens. If the user turns on admin features while the tab is open, nothing loads until the tab is chosen again. That is fine.
- `withAdmin` passes an admin client; the callback names it `admin`, so `admin.admin.tableDefinition` reads oddly but is correct (client, then its admin namespace).

- [ ] **Step 2: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser/data-tables`, `npx prettier --write src/routes/data-browser/data-tables/detail/+page.svelte`
Expected: no errors.

---

### Task 9: Docs, checks and manual test

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/admin-mode-roadmap.md`

- [ ] **Step 1: Update AGENTS.md**

In section "High-Level Architecture", under "Domain modules", add:

```markdown
  - `src/lib/data-browser/*` (data-browser rules: `backTarget` for the safe "← back" link, folder tree, table statements, external-table body. Shared parts in `components/data-browser/`.)
```

In section "Layer Rule (Important)", change the chain to:

```markdown
`beacon-api` → `query` / `geo` / `sql` / `data-browser` → `stores` → `components` → `routes`
```

- [ ] **Step 2: Run every check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/components/data-browser src/routes/data-browser src/routes/sql-editor src/lib/sql`
Expected: all tests pass; no errors.

- [ ] **Step 3: Manual test**

Run `npm run dev`. Use a node where you know the admin credentials.

1. `/data-browser/data-tables`: the default schema shows as a flat list with Table/View badges and "Default". "Other schemas" is folded.
2. Type a search term that matches a system table. "Other schemas" opens and shows it.
3. Open a table. "← Tables" is at the top. Go back: the search term is still there.
4. Schema tab: columns with types. Preview tab: up to 100 rows. Switch tabs back and forth: the preview loads again, and no error shows.
5. A table in another schema: no Refresh or Drop. The preview works.
6. "Open in SQL Editor": the SQL editor opens a new tab with `SELECT * FROM … LIMIT 100`, runs nothing, and the URL has no `sql`. Do it twice: two tabs.
7. Settings off: Create, Refresh and Drop are greyed out with the hint. The Definition tab shows the admin hint.
8. Settings on: Definition asks for a sign-in, then shows the statement or the "no definition" text. Copy works.
9. Create > View with `SELECT 1 AS a`: the detail page of the new view opens. Drop it: confirm, then back to the list with a toast.
10. Create > External table: pick a folder, choose a type, check the Request JSON, create. The detail page opens. Refresh it. Drop it.
11. Open a detail link with `&back=https://example.com`: "← Tables" goes to the plain list.
12. Open a detail link for a node URL that is not in your node list: schema and preview load; no Refresh or Drop; Definition says to add the node.

- [ ] **Step 4: Update the roadmap**

In `docs/superpowers/admin-mode-roadmap.md`, set row 3: plan link `[plan](plans/2026-10-06-data-browser-tables.md)`, and the build status with the date and the test results. Report each failed manual step to the user with what you saw.
