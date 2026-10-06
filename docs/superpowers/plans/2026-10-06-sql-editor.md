# SQL Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/sql-editor` page where a power user writes SQL, runs it on the global Beacon node, and sees a 500-row preview, a plan, or a download.

**Architecture:** Plain TypeScript modules in a new domain folder `src/lib/sql/` hold every rule (tabs, statement, names, catalogue, completion, preview, admin fallback, download names). They have unit tests. Svelte components in `src/lib/components/sql-editor/` render them. The route page connects the parts and owns the action state. Admin retries go through `withAdmin` from step 1, passed into `withAdminFallback`, so the domain imports no service.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `monaco-editor` 0.52, `@maris-development/beacon-client` 2.0.0, `apache-arrow` (tests only), Vitest 3 with jsdom.

**Spec:** `docs/superpowers/specs/2026-10-06-sql-editor-design.md`
**Roadmap:** `docs/superpowers/admin-mode-roadmap.md` (update the status row of sub-project 2 when done)

## Global Constraints

- Do not run `git commit` unless the user writes "commit" as an instruction. Never create a branch.
- Formatting: Prettier with tabs. Run `npx prettier --write <file>` on each new file. Do not reformat old files that you change only a little.
- Styles: SCSS only (`<style lang="scss">`). No new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100. No `-ing` verbs, no em-dashes.
- Prefer `if`/`else` over `?:` in script code. `??` and `?.` are fine. Markup expressions are exempt.
- Layer rule: `src/lib/sql/*` imports only `@maris-development/beacon-client` types and values, and other `src/lib/sql/*` files. No Svelte, no DOM, no `services`, no `stores`, no `components`.
- New files in `src/lib/sql/` use kebab-case names.
- Route: `/sql-editor`. Menu: "SQL Editor" in "Data Access", after "Queries". Always visible.
- Preview limit: 500 rows (`PREVIEW_ROW_LIMIT`). `queryCellLimit()` does not apply.
- Tabs key: `beacon-studio.sql-tabs`. UI state: read with defaults, no migration.
- Column page in the catalogue: 500 (`COLUMN_PAGE_SIZE`). Column completion cap: 5,000 (`MAX_COLUMN_ENTRIES`).
- Super-user refusal: status 400 and body text `requires super-user privileges`. SQL off: status 400 and body text `SQL queries are not enabled`.
- Texts: `First 500 rows. Download for the full result.` / `The statement ran. It returned no rows.` / `SQL is turned off on this Beacon node.` / `Pick a Beacon node.` / `Cancelled.` / admin hint `Turn on "Show admin features" in Settings`.
- No new telemetry events.

## Review Focus

- A Stop while the first batch has not arrived: the result area shows "Stopped." and no error. Test in Task 6.
- A Run that replaces a running Run on the same tab: the old result never overwrites the new one. Manual check in Task 11; the ownership rule sits in the page.
- A node change while the catalogue of the old node still loads: the old tree must not replace the tree of the new node. Manual check in Task 11; the page drops a stale answer.
- A table with more than 500 columns: the tree shows 500 and a "Show more" button. Test of the cap in Task 5; manual check in Task 11.
- Stored tabs with bad JSON, no tabs, or an `activeId` that names no tab: the page opens with a usable tab. Test in Task 3.

---

### Task 1: Shared Monaco environment

**Files:**
- Create: `src/lib/monaco/environment.ts`
- Modify: `src/lib/components/query-editor/QueryTextEditor.svelte:5-28`

**Interfaces:**
- Produces: a side-effect module. `import '@/monaco/environment';` sets `self.MonacoEnvironment` one time.

No unit test: the module only sets a browser global with Vite worker imports.

- [ ] **Step 1: Create the module**

Create `src/lib/monaco/environment.ts`:

```ts
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

// Monaco reads one global environment. Every editor imports this module instead of a copy.
self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string) {
		if (label === 'json') {
			return new jsonWorker();
		}

		return new editorWorker();
	}
};
```

- [ ] **Step 2: Use it in the JSON editor**

In `src/lib/components/query-editor/QueryTextEditor.svelte`, delete lines 6-28: the two worker imports, the three commented worker imports, and the whole `self.MonacoEnvironment = { ... };` block. Add after `import * as monaco from 'monaco-editor';`:

```ts
	import '@/monaco/environment';
```

- [ ] **Step 3: Check types**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 4: Smoke test the JSON editor**

Run: `npm run dev`. Open `/queries/query-editor`.
Expected: the editor shows JSON with colours, and a syntax error gets a red mark. That proves the JSON worker still loads.

---

### Task 2: Statement rules and SQL names

**Files:**
- Create: `src/lib/sql/statement.ts`
- Create: `src/lib/sql/identifiers.ts`
- Test: `src/lib/sql/statement.test.ts`
- Test: `src/lib/sql/identifiers.test.ts`

**Interfaces:**
- Produces (`statement.ts`):
  - `sqlToRun(text: string, selected: string): string`
  - `isSuperUserRefusal(error: unknown): boolean`
  - `isSqlDisabled(error: unknown): boolean`
  - `sqlErrorMessage(error: unknown): string`
- Produces (`identifiers.ts`):
  - `type TableRef = { catalog: string; schema: string; name: string }`
  - `type CatalogDefaults = { catalog: string; schema: string }`
  - `quoteIdent(name: string): string`
  - `sqlName(ref: TableRef, defaults: CatalogDefaults): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sql/statement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { isSqlDisabled, isSuperUserRefusal, sqlErrorMessage, sqlToRun } from './statement';

const refusal = new ApiError(
	400,
	'operation not permitted: this statement requires super-user privileges',
	'u'
);
const disabled = new ApiError(400, 'SQL queries are not enabled', 'u');

describe('sqlToRun', () => {
	it('runs the selection when there is one', () => {
		expect(sqlToRun('SELECT 1;\nSELECT 2;', ' SELECT 2; ')).toBe('SELECT 2;');
	});

	it('runs the full text with no selection', () => {
		expect(sqlToRun('  SELECT 1  ', '')).toBe('SELECT 1');
	});

	it('runs the full text when the selection is only spaces', () => {
		expect(sqlToRun('SELECT 1', '   ')).toBe('SELECT 1');
	});

	it('gives an empty string for an empty tab', () => {
		expect(sqlToRun(' \n ', '')).toBe('');
	});
});

describe('error matchers', () => {
	it('finds the super-user refusal', () => {
		expect(isSuperUserRefusal(refusal)).toBe(true);
		expect(isSqlDisabled(refusal)).toBe(false);
	});

	it('finds SQL turned off', () => {
		expect(isSqlDisabled(disabled)).toBe(true);
		expect(isSuperUserRefusal(disabled)).toBe(false);
	});

	it('ignores a 400 with other text', () => {
		const other = new ApiError(400, 'column "x" not found', 'u');
		expect(isSuperUserRefusal(other)).toBe(false);
		expect(isSqlDisabled(other)).toBe(false);
	});

	it('ignores the text on another status', () => {
		const forbidden = new ApiError(403, 'requires super-user privileges', 'u');
		expect(isSuperUserRefusal(forbidden)).toBe(false);
	});

	it('ignores a plain error', () => {
		expect(isSuperUserRefusal(new Error('requires super-user privileges'))).toBe(false);
	});
});

describe('sqlErrorMessage', () => {
	it('shows the server text', () => {
		expect(sqlErrorMessage(new ApiError(400, 'column "x" not found', 'u'))).toBe(
			'column "x" not found'
		);
	});

	it('names the status when the body is empty', () => {
		expect(sqlErrorMessage(new ApiError(502, '', 'u'))).toBe(
			'The Beacon node answered with status 502.'
		);
	});

	it('names a connection failure', () => {
		expect(sqlErrorMessage(new ConnectionError('u', null))).toBe(
			'The Beacon node cannot be reached.'
		);
	});

	it('shows any other error message', () => {
		expect(sqlErrorMessage(new Error('boom'))).toBe('boom');
		expect(sqlErrorMessage('text')).toBe('text');
	});
});
```

Create `src/lib/sql/identifiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { quoteIdent, sqlName } from './identifiers';

const defaults = { catalog: 'beacon', schema: 'public' };

describe('quoteIdent', () => {
	it('keeps a plain lower-case name bare', () => {
		expect(quoteIdent('sea_temp_2')).toBe('sea_temp_2');
	});

	it('quotes capitals, spaces and a leading digit', () => {
		expect(quoteIdent('Temp')).toBe('"Temp"');
		expect(quoteIdent('sea temp')).toBe('"sea temp"');
		expect(quoteIdent('2d')).toBe('"2d"');
	});

	it('doubles a quote inside the name', () => {
		expect(quoteIdent('a"b')).toBe('"a""b"');
	});
});

describe('sqlName', () => {
	it('gives a bare name in the default schema', () => {
		expect(sqlName({ catalog: 'beacon', schema: 'public', name: 'argo' }, defaults)).toBe('argo');
	});

	it('qualifies a name in another schema', () => {
		expect(sqlName({ catalog: 'beacon', schema: 'system', name: 'jobs' }, defaults)).toBe(
			'beacon.system.jobs'
		);
	});

	it('quotes each part when needed', () => {
		expect(sqlName({ catalog: 'Remote', schema: 'public', name: 'My Table' }, defaults)).toBe(
			'"Remote".public."My Table"'
		);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/sql`
Expected: FAIL with missing-module errors for `./statement` and `./identifiers`.

- [ ] **Step 3: Write `statement.ts`**

Create `src/lib/sql/statement.ts`:

```ts
import { ApiError, ConnectionError } from '@maris-development/beacon-client';

const SUPER_USER_TEXT = 'requires super-user privileges';
const SQL_DISABLED_TEXT = 'SQL queries are not enabled';

/** The selection when it holds text, otherwise the full tab text. */
export function sqlToRun(text: string, selected: string): string {
	if (selected.trim() !== '') return selected.trim();

	return text.trim();
}

// The server sends both refusals as a 400 with a fixed text.
function isBadRequestWith(error: unknown, text: string): boolean {
	return error instanceof ApiError && error.status === 400 && error.body.includes(text);
}

export function isSuperUserRefusal(error: unknown): boolean {
	return isBadRequestWith(error, SUPER_USER_TEXT);
}

export function isSqlDisabled(error: unknown): boolean {
	return isBadRequestWith(error, SQL_DISABLED_TEXT);
}

export function sqlErrorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		return error.body || `The Beacon node answered with status ${error.status}.`;
	}

	if (error instanceof ConnectionError) return 'The Beacon node cannot be reached.';
	if (error instanceof Error) return error.message;

	return String(error);
}
```

- [ ] **Step 4: Write `identifiers.ts`**

Create `src/lib/sql/identifiers.ts`:

```ts
export type TableRef = { catalog: string; schema: string; name: string };

/** The catalog and schema that an unqualified table name resolves against. */
export type CatalogDefaults = { catalog: string; schema: string };

const BARE_IDENT = /^[a-z_][a-z0-9_]*$/;

export function quoteIdent(name: string): string {
	if (BARE_IDENT.test(name)) return name;

	return `"${name.replace(/"/g, '""')}"`;
}

/** Bare in the default catalog and schema, `catalog.schema.table` elsewhere. */
export function sqlName(ref: TableRef, defaults: CatalogDefaults): string {
	if (ref.catalog === defaults.catalog && ref.schema === defaults.schema) {
		return quoteIdent(ref.name);
	}

	return [ref.catalog, ref.schema, ref.name].map(quoteIdent).join('.');
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -- src/lib/sql`
Expected: PASS.

- [ ] **Step 6: Check types and lint**

Run: `npm run check` and `npx eslint src/lib/sql`
Expected: no errors.

---

### Task 3: Editor tabs

**Files:**
- Create: `src/lib/sql/tabs.ts`
- Test: `src/lib/sql/tabs.test.ts`

**Interfaces:**
- Produces:
  - `type SqlTab = { id: string; title: string; sql: string }`
  - `type TabsState = { tabs: SqlTab[]; activeId: string }`
  - `TABS_STORAGE_KEY = 'beacon-studio.sql-tabs'`
  - `emptyTabs(): TabsState`
  - `readTabs(raw: string | null): TabsState`
  - `loadTabs(): TabsState`, `saveTabs(state: TabsState): void`
  - `addTab(state): TabsState`, `closeTab(state, id): TabsState`, `selectTab(state, id): TabsState`
  - `renameTab(state, id, title): TabsState`, `setTabSql(state, id, sql): TabsState`
  - Every change function returns a new object. None changes its input.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sql/tabs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
	TABS_STORAGE_KEY,
	addTab,
	closeTab,
	emptyTabs,
	loadTabs,
	readTabs,
	renameTab,
	saveTabs,
	selectTab,
	setTabSql
} from './tabs';

describe('readTabs', () => {
	it('gives one empty tab for no value', () => {
		const state = readTabs(null);
		expect(state.tabs).toHaveLength(1);
		expect(state.tabs[0]).toMatchObject({ title: 'Query 1', sql: '' });
		expect(state.activeId).toBe(state.tabs[0].id);
	});

	it('gives one empty tab for bad JSON', () => {
		expect(readTabs('{oops').tabs).toHaveLength(1);
	});

	it('gives one empty tab for an empty list', () => {
		expect(readTabs(JSON.stringify({ tabs: [], activeId: 'x' })).tabs).toHaveLength(1);
	});

	it('drops entries of the wrong shape', () => {
		const raw = JSON.stringify({
			tabs: [{ id: 'a', title: 'A', sql: 'SELECT 1' }, { id: 5 }, null],
			activeId: 'a'
		});
		expect(readTabs(raw).tabs).toEqual([{ id: 'a', title: 'A', sql: 'SELECT 1' }]);
	});

	it('selects the first tab when activeId names no tab', () => {
		const raw = JSON.stringify({ tabs: [{ id: 'a', title: 'A', sql: '' }], activeId: 'gone' });
		expect(readTabs(raw).activeId).toBe('a');
	});
});

describe('tab changes', () => {
	it('adds a tab with the next free title and selects it', () => {
		const next = addTab(emptyTabs());
		expect(next.tabs.map((tab) => tab.title)).toEqual(['Query 1', 'Query 2']);
		expect(next.activeId).toBe(next.tabs[1].id);
	});

	it('reuses a free title number', () => {
		let state = addTab(addTab(emptyTabs()));
		state = closeTab(state, state.tabs[1].id);
		expect(addTab(state).tabs.map((tab) => tab.title)).toEqual(['Query 1', 'Query 3', 'Query 2']);
	});

	it('selects the left neighbour after a close of the active tab', () => {
		let state = addTab(addTab(emptyTabs()));
		const [first, second, third] = state.tabs;
		state = selectTab(state, second.id);
		state = closeTab(state, second.id);
		expect(state.activeId).toBe(first.id);
		expect(state.tabs.map((tab) => tab.id)).toEqual([first.id, third.id]);
	});

	it('keeps the selection after a close of another tab', () => {
		let state = addTab(emptyTabs());
		const [first, second] = state.tabs;
		state = closeTab(state, first.id);
		expect(state.activeId).toBe(second.id);
	});

	it('leaves one new empty tab after a close of the last tab', () => {
		const state = emptyTabs();
		const next = closeTab(state, state.tabs[0].id);
		expect(next.tabs).toHaveLength(1);
		expect(next.tabs[0].id).not.toBe(state.tabs[0].id);
		expect(next.tabs[0].sql).toBe('');
	});

	it('renames, and keeps the old title for an empty name', () => {
		const state = emptyTabs();
		const id = state.tabs[0].id;
		expect(renameTab(state, id, ' Argo ').tabs[0].title).toBe('Argo');
		expect(renameTab(state, id, '  ').tabs[0].title).toBe('Query 1');
	});

	it('sets the SQL of one tab without a change to the input', () => {
		const state = emptyTabs();
		const next = setTabSql(state, state.tabs[0].id, 'SELECT 1');
		expect(next.tabs[0].sql).toBe('SELECT 1');
		expect(state.tabs[0].sql).toBe('');
	});

	it('ignores a select of an unknown tab', () => {
		const state = emptyTabs();
		expect(selectTab(state, 'nope').activeId).toBe(state.activeId);
	});
});

describe('storage', () => {
	beforeEach(() => localStorage.clear());

	it('saves and loads', () => {
		const state = setTabSql(emptyTabs(), emptyTabs().tabs[0].id, 'x');
		saveTabs(state);
		expect(JSON.parse(localStorage.getItem(TABS_STORAGE_KEY)!)).toEqual(state);
		expect(loadTabs()).toEqual(state);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/sql/tabs.test.ts`
Expected: FAIL with a missing-module error.

- [ ] **Step 3: Write `tabs.ts`**

Create `src/lib/sql/tabs.ts`:

```ts
export type SqlTab = { id: string; title: string; sql: string };

export type TabsState = { tabs: SqlTab[]; activeId: string };

export const TABS_STORAGE_KEY = 'beacon-studio.sql-tabs';

// Unique inside one browser is enough. `crypto.randomUUID` needs a secure context.
function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextTitle(tabs: SqlTab[]): string {
	const titles = new Set(tabs.map((tab) => tab.title));
	let number = 1;

	while (titles.has(`Query ${number}`)) number += 1;

	return `Query ${number}`;
}

function newTab(tabs: SqlTab[]): SqlTab {
	return { id: newId(), title: nextTitle(tabs), sql: '' };
}

export function emptyTabs(): TabsState {
	const tab = newTab([]);
	return { tabs: [tab], activeId: tab.id };
}

function isTab(value: unknown): value is SqlTab {
	if (!value || typeof value !== 'object') return false;

	const tab = value as Record<string, unknown>;
	return typeof tab.id === 'string' && typeof tab.title === 'string' && typeof tab.sql === 'string';
}

/** Reads a stored value with defaults. A bad value gives one empty tab. */
export function readTabs(raw: string | null): TabsState {
	if (!raw) return emptyTabs();

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return emptyTabs();
	}

	const list = (parsed as { tabs?: unknown })?.tabs;
	if (!Array.isArray(list)) return emptyTabs();

	const tabs = list.filter(isTab).map((tab) => ({ id: tab.id, title: tab.title, sql: tab.sql }));
	if (tabs.length === 0) return emptyTabs();

	const activeId = (parsed as { activeId?: unknown }).activeId;
	if (typeof activeId === 'string' && tabs.some((tab) => tab.id === activeId)) {
		return { tabs, activeId };
	}

	return { tabs, activeId: tabs[0].id };
}

export function loadTabs(): TabsState {
	try {
		return readTabs(localStorage.getItem(TABS_STORAGE_KEY));
	} catch {
		return emptyTabs();
	}
}

export function saveTabs(state: TabsState): void {
	try {
		localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Blocked storage: the tabs live until the page closes.
	}
}

export function addTab(state: TabsState): TabsState {
	const tab = newTab(state.tabs);
	return { tabs: [...state.tabs, tab], activeId: tab.id };
}

export function closeTab(state: TabsState, id: string): TabsState {
	const index = state.tabs.findIndex((tab) => tab.id === id);
	if (index === -1) return state;

	const tabs = state.tabs.filter((tab) => tab.id !== id);
	if (tabs.length === 0) return emptyTabs();

	if (state.activeId !== id) return { tabs, activeId: state.activeId };

	return { tabs, activeId: tabs[Math.max(0, index - 1)].id };
}

export function selectTab(state: TabsState, id: string): TabsState {
	if (!state.tabs.some((tab) => tab.id === id)) return state;

	return { ...state, activeId: id };
}

export function renameTab(state: TabsState, id: string, title: string): TabsState {
	const trimmed = title.trim();
	if (trimmed === '') return state;

	return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, title: trimmed } : tab)) };
}

export function setTabSql(state: TabsState, id: string, sql: string): TabsState {
	return { ...state, tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab)) };
}
```

Note: the reuse test expects `['Query 1', 'Query 3', 'Query 2']`: after the close of "Query 2", the next free number is 2.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/sql/tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npx eslint src/lib/sql`
Expected: no errors.

---

### Task 4: Catalogue tree, schema parse and cache

**Files:**
- Create: `src/lib/sql/catalog.ts`
- Test: `src/lib/sql/catalog.test.ts`

**Interfaces:**
- Consumes: `TableRef`, `CatalogDefaults` from Task 2. `CatalogsView`, `Catalog`, `CatalogSchema` types from the SDK.
- Produces:
  - `type SchemaColumn = { name: string; dataType: string }`
  - `type CatalogTree = { catalogs: Catalog[]; defaults: CatalogDefaults }`
  - `COLUMN_PAGE_SIZE = 500`
  - `buildTree(view: CatalogsView): CatalogTree`
  - `filterTree(tree: CatalogTree, needle: string, columnsOf?: (ref: TableRef) => SchemaColumn[] | undefined): CatalogTree`
  - `parseSchema(schema: unknown): SchemaColumn[]`, `stringifyType(type: unknown): string`
  - `tableKey(ref: TableRef): string`
  - `interface CatalogSource { catalogs(): Promise<CatalogsView>; tableSchema(name: string, in_: { catalog: string; schema: string }): Promise<unknown> }`
  - `class CatalogCache` with `tree(nodeUrl, source, refresh?)`, `columnsOf(nodeUrl, source, ref)`, `loadedColumns(nodeUrl)`, `clear(nodeUrl)`
  - `type LoadedColumns = { ref: TableRef; columns: SchemaColumn[] }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sql/catalog.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CatalogsView } from '@maris-development/beacon-client';
import { CatalogCache, buildTree, filterTree, parseSchema, stringifyType } from './catalog';

const view: CatalogsView = {
	default_catalog: 'beacon',
	default_schema: 'public',
	catalogs: [
		{ name: 'remote', schemas: [{ name: 'main', tables: [{ name: 'r1', table_type: 'BASE TABLE' }] }] },
		{
			name: 'beacon',
			schemas: [
				{ name: 'system', tables: [{ name: 'jobs', table_type: 'VIEW' }] },
				{ name: 'zeta', tables: [{ name: 'z1', table_type: 'BASE TABLE' }] },
				{
					name: 'public',
					tables: [
						{ name: 'argo', table_type: 'BASE TABLE' },
						{ name: 'wod', table_type: 'BASE TABLE' }
					]
				}
			]
		}
	]
};

describe('buildTree', () => {
	it('puts the default catalog and schema first, system schemas last', () => {
		const tree = buildTree(view);
		expect(tree.defaults).toEqual({ catalog: 'beacon', schema: 'public' });
		expect(tree.catalogs.map((c) => c.name)).toEqual(['beacon', 'remote']);
		expect(tree.catalogs[0].schemas.map((s) => s.name)).toEqual(['public', 'zeta', 'system']);
	});
});

describe('filterTree', () => {
	const tree = buildTree(view);

	it('keeps everything for an empty filter', () => {
		expect(filterTree(tree, '  ')).toBe(tree);
	});

	it('keeps matching tables only', () => {
		const result = filterTree(tree, 'arg');
		expect(result.catalogs).toHaveLength(1);
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['argo']);
	});

	it('keeps a whole schema when its name matches', () => {
		const result = filterTree(tree, 'zeta');
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['z1']);
	});

	it('keeps a table when a loaded column matches', () => {
		const columnsOf = (ref: { name: string }) => {
			if (ref.name === 'wod') return [{ name: 'salinity', dataType: 'Float64' }];
			return undefined;
		};
		const result = filterTree(tree, 'salin', columnsOf);
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['wod']);
	});
});

describe('parseSchema', () => {
	it('reads fields with simple and nested types', () => {
		const schema = {
			fields: [
				{ name: 'depth', data_type: 'Float64' },
				{ name: 'time', data_type: { Timestamp: ['Millisecond', null] } },
				{ name: 'tags', data_type: { List: { name: 'item', data_type: 'Utf8' } } },
				{ name: 'price', data_type: { Decimal128: [10, 2] } },
				{ data_type: 'Utf8' }
			]
		};
		expect(parseSchema(schema)).toEqual([
			{ name: 'depth', dataType: 'Float64' },
			{ name: 'time', dataType: 'Timestamp(Millisecond)' },
			{ name: 'tags', dataType: 'List<Utf8>' },
			{ name: 'price', dataType: 'Decimal128(10, 2)' }
		]);
	});

	it('gives no columns for a value of the wrong shape', () => {
		expect(parseSchema(null)).toEqual([]);
		expect(parseSchema({ nope: 1 })).toEqual([]);
	});

	it('writes an unknown type as JSON', () => {
		expect(stringifyType({ A: 1, B: 2 })).toBe('{"A":1,"B":2}');
	});
});

describe('CatalogCache', () => {
	function source() {
		return {
			catalogs: vi.fn().mockResolvedValue(view),
			tableSchema: vi.fn().mockResolvedValue({ fields: [{ name: 'depth', data_type: 'Float64' }] })
		};
	}
	const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };

	it('loads the tree one time for each node URL', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.tree('https://a', src);
		await cache.tree('https://a', src);
		await cache.tree('https://b', src);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('loads again on refresh', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.tree('https://a', src);
		await cache.tree('https://a', src, true);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('loads the columns of one table one time, and lists them', async () => {
		const cache = new CatalogCache();
		const src = source();
		await Promise.all([cache.columnsOf('https://a', src, argo), cache.columnsOf('https://a', src, argo)]);
		expect(src.tableSchema).toHaveBeenCalledTimes(1);
		expect(src.tableSchema).toHaveBeenCalledWith('argo', { catalog: 'beacon', schema: 'public' });
		expect(cache.loadedColumns('https://a')).toEqual([
			{ ref: argo, columns: [{ name: 'depth', dataType: 'Float64' }] }
		]);
		expect(cache.loadedColumns('https://b')).toEqual([]);
	});

	it('forgets a failed load, so a second try calls the server again', async () => {
		const cache = new CatalogCache();
		const src = source();
		src.catalogs.mockRejectedValueOnce(new Error('down'));
		await expect(cache.tree('https://a', src)).rejects.toThrow('down');
		await cache.tree('https://a', src);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('clears one node only', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.columnsOf('https://a', src, argo);
		await cache.columnsOf('https://b', src, argo);
		cache.clear('https://a');
		expect(cache.loadedColumns('https://a')).toEqual([]);
		expect(cache.loadedColumns('https://b')).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/sql/catalog.test.ts`
Expected: FAIL with a missing-module error.

- [ ] **Step 3: Write `catalog.ts`**

Create `src/lib/sql/catalog.ts`:

```ts
import type { Catalog, CatalogSchema, CatalogsView } from '@maris-development/beacon-client';
import type { CatalogDefaults, TableRef } from './identifiers';

export type SchemaColumn = { name: string; dataType: string };

export type CatalogTree = { catalogs: Catalog[]; defaults: CatalogDefaults };

export type LoadedColumns = { ref: TableRef; columns: SchemaColumn[] };

/** A Beacon table can have more than 100,000 columns. The tree shows this many at a time. */
export const COLUMN_PAGE_SIZE = 500;

const SYSTEM_SCHEMAS = ['information_schema', 'system'];

function isDefault(catalog: string, schema: string, defaults: CatalogDefaults): boolean {
	return catalog === defaults.catalog && schema === defaults.schema;
}

function orderSchemas(catalog: string, schemas: CatalogSchema[], defaults: CatalogDefaults): CatalogSchema[] {
	const rank = (schema: CatalogSchema) => {
		if (isDefault(catalog, schema.name, defaults)) return 0;
		if (SYSTEM_SCHEMAS.includes(schema.name.toLowerCase())) return 2;
		return 1;
	};

	return [...schemas].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function buildTree(view: CatalogsView): CatalogTree {
	const defaults = { catalog: view.default_catalog, schema: view.default_schema };
	const rank = (catalog: Catalog) => {
		if (catalog.name === defaults.catalog) return 0;
		return 1;
	};

	const catalogs = [...view.catalogs]
		.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
		.map((catalog) => ({
			name: catalog.name,
			schemas: orderSchemas(catalog.name, catalog.schemas, defaults)
		}));

	return { catalogs, defaults };
}

/**
 * Keeps the entries that match `needle`. A matching catalog or schema keeps all its
 * tables. A table also stays when one of its loaded columns matches.
 */
export function filterTree(
	tree: CatalogTree,
	needle: string,
	columnsOf?: (ref: TableRef) => SchemaColumn[] | undefined
): CatalogTree {
	const query = needle.trim().toLowerCase();
	if (!query) return tree;

	const hit = (value: string) => value.toLowerCase().includes(query);

	const catalogs = tree.catalogs
		.map((catalog) => ({
			name: catalog.name,
			schemas: catalog.schemas
				.map((schema) => {
					if (hit(catalog.name) || hit(schema.name)) return schema;

					const tables = schema.tables.filter((table) => {
						if (hit(table.name)) return true;

						const ref = { catalog: catalog.name, schema: schema.name, name: table.name };
						return columnsOf?.(ref)?.some((column) => hit(column.name)) ?? false;
					});

					return { name: schema.name, tables };
				})
				.filter((schema) => schema.tables.length > 0)
		}))
		.filter((catalog) => catalog.schemas.length > 0);

	return { catalogs, defaults: tree.defaults };
}

type RawField = { name?: unknown; data_type?: unknown; dataType?: unknown; type?: unknown };

/** Reads the column list from an Arrow schema as the server sends it. */
export function parseSchema(schema: unknown): SchemaColumn[] {
	if (!schema || typeof schema !== 'object') return [];

	const record = schema as Record<string, unknown>;
	let raw: unknown[] = [];
	if (Array.isArray(record.fields)) {
		raw = record.fields;
	} else if (Array.isArray(record.columns)) {
		raw = record.columns;
	}

	return (raw as RawField[])
		.filter((field) => field && typeof field.name === 'string')
		.map((field) => ({
			name: field.name as string,
			dataType: stringifyType(field.data_type ?? field.dataType ?? field.type)
		}));
}

/** `"Float64"`, `{ Timestamp: ["Millisecond", null] }` and `{ List: field }` as one line of text. */
export function stringifyType(type: unknown): string {
	if (type == null) return '';
	if (typeof type === 'string') return type;
	if (typeof type !== 'object') return String(type);

	const entries = Object.entries(type as Record<string, unknown>);
	if (entries.length !== 1) return JSON.stringify(type);

	const [name, args] = entries[0];

	if (args && typeof args === 'object' && !Array.isArray(args) && 'data_type' in args) {
		return `${name}<${stringifyType((args as RawField).data_type)}>`;
	}

	if (Array.isArray(args)) {
		const parts = args.filter((arg) => arg != null).map((arg) => stringifyType(arg));
		if (parts.length === 0) return name;
		return `${name}(${parts.join(', ')})`;
	}

	if (args == null) return name;

	return `${name}(${stringifyType(args)})`;
}

export function tableKey(ref: TableRef): string {
	return `${ref.catalog}\u0000${ref.schema}\u0000${ref.name}`;
}

/** The part of the SDK client that the catalogue needs. */
export interface CatalogSource {
	catalogs(): Promise<CatalogsView>;
	tableSchema(name: string, in_: { catalog: string; schema: string }): Promise<unknown>;
}

/** Trees and columns for each node URL, for the life of the page. A failed load is not kept. */
export class CatalogCache {
	private trees = new Map<string, Promise<CatalogTree>>();
	private columnLoads = new Map<string, Promise<SchemaColumn[]>>();
	private loaded = new Map<string, LoadedColumns & { nodeUrl: string }>();

	tree(nodeUrl: string, source: CatalogSource, refresh = false): Promise<CatalogTree> {
		if (refresh) this.clear(nodeUrl);

		let load = this.trees.get(nodeUrl);
		if (!load) {
			load = source.catalogs().then(buildTree);
			this.trees.set(nodeUrl, load);
			load.catch(() => this.trees.delete(nodeUrl));
		}

		return load;
	}

	columnsOf(nodeUrl: string, source: CatalogSource, ref: TableRef): Promise<SchemaColumn[]> {
		const key = `${nodeUrl}\u0000${tableKey(ref)}`;

		let load = this.columnLoads.get(key);
		if (!load) {
			load = source.tableSchema(ref.name, { catalog: ref.catalog, schema: ref.schema }).then(parseSchema);
			this.columnLoads.set(key, load);
			load.then(
				(columns) => this.loaded.set(key, { nodeUrl, ref, columns }),
				() => this.columnLoads.delete(key)
			);
		}

		return load;
	}

	loadedColumns(nodeUrl: string): LoadedColumns[] {
		const result: LoadedColumns[] = [];

		for (const entry of this.loaded.values()) {
			if (entry.nodeUrl === nodeUrl) result.push({ ref: entry.ref, columns: entry.columns });
		}

		return result;
	}

	clear(nodeUrl: string): void {
		this.trees.delete(nodeUrl);

		const prefix = `${nodeUrl}\u0000`;
		for (const key of [...this.columnLoads.keys()]) {
			if (key.startsWith(prefix)) this.columnLoads.delete(key);
		}
		for (const key of [...this.loaded.keys()]) {
			if (key.startsWith(prefix)) this.loaded.delete(key);
		}
	}
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/sql/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npx eslint src/lib/sql`
Expected: no errors.

---

### Task 5: Completion entries

**Files:**
- Create: `src/lib/sql/completion.ts`
- Test: `src/lib/sql/completion.test.ts`

**Interfaces:**
- Consumes: `CatalogTree`, `LoadedColumns` from Task 4. `sqlName`, `quoteIdent` from Task 2.
- Produces:
  - `type CompletionKind = 'table' | 'column' | 'function' | 'keyword'`
  - `interface CompletionEntry { label: string; kind: CompletionKind; insertText: string; snippet: boolean; detail?: string; documentation?: string }`
  - `interface FnMeta { name: string; description?: string; returnType?: string; params: { name: string; dataType?: string }[] }`
  - `parseFunctions(raw: unknown): FnMeta[]`
  - `fnSignature(fn: FnMeta): string`
  - `SQL_KEYWORDS: string[]`, `MAX_COLUMN_ENTRIES = 5000`
  - `buildCompletions(input: { tree: CatalogTree | null; functions: FnMeta[]; columns: LoadedColumns[] }): CompletionEntry[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sql/completion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTree } from './catalog';
import { MAX_COLUMN_ENTRIES, buildCompletions, fnSignature, parseFunctions } from './completion';

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
		}
	]
});

const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };

describe('parseFunctions', () => {
	it('reads names, docs and params, drops bad entries and repeats, and sorts', () => {
		const raw = [
			{ function_name: 'lower', description: 'Lower case.', return_type: 'Utf8', params: [{ name: 's', data_type: 'Utf8' }] },
			{ name: 'abs' },
			{ name: 'abs' },
			{ nope: true },
			'junk'
		];
		const parsed = parseFunctions(raw);
		expect(parsed.map((fn) => fn.name)).toEqual(['abs', 'lower']);
		expect(fnSignature(parsed[1])).toBe('lower(s: Utf8) → Utf8');
	});

	it('gives no functions for a value of the wrong shape', () => {
		expect(parseFunctions({})).toEqual([]);
	});
});

describe('buildCompletions', () => {
	it('gives a bare name in the default schema and a qualified name elsewhere', () => {
		const tables = buildCompletions({ tree, functions: [], columns: [] }).filter(
			(entry) => entry.kind === 'table'
		);
		expect(tables.map((entry) => entry.insertText)).toEqual(['argo', 'beacon.system.jobs']);
	});

	it('inserts a function as a snippet', () => {
		const entries = buildCompletions({
			tree: null,
			functions: [{ name: 'abs', params: [] }],
			columns: []
		});
		expect(entries.find((entry) => entry.kind === 'function')).toMatchObject({
			label: 'abs',
			insertText: 'abs($0)',
			snippet: true
		});
	});

	it('gives loaded columns, quoted when needed, with no repeats', () => {
		const entries = buildCompletions({
			tree,
			functions: [],
			columns: [
				{ ref: argo, columns: [{ name: 'depth', dataType: 'Float64' }, { name: 'Temp', dataType: 'Float32' }] },
				{ ref: { ...argo, name: 'wod' }, columns: [{ name: 'depth', dataType: 'Float64' }] }
			]
		});
		const columns = entries.filter((entry) => entry.kind === 'column');
		expect(columns.map((entry) => entry.insertText)).toEqual(['depth', '"Temp"']);
		expect(columns[0].detail).toBe('argo: Float64');
	});

	it('stops at the column cap', () => {
		const many = Array.from({ length: MAX_COLUMN_ENTRIES + 10 }, (_, i) => ({ name: `c${i}`, dataType: 'Int32' }));
		const entries = buildCompletions({ tree: null, functions: [], columns: [{ ref: argo, columns: many }] });
		expect(entries.filter((entry) => entry.kind === 'column')).toHaveLength(MAX_COLUMN_ENTRIES);
	});

	it('always gives the keywords', () => {
		const entries = buildCompletions({ tree: null, functions: [], columns: [] });
		expect(entries.some((entry) => entry.kind === 'keyword' && entry.label === 'SELECT')).toBe(true);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/sql/completion.test.ts`
Expected: FAIL with a missing-module error.

- [ ] **Step 3: Write `completion.ts`**

Create `src/lib/sql/completion.ts`:

```ts
import type { CatalogTree, LoadedColumns } from './catalog';
import { quoteIdent, sqlName } from './identifiers';

export type CompletionKind = 'table' | 'column' | 'function' | 'keyword';

/** One suggestion, with no Monaco type, so it can be tested. The editor maps it. */
export interface CompletionEntry {
	label: string;
	kind: CompletionKind;
	insertText: string;
	snippet: boolean;
	detail?: string;
	documentation?: string;
}

export interface FnMeta {
	name: string;
	description?: string;
	returnType?: string;
	params: { name: string; dataType?: string }[];
}

export const MAX_COLUMN_ENTRIES = 5000;

// Monaco SQL mode highlights keywords but suggests none.
export const SQL_KEYWORDS = [
	'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
	'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'USING',
	'AS', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN', 'LIKE', 'ILIKE',
	'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'UNION', 'UNION ALL',
	'INTERSECT', 'EXCEPT', 'WITH', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
	'CREATE TABLE', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE EXTERNAL TABLE',
	'STORED AS', 'LOCATION', 'OPTIONS', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET',
	'DELETE FROM', 'DROP TABLE', 'ALTER TABLE', 'REFRESH', 'EXPLAIN', 'ANALYZE',
	'SHOW TABLES', 'DESCRIBE'
];

function text(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	return undefined;
}

/** Reads `/api/functions`. The entries have no fixed name field. */
export function parseFunctions(raw: unknown): FnMeta[] {
	if (!Array.isArray(raw)) return [];

	const seen = new Set<string>();
	const result: FnMeta[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const entry = item as Record<string, unknown>;
		const name = text(entry.function_name ?? entry.name ?? entry.function ?? entry.id);
		if (!name || seen.has(name)) continue;

		seen.add(name);

		let params: FnMeta['params'] = [];
		if (Array.isArray(entry.params)) {
			params = (entry.params as Record<string, unknown>[]).map((param) => ({
				name: text(param?.name) ?? '',
				dataType: text(param?.data_type)
			}));
		}

		result.push({
			name,
			description: text(entry.description),
			returnType: text(entry.return_type),
			params
		});
	}

	return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function fnSignature(fn: FnMeta): string {
	const params = fn.params
		.map((param) => {
			if (param.dataType) return `${param.name}: ${param.dataType}`;
			return param.name;
		})
		.join(', ');

	let signature = `${fn.name}(${params})`;
	if (fn.returnType) signature += ` → ${fn.returnType}`;

	return signature;
}

export function buildCompletions(input: {
	tree: CatalogTree | null;
	functions: FnMeta[];
	columns: LoadedColumns[];
}): CompletionEntry[] {
	const entries: CompletionEntry[] = [];

	if (input.tree) {
		const { defaults } = input.tree;

		for (const catalog of input.tree.catalogs) {
			for (const schema of catalog.schemas) {
				for (const table of schema.tables) {
					const name = sqlName({ catalog: catalog.name, schema: schema.name, name: table.name }, defaults);
					entries.push({
						label: name,
						kind: 'table',
						insertText: name,
						snippet: false,
						detail: `${catalog.name}.${schema.name} · ${table.table_type}`
					});
				}
			}
		}
	}

	const seenColumns = new Set<string>();

	for (const { ref, columns } of input.columns) {
		for (const column of columns) {
			if (seenColumns.size >= MAX_COLUMN_ENTRIES) break;
			if (seenColumns.has(column.name)) continue;

			seenColumns.add(column.name);
			entries.push({
				label: column.name,
				kind: 'column',
				insertText: quoteIdent(column.name),
				snippet: false,
				detail: `${ref.name}: ${column.dataType}`
			});
		}
	}

	for (const fn of input.functions) {
		entries.push({
			label: fn.name,
			kind: 'function',
			insertText: `${fn.name}($0)`,
			snippet: true,
			detail: fnSignature(fn),
			documentation: fn.description
		});
	}

	for (const keyword of SQL_KEYWORDS) {
		entries.push({ label: keyword, kind: 'keyword', insertText: keyword, snippet: false });
	}

	return entries;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/sql/completion.test.ts`
Expected: PASS.

- [ ] **Step 5: Format, check types and lint**

Run: `npx prettier --write src/lib/sql/completion.ts src/lib/sql/completion.test.ts`, then `npm run check` and `npx eslint src/lib/sql`
Expected: no errors. Prettier puts the keywords one per line; that is fine.

---

### Task 6: Preview run, admin fallback, download names, plan view

**Files:**
- Create: `src/lib/sql/run.ts`
- Create: `src/lib/sql/privilege.ts`
- Create: `src/lib/sql/download.ts`
- Create: `src/lib/sql/plan.ts`
- Test: `src/lib/sql/run.test.ts`
- Test: `src/lib/sql/privilege.test.ts`
- Test: `src/lib/sql/download.test.ts`
- Test: `src/lib/sql/plan.test.ts`

**Interfaces:**
- Consumes: `isSuperUserRefusal` from Task 2.
- Produces (`run.ts`):
  - `PREVIEW_ROW_LIMIT = 500`
  - `interface PreviewResult { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean; cancelled: boolean }`
  - `interface BatchSource { queryBatches(query: string, signal?: AbortSignal): Promise<{ queryId: string | null; batches: AsyncIterable<ArrowRecordBatch> }> }`
  - `runPreview(source: BatchSource, sql: string, options: { signal: AbortSignal; limit?: number }): Promise<PreviewResult>`
- Produces (`privilege.ts`):
  - `type PrivilegedOutcome<T> = { kind: 'done'; value: T } | { kind: 'cancelled' } | { kind: 'needs-admin-features'; error: unknown }`
  - `withAdminFallback<C, T>(run: (client: C) => Promise<T>, options: { client: C; adminFeatures: boolean; asAdmin: (run: (client: C) => Promise<T>) => Promise<T | null> }): Promise<PrivilegedOutcome<T>>`
- Produces (`download.ts`):
  - `interface DownloadFormat { label: string; format: SimpleOutputFormat; extension: string }`
  - `DOWNLOAD_FORMATS: DownloadFormat[]`
  - `downloadFileName(format: DownloadFormat, now: Date): string`
- Produces (`plan.ts`):
  - `interface PlanNodeView { type: string; badges: string[]; fields: [string, string][]; details: string | null; children: Record<string, unknown>[] }`
  - `planRoot(plan: unknown): Record<string, unknown> | null`
  - `viewOf(node: Record<string, unknown>): PlanNodeView`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sql/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { tableFromArrays } from 'apache-arrow';
import type { ArrowRecordBatch } from '@maris-development/beacon-client';
import { runPreview, type BatchSource } from './run';

function batch(from: number, count: number): ArrowRecordBatch {
	const n = Int32Array.from({ length: count }, (_, i) => from + i);
	return tableFromArrays({ n }).batches[0] as unknown as ArrowRecordBatch;
}

function sourceOf(make: (signal: AbortSignal) => AsyncIterable<ArrowRecordBatch>): BatchSource {
	return {
		queryBatches: async (_query, signal) => ({ queryId: null, batches: make(signal!) })
	};
}

// The signal can already be aborted, and then no `abort` event comes.
function waitForAbort(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		const fail = () => reject(new DOMException('Aborted', 'AbortError'));
		if (signal.aborted) {
			fail();
			return;
		}
		signal.addEventListener('abort', fail);
	});
}

describe('runPreview', () => {
	it('stops at the limit and marks the result as truncated', async () => {
		let aborted = false;
		const source = sourceOf(async function* (signal) {
			signal.addEventListener('abort', () => (aborted = true));
			yield batch(0, 300);
			yield batch(300, 300);
			yield batch(600, 300);
		});

		const result = await runPreview(source, 'SELECT n', { signal: new AbortController().signal, limit: 500 });

		expect(result.rows).toHaveLength(500);
		expect(result.rows[499]).toEqual({ n: 499 });
		expect(result.columns).toEqual(['n']);
		expect(result.truncated).toBe(true);
		expect(result.cancelled).toBe(false);
		expect(aborted).toBe(true);
	});

	it('is not truncated when the rows end exactly at the limit', async () => {
		const source = sourceOf(async function* () {
			yield batch(0, 250);
			yield batch(250, 250);
		});

		const result = await runPreview(source, 'SELECT n', { signal: new AbortController().signal, limit: 500 });

		expect(result.rows).toHaveLength(500);
		expect(result.truncated).toBe(false);
	});

	it('keeps the rows received before a stop', async () => {
		const controller = new AbortController();
		const source = sourceOf(async function* (signal) {
			yield batch(0, 10);
			controller.abort();
			await waitForAbort(signal);
		});

		const result = await runPreview(source, 'SELECT n', { signal: controller.signal });

		expect(result.rows).toHaveLength(10);
		expect(result.cancelled).toBe(true);
	});

	it('gives an empty cancelled result for a stop before the first batch', async () => {
		const controller = new AbortController();
		const source: BatchSource = {
			queryBatches: (_query, signal) => {
				controller.abort();
				return waitForAbort(signal!);
			}
		};

		const result = await runPreview(source, 'SELECT n', { signal: controller.signal });

		expect(result).toEqual({ columns: [], rows: [], truncated: false, cancelled: true });
	});

	it('gives an empty result for a statement with no rows', async () => {
		const source = sourceOf(async function* () {});

		const result = await runPreview(source, 'CREATE VIEW v AS SELECT 1', { signal: new AbortController().signal });

		expect(result).toEqual({ columns: [], rows: [], truncated: false, cancelled: false });
	});

	it('passes a server error through', async () => {
		const source: BatchSource = { queryBatches: () => Promise.reject(new Error('bad sql')) };

		await expect(runPreview(source, 'x', { signal: new AbortController().signal })).rejects.toThrow('bad sql');
	});
});
```

Create `src/lib/sql/privilege.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@maris-development/beacon-client';
import { withAdminFallback } from './privilege';

const refusal = new ApiError(400, 'operation not permitted: this statement requires super-user privileges', 'u');

describe('withAdminFallback', () => {
	it('runs as a normal user when the server allows it', async () => {
		const asAdmin = vi.fn();
		const outcome = await withAdminFallback(async (client: string) => `ran as ${client}`, {
			client: 'user',
			adminFeatures: true,
			asAdmin
		});

		expect(outcome).toEqual({ kind: 'done', value: 'ran as user' });
		expect(asAdmin).not.toHaveBeenCalled();
	});

	it('runs again as admin after a refusal with admin features on', async () => {
		const run = vi.fn(async (client: string) => {
			if (client === 'user') throw refusal;
			return 'ran as admin';
		});

		const outcome = await withAdminFallback(run, {
			client: 'user',
			adminFeatures: true,
			asAdmin: (fn) => fn('admin')
		});

		expect(outcome).toEqual({ kind: 'done', value: 'ran as admin' });
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('reports a cancelled sign-in', async () => {
		const outcome = await withAdminFallback(() => Promise.reject(refusal), {
			client: 'user',
			adminFeatures: true,
			asAdmin: async () => null
		});

		expect(outcome).toEqual({ kind: 'cancelled' });
	});

	it('does not ask for admin with admin features off', async () => {
		const asAdmin = vi.fn();
		const outcome = await withAdminFallback(() => Promise.reject(refusal), {
			client: 'user',
			adminFeatures: false,
			asAdmin
		});

		expect(outcome).toEqual({ kind: 'needs-admin-features', error: refusal });
		expect(asAdmin).not.toHaveBeenCalled();
	});

	it('passes any other error through', async () => {
		const error = new ApiError(400, 'column "x" not found', 'u');

		await expect(
			withAdminFallback(() => Promise.reject(error), { client: 'user', adminFeatures: true, asAdmin: vi.fn() })
		).rejects.toBe(error);
	});
});
```

Create `src/lib/sql/download.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DOWNLOAD_FORMATS, downloadFileName } from './download';

describe('downloads', () => {
	it('offers the four formats', () => {
		expect(DOWNLOAD_FORMATS.map((format) => format.label)).toEqual(['CSV', 'Parquet', 'Arrow IPC', 'NetCDF']);
	});

	it('names the file after the time', () => {
		const arrow = DOWNLOAD_FORMATS.find((format) => format.label === 'Arrow IPC')!;
		expect(downloadFileName(arrow, new Date('2026-10-06T11:44:05.123Z'))).toBe('query-2026-10-06T11-44-05.arrow');
	});
});
```

Create `src/lib/sql/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planRoot, viewOf } from './plan';

describe('plan view', () => {
	const plan = [
		{
			Plan: {
				'Node Type': 'ProjectionExec',
				'Actual Rows': 42,
				'Actual Total Time': 1.5,
				Output: ['n'],
				Details: 'expr=[n]',
				Plans: [{ 'Node Type': 'DataSourceExec' }]
			}
		}
	];

	it('finds the root in the [{ Plan }] shape and in a bare node', () => {
		expect(planRoot(plan)?.['Node Type']).toBe('ProjectionExec');
		expect(planRoot({ 'Node Type': 'X' })?.['Node Type']).toBe('X');
		expect(planRoot(null)).toBeNull();
		expect(planRoot([])).toBeNull();
	});

	it('builds the view of one node', () => {
		const view = viewOf(planRoot(plan)!);
		expect(view.type).toBe('ProjectionExec');
		expect(view.badges).toEqual(['42 rows', 'compute 1.5 ms']);
		expect(view.fields).toEqual([['Output', '["n"]']]);
		expect(view.details).toBe('expr=[n]');
		expect(view.children).toHaveLength(1);
	});

	it('names a node with no type', () => {
		expect(viewOf({}).type).toBe('Node');
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/sql`
Expected: FAIL with missing-module errors for `./run`, `./privilege`, `./download` and `./plan`.

- [ ] **Step 3: Write `run.ts`**

Create `src/lib/sql/run.ts`:

```ts
import { rowsFromBatch, type ArrowRecordBatch } from '@maris-development/beacon-client';

export const PREVIEW_ROW_LIMIT = 500;

export interface PreviewResult {
	columns: string[];
	rows: Record<string, unknown>[];
	/** More rows exist after the limit. */
	truncated: boolean;
	/** The user stopped the run. The rows hold what arrived before. */
	cancelled: boolean;
}

/** The part of the SDK client that the preview needs. */
export interface BatchSource {
	queryBatches(
		query: string,
		signal?: AbortSignal
	): Promise<{ queryId: string | null; batches: AsyncIterable<ArrowRecordBatch> }>;
}

/** Streams the result and stops at `limit` rows. A stop through `signal` keeps the rows so far. */
export async function runPreview(
	source: BatchSource,
	sql: string,
	options: { signal: AbortSignal; limit?: number }
): Promise<PreviewResult> {
	const limit = options.limit ?? PREVIEW_ROW_LIMIT;
	// The request has its own controller, so the limit can end it without a user stop.
	const request = new AbortController();
	const forward = () => request.abort();
	options.signal.addEventListener('abort', forward);

	const columns: string[] = [];
	const rows: Record<string, unknown>[] = [];
	let truncated = false;

	try {
		const { batches } = await source.queryBatches(sql, request.signal);

		for await (const batch of batches) {
			if (columns.length === 0) {
				columns.push(...batch.schema.fields.map((field) => field.name));
			}

			const room = limit - rows.length;
			const batchRows = rowsFromBatch<Record<string, unknown>>(batch);
			rows.push(...batchRows.slice(0, room));

			if (batchRows.length > room) {
				truncated = true;
				break;
			}
		}
	} catch (error) {
		if (!options.signal.aborted) throw error;

		return { columns, rows, truncated: false, cancelled: true };
	} finally {
		options.signal.removeEventListener('abort', forward);
		request.abort();
	}

	return { columns, rows, truncated, cancelled: false };
}
```

- [ ] **Step 4: Write `privilege.ts`**

Create `src/lib/sql/privilege.ts`:

```ts
import { isSuperUserRefusal } from './statement';

export type PrivilegedOutcome<T> =
	| { kind: 'done'; value: T }
	| { kind: 'cancelled' }
	| { kind: 'needs-admin-features'; error: unknown };

/**
 * Runs as a normal user first. On a super-user refusal, runs again through `asAdmin`,
 * but only with admin features on. The server refuses before it runs anything, so the
 * statement never runs twice.
 */
export async function withAdminFallback<C, T>(
	run: (client: C) => Promise<T>,
	options: {
		client: C;
		adminFeatures: boolean;
		asAdmin: (run: (client: C) => Promise<T>) => Promise<T | null>;
	}
): Promise<PrivilegedOutcome<T>> {
	try {
		return { kind: 'done', value: await run(options.client) };
	} catch (error) {
		if (!isSuperUserRefusal(error)) throw error;
		if (!options.adminFeatures) return { kind: 'needs-admin-features', error };
	}

	const value = await options.asAdmin(run);
	if (value === null) return { kind: 'cancelled' };

	return { kind: 'done', value };
}
```

- [ ] **Step 5: Write `download.ts`**

Create `src/lib/sql/download.ts`:

```ts
import type { SimpleOutputFormat } from '@maris-development/beacon-client';

export interface DownloadFormat {
	label: string;
	format: SimpleOutputFormat;
	extension: string;
}

export const DOWNLOAD_FORMATS: DownloadFormat[] = [
	{ label: 'CSV', format: 'csv', extension: 'csv' },
	{ label: 'Parquet', format: 'parquet', extension: 'parquet' },
	{ label: 'Arrow IPC', format: 'ipc', extension: 'arrow' },
	{ label: 'NetCDF', format: 'netcdf', extension: 'nc' }
];

export function downloadFileName(format: DownloadFormat, now: Date): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
	return `query-${stamp}.${format.extension}`;
}
```

- [ ] **Step 6: Write `plan.ts`**

Create `src/lib/sql/plan.ts`:

```ts
/** One node of a DataFusion EXPLAIN plan, ready for display. */
export interface PlanNodeView {
	type: string;
	badges: string[];
	fields: [string, string][];
	details: string | null;
	children: Record<string, unknown>[];
}

const SPECIAL_KEYS = new Set(['Node Type', 'Plans', 'Actual Rows', 'Actual Total Time', 'Details']);

function isNode(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The plan comes as `[{ Plan: node }]`, `{ Plan: node }` or a bare node. */
export function planRoot(plan: unknown): Record<string, unknown> | null {
	let value = plan;
	if (Array.isArray(value)) value = value[0];
	if (isNode(value) && 'Plan' in value) value = value.Plan;

	if (isNode(value)) return value;

	return null;
}

function show(value: unknown): string {
	if (typeof value === 'string') return value;

	return JSON.stringify(value);
}

export function viewOf(node: Record<string, unknown>): PlanNodeView {
	const badges: string[] = [];
	if (node['Actual Rows'] !== undefined) badges.push(`${show(node['Actual Rows'])} rows`);
	if (node['Actual Total Time'] !== undefined) badges.push(`compute ${show(node['Actual Total Time'])} ms`);

	let type = 'Node';
	if (typeof node['Node Type'] === 'string') type = node['Node Type'];

	let details: string | null = null;
	if (typeof node.Details === 'string') details = node.Details;

	let children: Record<string, unknown>[] = [];
	if (Array.isArray(node.Plans)) children = node.Plans.filter(isNode);

	const fields = Object.entries(node)
		.filter(([key]) => !SPECIAL_KEYS.has(key))
		.map(([key, value]): [string, string] => [key, show(value)]);

	return { type, badges, fields, details, children };
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test -- src/lib/sql`
Expected: PASS for every file in `src/lib/sql`.
If `run.test.ts` fails on `tableFromArrays` or on the row values, check the row shape that `rowsFromBatch` gives for a real `apache-arrow` batch, and fix the test data, not the limit logic.

- [ ] **Step 8: Format, check types and lint**

Run: `npx prettier --write src/lib/sql`, then `npm run check` and `npx eslint src/lib/sql`
Expected: no errors.

---

### Task 7: The SQL editor component

**Files:**
- Create: `src/lib/components/sql-editor/SqlEditor.svelte`

**Interfaces:**
- Consumes: `CompletionEntry` from Task 5. `@/monaco/environment` from Task 1.
- Produces: `SqlEditor` with props `{ tabId: string; value: string; tabIds: string[]; completions: CompletionEntry[]; onChange: (tabId: string, sql: string) => void; onRun: () => void }` and the instance methods `selectedText(): string` and `insert(text: string): void` (use with `bind:this`).

No unit test: Monaco needs a real browser. Task 11 tests it by hand.

- [ ] **Step 1: Create the component**

Create `src/lib/components/sql-editor/SqlEditor.svelte`:

```svelte
<!--
	Monaco in SQL mode. Each tab has its own model, so each tab keeps its own undo history.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as monaco from 'monaco-editor';
	import '@/monaco/environment';
	import type { CompletionEntry, CompletionKind } from '@/sql/completion';

	type Props = {
		tabId: string;
		value: string;
		tabIds: string[];
		completions: CompletionEntry[];
		onChange: (tabId: string, sql: string) => void;
		onRun: () => void;
	};

	let { tabId, value, tabIds, completions, onChange, onRun }: Props = $props();

	let container: HTMLDivElement;
	let editor = $state.raw<monaco.editor.IStandaloneCodeEditor | null>(null);
	const models = new Map<string, monaco.editor.ITextModel>();

	const KIND: Record<CompletionKind, monaco.languages.CompletionItemKind> = {
		table: monaco.languages.CompletionItemKind.Struct,
		column: monaco.languages.CompletionItemKind.Field,
		function: monaco.languages.CompletionItemKind.Function,
		keyword: monaco.languages.CompletionItemKind.Keyword
	};

	function modelFor(id: string, text: string): monaco.editor.ITextModel {
		let model = models.get(id);

		if (!model) {
			const created = monaco.editor.createModel(text, 'sql');
			created.onDidChangeContent(() => onChange(id, created.getValue()));
			models.set(id, created);
			model = created;
		}

		return model;
	}

	export function selectedText(): string {
		const selection = editor?.getSelection();
		const model = editor?.getModel();
		if (!selection || !model || selection.isEmpty()) return '';

		return model.getValueInRange(selection);
	}

	export function insert(text: string): void {
		const selection = editor?.getSelection();
		if (!editor || !selection) return;

		editor.executeEdits('catalogue', [{ range: selection, text, forceMoveMarkers: true }]);
		editor.focus();
	}

	onMount(() => {
		const created = monaco.editor.create(container, {
			model: modelFor(tabId, value),
			automaticLayout: true,
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			fontSize: 13,
			theme: 'vs'
		});

		created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun());

		// The provider is global for the `sql` language, so it answers for this editor only.
		const provider = monaco.languages.registerCompletionItemProvider('sql', {
			provideCompletionItems(model, position) {
				if (model !== created.getModel()) return { suggestions: [] };

				const word = model.getWordUntilPosition(position);
				const range = new monaco.Range(
					position.lineNumber,
					word.startColumn,
					position.lineNumber,
					word.endColumn
				);

				const suggestions = completions.map((entry) => {
					let insertTextRules: monaco.languages.CompletionItemInsertTextRule | undefined;
					if (entry.snippet) {
						insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
					}

					let documentation: monaco.IMarkdownString | undefined;
					if (entry.documentation) documentation = { value: entry.documentation };

					return {
						label: entry.label,
						kind: KIND[entry.kind],
						insertText: entry.insertText,
						insertTextRules,
						detail: entry.detail,
						documentation,
						range
					};
				});

				return { suggestions };
			}
		});

		editor = created;

		return () => {
			provider.dispose();
			created.dispose();
			for (const model of models.values()) model.dispose();
			models.clear();
			editor = null;
		};
	});

	// A tab switch swaps the model. The tab SQL seeds a new model only.
	$effect(() => {
		const id = tabId;
		if (!editor) return;

		const model = modelFor(id, untrack(() => value));
		if (editor.getModel() !== model) editor.setModel(model);
	});

	// The model of a closed tab goes away.
	$effect(() => {
		const keep = new Set(tabIds);

		for (const [id, model] of models) {
			if (!keep.has(id)) {
				model.dispose();
				models.delete(id);
			}
		}
	});
</script>

<div class="sql-editor" bind:this={container}></div>

<style lang="scss">
	.sql-editor {
		width: 100%;
		height: 100%;
		min-height: 8rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		overflow: hidden;
	}
</style>
```

- [ ] **Step 2: Check types and lint**

Run: `npm run check` and `npx eslint src/lib/components/sql-editor`
Expected: no errors. If `svelte-check` rejects `export function` in a runes component, keep it: Svelte 5 supports it, and the error means a typo. If `onChange` inside `modelFor` reads a stale prop, read it as `untrack(() => onChange)` at call time instead.

---

### Task 8: Catalogue tree and tabs bar

**Files:**
- Create: `src/lib/components/sql-editor/CatalogTree.svelte`
- Create: `src/lib/components/sql-editor/SqlTabs.svelte`

**Interfaces:**
- Consumes: `CatalogTree`, `SchemaColumn`, `COLUMN_PAGE_SIZE`, `filterTree`, `tableKey` from Task 4. `TableRef`, `quoteIdent`, `sqlName` from Task 2. `TabsState` from Task 3.
- Produces:
  - `CatalogTree` props `{ tree: CatalogTree | null; loading: boolean; error: string; loadColumns: (ref: TableRef) => Promise<SchemaColumn[]>; onInsert: (text: string) => void; onRefresh: () => void }`
  - `SqlTabs` props `{ state: TabsState; onSelect: (id: string) => void; onAdd: () => void; onClose: (id: string) => void; onRename: (id: string, title: string) => void }`

No unit test: the rules are in the tested domain files. Task 11 tests the markup by hand.

- [ ] **Step 1: Create the catalogue tree**

Create `src/lib/components/sql-editor/CatalogTree.svelte`:

```svelte
<!--
	Catalog > schema > table > columns. A click on a name inserts it into the editor.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { Input } from '@/components/ui/input';
	import {
		COLUMN_PAGE_SIZE,
		filterTree,
		tableKey,
		type CatalogTree,
		type SchemaColumn
	} from '@/sql/catalog';
	import { quoteIdent, sqlName, type TableRef } from '@/sql/identifiers';
	import { sqlErrorMessage } from '@/sql/statement';

	type Props = {
		tree: CatalogTree | null;
		loading: boolean;
		error: string;
		loadColumns: (ref: TableRef) => Promise<SchemaColumn[]>;
		onInsert: (text: string) => void;
		onRefresh: () => void;
	};

	let { tree, loading, error, loadColumns, onInsert, onRefresh }: Props = $props();

	type ColumnState = { columns: SchemaColumn[]; shown: number } | { error: string } | 'loading';

	let needle = $state('');
	let open = $state<Record<string, boolean>>({});
	let columns = $state<Record<string, ColumnState>>({});

	// A new tree (node change or refresh) starts closed, with the default schema open.
	$effect(() => {
		if (!tree) return;

		open = { [`s:${tree.defaults.catalog}.${tree.defaults.schema}`]: true, [`c:${tree.defaults.catalog}`]: true };
		columns = {};
	});

	function loadedOf(ref: TableRef): SchemaColumn[] | undefined {
		const state = columns[tableKey(ref)];
		if (state && typeof state === 'object' && 'columns' in state) return state.columns;
		return undefined;
	}

	let shown = $derived.by(() => {
		if (!tree) return null;
		return filterTree(tree, needle, loadedOf);
	});

	// A separate value, so the click handlers need no null check on `shown`.
	let defaults = $derived(tree?.defaults ?? { catalog: '', schema: '' });

	// A filter shows every match, so it opens everything.
	let filtering = $derived(needle.trim() !== '');

	function isOpen(key: string): boolean {
		return filtering || open[key] === true;
	}

	function toggle(key: string) {
		open[key] = !open[key];
	}

	async function toggleTable(ref: TableRef) {
		const key = tableKey(ref);
		open[`t:${key}`] = !open[`t:${key}`];
		if (!open[`t:${key}`] || columns[key]) return;

		columns[key] = 'loading';
		try {
			columns[key] = { columns: await loadColumns(ref), shown: COLUMN_PAGE_SIZE };
		} catch (caught) {
			columns[key] = { error: sqlErrorMessage(caught) };
		}
	}

	function showMore(key: string) {
		const state = columns[key];
		if (state && typeof state === 'object' && 'columns' in state) {
			columns[key] = { ...state, shown: state.shown + COLUMN_PAGE_SIZE };
		}
	}
</script>

<div class="catalog">
	<div class="catalog-head">
		<Input type="search" placeholder="Filter tables" bind:value={needle} />
		<button type="button" class="icon-button" title="Refresh" aria-label="Refresh" onclick={onRefresh}>
			<RefreshCwIcon class="size-4" />
		</button>
	</div>

	{#if loading}
		<p class="muted">Loading tables...</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else if shown && shown.catalogs.length === 0}
		<p class="muted">No tables match.</p>
	{:else if shown}
		<ul class="level">
			{#each shown.catalogs as catalog (catalog.name)}
				{@const catalogKey = `c:${catalog.name}`}
				<li>
					<button type="button" class="row" onclick={() => toggle(catalogKey)}>
						<ChevronRightIcon class="chevron {isOpen(catalogKey) ? 'open' : ''}" />
						<span class="name">{catalog.name}</span>
					</button>

					{#if isOpen(catalogKey)}
						<ul class="level">
							{#each catalog.schemas as schema (schema.name)}
								{@const schemaKey = `s:${catalog.name}.${schema.name}`}
								<li>
									<button type="button" class="row" onclick={() => toggle(schemaKey)}>
										<ChevronRightIcon class="chevron {isOpen(schemaKey) ? 'open' : ''}" />
										<span class="name">{schema.name}</span>
									</button>

									{#if isOpen(schemaKey)}
										<ul class="level">
											{#each schema.tables as table (table.name)}
												{@const ref = { catalog: catalog.name, schema: schema.name, name: table.name }}
												{@const key = tableKey(ref)}
												{@const state = columns[key]}
												<li>
													<div class="row">
														<button
															type="button"
															class="toggle"
															aria-label="Show columns"
															onclick={() => toggleTable(ref)}
														>
															<ChevronRightIcon class="chevron {open[`t:${key}`] ? 'open' : ''}" />
														</button>
														<button
															type="button"
															class="insert"
															title={table.table_type}
															onclick={() => onInsert(sqlName(ref, defaults))}
														>
															{table.name}
														</button>
													</div>

													{#if open[`t:${key}`]}
														{#if state === 'loading'}
															<p class="muted nested">Loading columns...</p>
														{:else if state && 'error' in state}
															<p class="error nested">{state.error}</p>
														{:else if state}
															<ul class="level columns">
																{#each state.columns.slice(0, state.shown) as column (column.name)}
																	<li>
																		<button
																			type="button"
																			class="insert column"
																			onclick={() => onInsert(quoteIdent(column.name))}
																		>
																			<span>{column.name}</span>
																			<span class="type">{column.dataType}</span>
																		</button>
																	</li>
																{/each}
															</ul>
															{#if state.columns.length > state.shown}
																<button type="button" class="more" onclick={() => showMore(key)}>
																	Show more ({state.columns.length - state.shown} left)
																</button>
															{/if}
														{/if}
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.catalog {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
		height: 100%;
		overflow: auto;
		font-size: 0.875rem;
	}

	.catalog-head {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.icon-button,
	.row,
	.toggle,
	.insert,
	.more {
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.level {
		list-style: none;
		margin: 0;
		padding-left: 0.75rem;

		&.columns {
			padding-left: 1.75rem;
		}
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		width: 100%;
		padding: 0.125rem 0;
	}

	.insert {
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		word-break: break-all;

		&:hover {
			background: var(--accent);
		}

		&.column {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
		}
	}

	.type {
		color: var(--muted-foreground);
		font-family: monospace;
		font-size: 0.75rem;
	}

	.more {
		padding-left: 1.75rem;
		text-decoration: underline;
		color: var(--muted-foreground);
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}

	.nested {
		padding-left: 1.75rem;
		margin: 0;
	}

	:global(.chevron) {
		width: 0.875rem;
		height: 0.875rem;
		transition: transform 0.15s;
	}

	:global(.chevron.open) {
		transform: rotate(90deg);
	}
</style>
```

- [ ] **Step 2: Create the tabs bar**

Create `src/lib/components/sql-editor/SqlTabs.svelte`:

```svelte
<!--
	The tab bar of the SQL editor. A double click on a title renames the tab.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { TabsState } from '@/sql/tabs';

	type Props = {
		state: TabsState;
		onSelect: (id: string) => void;
		onAdd: () => void;
		onClose: (id: string) => void;
		onRename: (id: string, title: string) => void;
	};

	let { state, onSelect, onAdd, onClose, onRename }: Props = $props();

	let editingId = $state<string | null>(null);
	let draft = $state('');

	function startRename(id: string, title: string) {
		editingId = id;
		draft = title;
	}

	function commit() {
		if (editingId) onRename(editingId, draft);
		editingId = null;
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Enter') commit();
		if (event.key === 'Escape') editingId = null;
	}
</script>

<div class="tabs" role="tablist">
	{#each state.tabs as tab (tab.id)}
		<div class="tab" class:active={tab.id === state.activeId}>
			{#if editingId === tab.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="rename" bind:value={draft} onblur={commit} onkeydown={onKey} autofocus />
			{:else}
				<button
					type="button"
					role="tab"
					aria-selected={tab.id === state.activeId}
					onclick={() => onSelect(tab.id)}
					ondblclick={() => startRename(tab.id, tab.title)}
				>
					{tab.title}
				</button>
			{/if}
			<button type="button" class="close" aria-label="Close {tab.title}" onclick={() => onClose(tab.id)}>
				<XIcon class="size-3" />
			</button>
		</div>
	{/each}

	<button type="button" class="add" aria-label="New tab" onclick={onAdd}>
		<PlusIcon class="size-4" />
	</button>
</div>

<style lang="scss">
	.tabs {
		display: flex;
		align-items: flex-end;
		gap: 0.25rem;
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid transparent;
		border-bottom: 0;
		border-radius: 0.375rem 0.375rem 0 0;
		white-space: nowrap;

		&.active {
			border-color: var(--border);
			background: var(--background);
			font-weight: 600;
		}

		button {
			border: 0;
			background: none;
			color: inherit;
			cursor: pointer;
		}
	}

	.close {
		display: flex;
		opacity: 0.6;

		&:hover {
			opacity: 1;
		}
	}

	.rename {
		width: 8rem;
		font: inherit;
	}

	.add {
		display: flex;
		padding: 0.25rem;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}
</style>
```

- [ ] **Step 3: Check types and lint**

Run: `npm run check` and `npx eslint src/lib/components/sql-editor`
Expected: no errors.

---

### Task 9: Result grid, plan tree, download menu

**Files:**
- Create: `src/lib/components/sql-editor/ResultGrid.svelte`
- Create: `src/lib/components/sql-editor/PlanTree.svelte`
- Create: `src/lib/components/sql-editor/DownloadMenu.svelte`
- Create: `src/lib/components/sql-editor/save-blob.ts`

**Interfaces:**
- Consumes: `DataTable` (`components/visualisation/DataTable.svelte`), `Column` (`@/util-types`). `planRoot`, `viewOf` from Task 6. `DOWNLOAD_FORMATS`, `DownloadFormat` from Task 6.
- Produces:
  - `ResultGrid` props `{ columns: string[]; rows: Record<string, unknown>[] }`
  - `PlanTree` props `{ node: Record<string, unknown>; depth?: number }`
  - `DownloadMenu` props `{ disabled: boolean; busy: boolean; onDownload: (format: DownloadFormat) => void }`
  - `saveBlob(blob: Blob, fileName: string): void`

- [ ] **Step 1: Create the grid**

Create `src/lib/components/sql-editor/ResultGrid.svelte`:

```svelte
<script lang="ts">
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import type { Column } from '@/util-types';

	const PAGE_SIZE = 100;

	let { columns, rows }: { columns: string[]; rows: Record<string, unknown>[] } = $props();

	let pageIndex = $state(1);

	// A new result starts on page 1.
	$effect(() => {
		void rows;
		pageIndex = 1;
	});

	let tableColumns: Column[] = $derived(columns.map((key) => ({ key, header: key, sortable: false })));
	let pageRows = $derived(rows.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE));
</script>

<DataTable
	columns={tableColumns}
	rows={pageRows}
	totalRows={rows.length}
	pageSize={PAGE_SIZE}
	{pageIndex}
	size="small"
	onPageChange={(page) => (pageIndex = page)}
/>
```

- [ ] **Step 2: Create the plan tree**

Create `src/lib/components/sql-editor/PlanTree.svelte`:

```svelte
<!--
	One node of an EXPLAIN plan and its children. The top three levels start open.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PlanTree from './PlanTree.svelte';
	import { viewOf } from '@/sql/plan';

	let { node, depth = 0 }: { node: Record<string, unknown>; depth?: number } = $props();

	let view = $derived(viewOf(node));
	let open = $state(depth < 3);
</script>

<div class="plan-node" class:nested={depth > 0}>
	<div class="head">
		<button
			type="button"
			class="toggle"
			class:hidden={view.children.length === 0 && view.fields.length === 0 && !view.details}
			aria-label={open ? 'Fold' : 'Unfold'}
			onclick={() => (open = !open)}
		>
			<ChevronRightIcon class="chevron {open ? 'open' : ''}" />
		</button>
		<span class="type">{view.type}</span>
		{#each view.badges as badge (badge)}
			<span class="badge">{badge}</span>
		{/each}
	</div>

	{#if open}
		{#each view.fields as [key, value] (key)}
			<div class="field"><span class="key">{key}:</span> {value}</div>
		{/each}
		{#if view.details}
			<pre class="details">{view.details}</pre>
		{/if}
		{#each view.children as child, index (index)}
			<PlanTree node={child} depth={depth + 1} />
		{/each}
	{/if}
</div>

<style lang="scss">
	.plan-node {
		font-family: monospace;
		font-size: 0.75rem;

		&.nested {
			margin-left: 0.75rem;
			padding-left: 0.75rem;
			border-left: 1px solid var(--border);
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.125rem 0;
	}

	.toggle {
		display: flex;
		border: 0;
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;

		&.hidden {
			visibility: hidden;
		}
	}

	.type {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: var(--accent);
		font-weight: 600;
	}

	.badge {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		color: var(--muted-foreground);
	}

	.field {
		margin-left: 1.25rem;
		word-break: break-all;
	}

	.key {
		color: var(--muted-foreground);
	}

	.details {
		margin: 0.25rem 0 0.25rem 1.25rem;
		white-space: pre-wrap;
		color: var(--muted-foreground);
	}

	:global(.plan-node .chevron) {
		width: 0.875rem;
		height: 0.875rem;
		transition: transform 0.15s;
	}

	:global(.plan-node .chevron.open) {
		transform: rotate(90deg);
	}
</style>
```

- [ ] **Step 3: Create the file save helper**

Create `src/lib/components/sql-editor/save-blob.ts`:

```ts
/** Saves a blob as a file through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Create the download menu**

Create `src/lib/components/sql-editor/DownloadMenu.svelte` (same dropdown pattern as `components/buttons/VisualiseDataButton.svelte`):

```svelte
<script lang="ts">
	import Button from '@/components/buttons/Button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LoadingIcon from '@lucide/svelte/icons/loader-2';
	import { DOWNLOAD_FORMATS, type DownloadFormat } from '@/sql/download';

	let {
		disabled,
		busy,
		onDownload
	}: { disabled: boolean; busy: boolean; onDownload: (format: DownloadFormat) => void } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger disabled={disabled || busy}>
		<Button variant="outline" disabled={disabled || busy}>
			{#if busy}
				<LoadingIcon class="animate-spin" />
			{:else}
				<DownloadIcon />
			{/if}
			Download
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-40">
		{#each DOWNLOAD_FORMATS as format (format.label)}
			<DropdownMenu.Item onclick={() => onDownload(format)}>{format.label}</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
```

- [ ] **Step 5: Check types and lint**

Run: `npx prettier --write src/lib/components/sql-editor`, then `npm run check` and `npx eslint src/lib/components/sql-editor`
Expected: no errors.

---

### Task 10: The page, the menu item and AGENTS.md

**Files:**
- Create: `src/routes/sql-editor/+page.svelte`
- Create: `src/routes/sql-editor/+page.server.ts`
- Modify: `src/lib/components/sidebar/AppSidebar.svelte` (icon imports, the "Data Access" group around line 40)
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything from Tasks 1-9. `currentNode` (`@/services/beacon-node`), `withAdmin` (`@/services/admin-session`), `makeBeaconClient` (`@/beacon-api/client`), `settings` (`@/stores/settings`), `NodePicker` (`@/components/NodePicker.svelte`).

- [ ] **Step 1: Turn off SSR like the other editor routes**

Create `src/routes/sql-editor/+page.server.ts`:

```ts
// Monaco needs the browser.
export const ssr = false;
```

- [ ] **Step 2: Create the page**

Create `src/routes/sql-editor/+page.svelte`:

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import type { BeaconClient as SdkClient } from '@maris-development/beacon-client';
	import PlayIcon from '@lucide/svelte/icons/play';
	import SquareIcon from '@lucide/svelte/icons/square';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import Button from '@/components/buttons/Button.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import SqlEditor from '@/components/sql-editor/SqlEditor.svelte';
	import SqlTabs from '@/components/sql-editor/SqlTabs.svelte';
	import CatalogTree from '@/components/sql-editor/CatalogTree.svelte';
	import ResultGrid from '@/components/sql-editor/ResultGrid.svelte';
	import PlanTree from '@/components/sql-editor/PlanTree.svelte';
	import DownloadMenu from '@/components/sql-editor/DownloadMenu.svelte';
	import { saveBlob } from '@/components/sql-editor/save-blob';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { withAdmin } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { CatalogCache, type CatalogTree as Tree, type SchemaColumn } from '@/sql/catalog';
	import { buildCompletions, parseFunctions, type FnMeta } from '@/sql/completion';
	import { downloadFileName, type DownloadFormat } from '@/sql/download';
	import type { TableRef } from '@/sql/identifiers';
	import { planRoot } from '@/sql/plan';
	import { withAdminFallback } from '@/sql/privilege';
	import { PREVIEW_ROW_LIMIT, runPreview, type PreviewResult } from '@/sql/run';
	import { isSqlDisabled, sqlErrorMessage, sqlToRun } from '@/sql/statement';
	import {
		addTab,
		closeTab,
		loadTabs,
		renameTab,
		saveTabs,
		selectTab,
		setTabSql,
		type TabsState
	} from '@/sql/tabs';

	type Action = 'run' | 'explain' | 'analyze';

	type Outcome =
		| { kind: 'busy'; action: Action }
		| { kind: 'rows'; result: PreviewResult }
		| { kind: 'plan'; plan: unknown; analyzed: boolean }
		| { kind: 'error'; message: string; hint?: string }
		| { kind: 'notice'; message: string };

	const ADMIN_HINT = 'Turn on "Show admin features" in Settings';

	let tabs: TabsState = $state(loadTabs());
	let outcomes: Record<string, Outcome> = $state({});
	let busy = $state(false);
	let downloading = $state(false);
	let catalogOpen = $state(false);
	let editor: SqlEditor | undefined = $state();

	// The action that owns the result area of each tab. A newer action on the tab replaces it.
	const owners = new Map<string, AbortController>();
	let controller: AbortController | null = null;

	const cache = new CatalogCache();
	let tree: Tree | null = $state(null);
	let treeLoading = $state(false);
	let treeError = $state('');
	let functions: FnMeta[] = $state([]);
	let columnsVersion = $state(0);

	let activeTab = $derived(tabs.tabs.find((tab) => tab.id === tabs.activeId) ?? tabs.tabs[0]);
	let node = $derived($currentNode);
	// The node object changes on every health check. The URL changes only on a real switch.
	let nodeUrl = $derived(node?.url ?? null);
	let outcome = $derived(outcomes[activeTab.id] ?? null);

	let completions = $derived.by(() => {
		void columnsVersion;

		let loaded: ReturnType<CatalogCache['loadedColumns']> = [];
		if (nodeUrl) loaded = cache.loadedColumns(nodeUrl);

		return buildCompletions({ tree, functions, columns: loaded });
	});

	$effect(() => {
		saveTabs($state.snapshot(tabs));
	});

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => loadCatalogue(false));
	});

	async function loadCatalogue(refresh: boolean) {
		const current = node;
		if (!current) return;

		const client = makeBeaconClient(current);
		treeLoading = true;
		treeError = '';

		try {
			const result = await cache.tree(current.url, client, refresh);
			// A node switch during the load makes this answer stale.
			if (current.url === nodeUrl) tree = result;
		} catch (error) {
			if (current.url === nodeUrl) {
				tree = null;
				treeError = sqlErrorMessage(error);
			}
		} finally {
			if (current.url === nodeUrl) treeLoading = false;
		}

		// A failure removes the function suggestions only.
		client.functions().then(
			(raw) => {
				if (current.url === nodeUrl) functions = parseFunctions(raw);
			},
			() => {
				if (current.url === nodeUrl) functions = [];
			}
		);
	}

	async function loadColumns(ref: TableRef): Promise<SchemaColumn[]> {
		const current = node;
		if (!current) return [];

		const result = await cache.columnsOf(current.url, makeBeaconClient(current), ref);
		columnsVersion += 1;

		return result;
	}

	function begin(action: Action): { own: AbortController; tabId: string } {
		controller?.abort();

		const own = new AbortController();
		controller = own;
		busy = true;

		const tabId = activeTab.id;
		owners.set(tabId, own);
		outcomes[tabId] = { kind: 'busy', action };

		return { own, tabId };
	}

	function finish(own: AbortController, tabId: string, result: Outcome) {
		if (owners.get(tabId) === own) {
			owners.delete(tabId);
			outcomes[tabId] = result;
		}

		if (controller === own) {
			controller = null;
			busy = false;
		}
	}

	function stop() {
		controller?.abort();
	}

	function statement(): string {
		return sqlToRun(activeTab.sql, editor?.selectedText() ?? '');
	}

	async function perform(action: Action, work: (client: SdkClient, sql: string, signal: AbortSignal) => Promise<Outcome>) {
		const current = node;
		if (!current) return;

		const sql = statement();
		if (sql === '') return;

		const { own, tabId } = begin(action);

		try {
			const result = await withAdminFallback((client: SdkClient) => work(client, sql, own.signal), {
				client: makeBeaconClient(current),
				adminFeatures: $settings.adminFeatures,
				asAdmin: (run) => withAdmin(current, run)
			});

			if (result.kind === 'done') {
				finish(own, tabId, result.value);
			} else if (result.kind === 'cancelled') {
				finish(own, tabId, { kind: 'notice', message: 'Cancelled.' });
			} else {
				finish(own, tabId, { kind: 'error', message: sqlErrorMessage(result.error), hint: ADMIN_HINT });
			}
		} catch (error) {
			if (own.signal.aborted) {
				finish(own, tabId, { kind: 'notice', message: 'Stopped.' });
			} else if (isSqlDisabled(error)) {
				finish(own, tabId, { kind: 'notice', message: 'SQL is turned off on this Beacon node.' });
			} else {
				finish(own, tabId, { kind: 'error', message: sqlErrorMessage(error) });
			}
		}
	}

	function run() {
		void perform('run', async (client, sql, signal) => {
			const result = await runPreview(client, sql, { signal });
			return { kind: 'rows', result };
		});
	}

	function explain(analyzed: boolean) {
		let action: Action = 'explain';
		if (analyzed) action = 'analyze';

		void perform(action, async (client, sql, signal) => {
			let plan: unknown;
			if (analyzed) {
				plan = await client.explainAnalyzeQuery(sql, signal);
			} else {
				plan = await client.explainQuery(sql, signal);
			}
			return { kind: 'plan', plan, analyzed };
		});
	}

	// Download leaves the result area alone, unless it fails.
	async function download(format: DownloadFormat) {
		const current = node;
		if (!current || downloading) return;

		const sql = statement();
		if (sql === '') return;

		const tabId = activeTab.id;
		downloading = true;

		try {
			const fetchFile = async (client: SdkClient) => {
				const response = await client.queryRaw(sql, format.format);
				return response.blob();
			};

			const result = await withAdminFallback(fetchFile, {
				client: makeBeaconClient(current),
				adminFeatures: $settings.adminFeatures,
				asAdmin: (fn) => withAdmin(current, fn)
			});

			if (result.kind === 'done') {
				saveBlob(result.value, downloadFileName(format, new Date()));
			} else if (result.kind === 'needs-admin-features') {
				outcomes[tabId] = { kind: 'error', message: sqlErrorMessage(result.error), hint: ADMIN_HINT };
			}
		} catch (error) {
			if (isSqlDisabled(error)) {
				outcomes[tabId] = { kind: 'notice', message: 'SQL is turned off on this Beacon node.' };
			} else {
				outcomes[tabId] = { kind: 'error', message: sqlErrorMessage(error) };
			}
		} finally {
			downloading = false;
		}
	}

	function onClose(id: string) {
		owners.get(id)?.abort();
		owners.delete(id);
		delete outcomes[id];
		tabs = closeTab(tabs, id);
	}
</script>

<svelte:head>
	<title>SQL Editor - Beacon Studio</title>
</svelte:head>

<div class="sql-page">
	<header class="page-head">
		<h1>SQL Editor</h1>
		<NodePicker />
	</header>

	{#if !node}
		<p>Pick a Beacon node.</p>
	{/if}

	<div class="workspace">
		<aside class="catalog-panel" class:open={catalogOpen}>
			<CatalogTree
				{tree}
				loading={treeLoading}
				error={treeError}
				{loadColumns}
				onInsert={(text) => editor?.insert(text)}
				onRefresh={() => loadCatalogue(true)}
			/>
		</aside>

		<section class="main">
			<SqlTabs
				state={tabs}
				onSelect={(id) => (tabs = selectTab(tabs, id))}
				onAdd={() => (tabs = addTab(tabs))}
				{onClose}
				onRename={(id, title) => (tabs = renameTab(tabs, id, title))}
			/>

			<div class="toolbar">
				<Button
					class="catalog-toggle"
					variant="outline"
					onclick={() => (catalogOpen = !catalogOpen)}
					aria-label="Tables"
				>
					<PanelLeftIcon />
				</Button>

				{#if busy}
					<Button variant="destructive" onclick={stop}>
						<SquareIcon />
						Stop
					</Button>
				{:else}
					<Button disabled={!node} onclick={run} title="Ctrl+Enter">
						<PlayIcon />
						Run
					</Button>
				{/if}
				<Button variant="outline" disabled={!node || busy} onclick={() => explain(false)}>
					<ListTreeIcon />
					Explain
				</Button>
				<Button variant="outline" disabled={!node || busy} onclick={() => explain(true)}>Analyze</Button>
				<DownloadMenu disabled={!node} busy={downloading} onDownload={download} />
				<span class="hint">Ctrl+Enter runs the selection, or the whole tab.</span>
			</div>

			<div class="editor-area">
				<SqlEditor
					bind:this={editor}
					tabId={activeTab.id}
					value={activeTab.sql}
					tabIds={tabs.tabs.map((tab) => tab.id)}
					{completions}
					onChange={(id, sql) => (tabs = setTabSql(tabs, id, sql))}
					onRun={() => {
						if (!busy) run();
					}}
				/>
			</div>

			<div class="result-area">
				{#if outcome?.kind === 'busy'}
					<p class="muted">Running...</p>
				{:else if outcome?.kind === 'rows'}
					{@const result = outcome.result}
					{#if result.cancelled}
						<p class="notice">Stopped. The grid shows the rows received before the stop.</p>
					{:else if result.truncated}
						<p class="notice">First {PREVIEW_ROW_LIMIT} rows. Download for the full result.</p>
					{/if}
					{#if result.rows.length > 0}
						<ResultGrid columns={result.columns} rows={result.rows} />
					{:else if !result.cancelled}
						<p class="muted">The statement ran. It returned no rows.</p>
					{/if}
				{:else if outcome?.kind === 'plan'}
					{@const root = planRoot(outcome.plan)}
					{#if root}
						<PlanTree node={root} />
					{:else}
						<p class="muted">No plan to show.</p>
					{/if}
				{:else if outcome?.kind === 'error'}
					<div class="error-block" role="alert">
						<pre>{outcome.message}</pre>
						{#if outcome.hint}
							<p>{outcome.hint}</p>
						{/if}
					</div>
				{:else if outcome?.kind === 'notice'}
					<p class="notice">{outcome.message}</p>
				{/if}
			</div>
		</section>
	</div>
</div>

<style lang="scss">
	.sql-page {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
		min-height: 0;
		padding: 1rem;
	}

	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;

		h1 {
			margin: 0;
		}
	}

	.workspace {
		display: flex;
		gap: 1rem;
		flex: 1;
		min-height: 0;
	}

	.catalog-panel {
		flex: 0 0 16rem;
		min-height: 0;
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;

		:global(.catalog-toggle) {
			display: none;
		}
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.editor-area {
		flex: 0 0 38%;
		min-height: 8rem;
	}

	.result-area {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.notice {
		margin: 0 0 0.5rem;
		color: var(--muted-foreground);
	}

	.error-block {
		padding: 0.75rem;
		border: 1px solid var(--destructive);
		border-radius: 0.5rem;
		color: var(--destructive);

		pre {
			margin: 0;
			white-space: pre-wrap;
			word-break: break-word;
		}

		p {
			margin: 0.5rem 0 0;
		}
	}

	@media (max-width: 767px) {
		.workspace {
			flex-direction: column;
		}

		.catalog-panel {
			display: none;
			flex-basis: auto;
			max-height: 40vh;

			&.open {
				display: block;
			}
		}

		.toolbar :global(.catalog-toggle) {
			display: inline-flex;
		}
	}
</style>
```

Note: "Running..." is UI copy, not a comment. If the reviewer flags the `-ing` rule, use "Busy...".

- [ ] **Step 3: Add the menu item**

In `src/lib/components/sidebar/AppSidebar.svelte`, add to the icon imports:

```ts
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
```

In the `groups` array, in the "Data Access" group, add a second entry to `items`, after the "Queries" item:

```ts
				},
				{ title: 'SQL Editor', url: resolve('/sql-editor'), icon: SquareTerminalIcon }
			]
```

Here the first `}` is the existing end of the "Queries" item, and `]` is the existing end of `items`. Keep one of each.

- [ ] **Step 4: Update AGENTS.md**

In `AGENTS.md`, section "High-Level Architecture", under "Domain modules", add:

```markdown
  - `src/lib/sql/*` (the SQL editor: tabs, statement rules, catalogue cache, completion, 500-row preview, admin fallback. `withAdminFallback` takes the admin runner as an argument, so this folder imports no service.)
```

In section "Layer Rule (Important)", change the chain line to:

```markdown
`beacon-api` → `query` / `geo` / `sql` → `stores` → `components` → `routes`
```

and add a bullet:

```markdown
- `src/lib/sql/*` must never import from `services`, `stores` or `components`. The page passes `withAdmin` into `withAdminFallback`.
```

In section "Validation Checklist Before Finishing", add `/sql-editor` to the smoke-test routes.

- [ ] **Step 5: Run every check**

Run: `npm test`, `npm run check`, then `npx eslint src/lib/sql src/lib/components/sql-editor src/routes/sql-editor src/lib/monaco`
Expected: all tests pass; no type errors; no lint errors in the new files.

---

### Task 11: Manual test and roadmap

**Files:**
- Modify: `docs/superpowers/admin-mode-roadmap.md` (status row 2)

- [ ] **Step 1: Test against a node with SQL on**

Run: `npm run dev`. Open `/sql-editor`. The sidebar shows "SQL Editor" under "Data Access", and only that item is active.

1. The catalogue loads. The default catalog and schema are open.
2. Open a table. Its columns load with types. A table with more than 500 columns shows "Show more".
3. Type `arg` in the filter. Only matching tables stay. Clear the filter.
4. Click a table name, then a column name. Both go into the editor at the cursor.
5. Type `SEL` in the editor. "SELECT" is suggested. Type the start of a loaded column name. The column is suggested.
6. Run `SELECT * FROM <big table>`. The grid shows 500 rows in pages of 100, with "First 500 rows. Download for the full result."
7. Run a long query and press Stop. The grid keeps the rows that arrived, with the stop notice.
8. Select one line of two statements and press Ctrl+Enter. Only the selection runs.
9. Explain and Analyze show a plan tree. Nodes fold.
10. Download as CSV. A file `query-<time>.csv` downloads with the full result. The grid stays.
11. Add a tab, rename it with a double click, type SQL, and reload the page. The tabs and their SQL come back. Close every tab. One empty tab stays.
12. Undo (Ctrl+Z) in one tab does not change another tab.
13. Switch the node in the picker while the catalogue loads. The tree of the new node shows, not the old one.
14. Start a Run, then start another Run on the same tab at once. Only the second result shows.

- [ ] **Step 2: Test the admin rule**

1. With "Show admin features" off, run `CREATE VIEW sql_editor_test AS SELECT 1 AS n`. The error block shows the server text and `Turn on "Show admin features" in Settings`.
2. Turn the setting on. Run it again. The sign-in dialog opens. Cancel it. The result area shows "Cancelled.".
3. Run it again and sign in. The statement runs. The catalogue shows the view after Refresh.
4. Run `DROP VIEW sql_editor_test`. It runs with no dialog, because the session exists.

- [ ] **Step 3: Test a node with SQL off**

On a node with `config.sql.enable = false` (or ask the user for one): Run shows "SQL is turned off on this Beacon node." The buttons stay enabled.

- [ ] **Step 4: Test the JSON editor**

Open `/queries/query-editor`. The JSON editor still works, with colours and error marks.

- [ ] **Step 5: Update the roadmap**

In `docs/superpowers/admin-mode-roadmap.md`, set row 2 of the status table: plan link `[plan](plans/2026-10-06-sql-editor.md)`, and the build status with the date and the test result. Report each failed manual step to the user with what you saw.
