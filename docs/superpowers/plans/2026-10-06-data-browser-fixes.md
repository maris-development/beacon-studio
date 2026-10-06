# Data Browser Fixes (after steps 3, 4, 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issues that the step 4 and 5 builds reported, after each was checked in the code on 2026-10-06.

**Architecture:** Most fixes are small changes to existing files. Rules that need a test go into the domain files (`src/lib/data-browser/*`, `src/lib/beacon-api/crawler-run.ts`) with a unit test first. Page fixes follow the existing stale-answer pattern: capture the node URL before an `await`, and drop the answer when it changed.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-06-data-browser-design.md`
**Roadmap:** `docs/superpowers/admin-mode-roadmap.md`

## Global Constraints

- Do not run `git commit` unless the user writes "commit". Never create a branch. No worktree.
- Edit files with the Edit or Write tool only. Never with `sed`, `perl` or `echo`.
- Tests go in `tests/` next to the code. Write the failing test first.
- Do not reformat whole old files. Prettier only on lines you change.
- Comments: one short line, only for logic that is not clear. ASD-STE100.
- Prefer `if`/`else` over `?:` in script code.

## Verification of the reported issues

| # | Issue | Verdict | Where | Fix |
|---|---|---|---|---|
| 1 | "Retry failed" also restarts stopped files | Real | `UploadDialog.svelte:101-103,120` (a stop sets `waiting`) | Task 2 |
| 2 | A destination change after a partial upload rewrites the paths of finished files | Real, misleading | `UploadDialog.svelte:66-71` | Task 2 |
| 3 | Progress moves only for files above 50 MiB | Real, SDK behaviour (`onProgress` fires in the chunked path only) | SDK `uploadDataset` | Accept. A file shows "uploading" until done. No change. |
| 4 | The upload hint has no links | Real | `UploadDialog.svelte:200` | Task 2 |
| 5 | "Open in SQL Editor" uses `read_parquet` when the details did not load | Real, wrong SQL for NetCDF and others | `datasets/detail/+page.svelte:57,170` | Task 1 |
| 6 | The `/data-browser` counts can show the old node | Real | `data-browser/+page.svelte:24-45` (no stale check) | Task 4 |
| 7 | Browser Back between folders does not restore the page number | Real (`requestedPage` is read from the URL once) | `datasets/+page.svelte:47` | Task 4 |
| 8 | The Schema tab loads again on each open | Real, also on the table detail page | `SchemaTable.svelte:44`, both detail pages | Task 3 |
| 9 | Hidden files (`.DS_Store`) fail on every retry | Real | `dropped-files.ts`, `UploadDialog.svelte` | Task 2 |
| 10 | Edit changes a 90-second schedule to 120 seconds | Real, by design of the step 5 plan | `crawlers.ts` `formFromCrawler` | Task 1 |
| 11 | A run during a node switch keeps the buttons disabled, and its report can show on the new node | Real | `crawlers/+page.svelte:87-105` | Task 5 |
| 12 | A load error has no "Try again" | Real | `crawlers/+page.svelte` error branch | Task 5 |
| 13 | The crawler dialog and the folder picker both load the full file list | Real (two calls of up to 100,000 entries) | `CrawlerDialog.svelte:52`, `FolderPicker` | Task 5 |
| 14 | "This folder holds no files" can show by mistake | Real for a cut list (100,000 entries). The `/` case is theoretical: the server returns store-relative paths. Fix both at no cost. | `crawlers.ts:213` | Task 1 |
| 15 | An empty success response from the run call shows a raw JSON error | Real (`JSON.parse('')`) | `crawler-run.ts:85` | Task 1 |
| 16 | The spec names `crawler-form.ts`; the code uses `crawlers.ts` | Real, docs only | spec | Task 6 |
| - | Roadmap rows 2 and 3 say "not committed" | Out of date: committed as `69e3f67` and `08adc20` | roadmap | Task 6 |

## Review Focus

- A dataset share link for `argo/a.nc` whose details fail to load: "Open in SQL Editor" gives `read_netcdf`. Test in Task 1.
- A stopped upload: "Retry failed" does not restart it, and "Continue" does. Manual check in Task 2.
- A node switch during a crawler run: the new node shows no report and enabled buttons. Manual check in Task 5.
- An exact crawler schedule of 90 seconds survives an Edit with no change. Test in Task 1.

---

### Task 1: Domain fixes (5, 10, 14, 15)

**Files:**
- Modify: `src/lib/data-browser/datasets.ts`, `src/lib/data-browser/tests/datasets.test.ts`
- Modify: `src/lib/data-browser/crawlers.ts`, `src/lib/data-browser/tests/crawlers.test.ts`
- Modify: `src/lib/beacon-api/crawler-run.ts`, `src/lib/beacon-api/tests/crawler-run.test.ts`

**Interfaces:**
- Produces: `formatFromPath(path: string): string` in `datasets.ts`. Maps the extension to a format id: `.nc` to `nc`, `.parquet` to `parquet`, `.csv` to `csv`, `.arrow` to `arrow`, `.zarr` to `zarr`, `.tif`/`.tiff` to `tiff`, `.bbf` to `bbf`, `.txt` to `txt`; anything else to `''`.
- Changes: `ScheduleUnit` becomes `'seconds' | 'minutes' | 'hours'`. `formFromCrawler` uses `seconds` when the value does not divide by 60.
- Changes: `folderHasFiles(folder, paths, listCut = false)` returns `true` when `listCut` is true. It also removes a leading `/` from each path before the compare.
- Changes: `runCrawlerReport` throws `new Error('The Beacon node sent no run report.')` for an empty or non-JSON success body.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data-browser/tests/datasets.test.ts` (add `formatFromPath` to the import):

```ts
describe('formatFromPath', () => {
	it('reads the format from the extension', () => {
		expect(formatFromPath('argo/a.nc')).toBe('nc');
		expect(formatFromPath('A.PARQUET')).toBe('parquet');
		expect(formatFromPath('x.tif')).toBe('tiff');
		expect(formatFromPath('noext')).toBe('');
	});

	it('gives the right read function for a share link with no details', () => {
		const entry = { path: 'argo/a.nc', format: formatFromPath('argo/a.nc'), canInspect: true, size: null, lastModified: null };
		expect(datasetEditorSql(entry)).toBe("SELECT * FROM read_netcdf(['argo/a.nc']) LIMIT 100");
	});
});
```

In `src/lib/data-browser/tests/crawlers.test.ts`, replace the test `'rounds a schedule of odd seconds up to whole minutes'` with:

```ts
	it('keeps a schedule of odd seconds exact, in seconds', () => {
		const form = formFromCrawler({ ...crawler, scheduleSecs: 90 });
		expect(form).toMatchObject({ scheduled: true, every: 90, unit: 'seconds' });
		expect(crawlerRequest(form, true).schedule_secs).toBe(90);
	});
```

and append to its `describe('display', ...)`:

```ts
	it('does not warn about an empty folder when the list is cut, and ignores a leading slash', () => {
		expect(folderHasFiles('argo/', [], true)).toBe(true);
		expect(folderHasFiles('argo/', ['/argo/a.nc'])).toBe(true);
	});
```

Append to `src/lib/beacon-api/tests/crawler-run.test.ts`:

```ts
	it('gives a readable error for an empty success body', async () => {
		await expect(runCrawlerReport('https://a.org', credentials, 'x', respond(200, ''))).rejects.toThrow(
			'The Beacon node sent no run report.'
		);
	});
```

(inside `describe('runCrawlerReport', ...)`).

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser src/lib/beacon-api`
Expected: FAIL in the four new or changed tests.

- [ ] **Step 3: Write the fixes**

In `datasets.ts`, add:

```ts
const EXTENSION_FORMATS: Record<string, string> = {
	nc: 'nc',
	parquet: 'parquet',
	csv: 'csv',
	arrow: 'arrow',
	zarr: 'zarr',
	tif: 'tiff',
	tiff: 'tiff',
	bbf: 'bbf',
	txt: 'txt'
};

/** The format id of a path, for a share link that has no file details. */
export function formatFromPath(path: string): string {
	const dot = path.lastIndexOf('.');
	if (dot === -1 || dot < path.lastIndexOf('/')) return '';

	return EXTENSION_FORMATS[path.slice(dot + 1).toLowerCase()] ?? '';
}
```

In `crawlers.ts`:
- Change `export type ScheduleUnit = 'minutes' | 'hours';` to `'seconds' | 'minutes' | 'hours'`.
- In `formFromCrawler`, replace the inner `if`/`else` with:

```ts
		if (crawler.scheduleSecs % 3600 === 0) {
			every = crawler.scheduleSecs / 3600;
		} else if (crawler.scheduleSecs % 60 === 0) {
			unit = 'minutes';
			every = crawler.scheduleSecs / 60;
		} else {
			unit = 'seconds';
			every = crawler.scheduleSecs;
		}
```

- In `crawlerRequest`, set `factor` to `1` for `seconds`:

```ts
		let factor = 3600;
		if (form.unit === 'minutes') factor = 60;
		if (form.unit === 'seconds') factor = 1;
```

- Replace the comment above `formFromCrawler` with: `// The form shows hours or minutes when the value divides, else seconds, so a save keeps the value.`
- Replace `folderHasFiles` with:

```ts
/** A cut list can miss the folder, so it counts as "has files". */
export function folderHasFiles(folder: string, paths: string[], listCut = false): boolean {
	if (listCut) return true;

	const prefix = normalizeFolder(folder);
	return paths.some((path) => path.replace(/^\/+/, '').startsWith(prefix));
}
```

In `CrawlerDialog.svelte`, add `<option value="seconds">seconds</option>` before the minutes option.

In `crawler-run.ts`, replace the last line of `runCrawlerReport` with:

```ts
	try {
		return parseCrawlReport(JSON.parse(text));
	} catch {
		throw new Error('The Beacon node sent no run report.');
	}
```

- [ ] **Step 4: Use `formatFromPath` on the dataset detail page**

In `src/routes/data-browser/datasets/detail/+page.svelte`, import `formatFromPath` and change the initial entry's `format: ''` (line 57) to `format: formatFromPath(file)`.

- [ ] **Step 5: Run the tests to see them pass, and check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/beacon-api src/routes/data-browser src/lib/components/data-browser`
Expected: all pass.

---

### Task 2: Upload dialog (1, 2, 4, 9)

**Files:**
- Modify: `src/lib/data-browser/upload.ts`, `src/lib/data-browser/tests/upload.test.ts`
- Modify: `src/lib/components/data-browser/dropped-files.ts`
- Modify: `src/lib/components/data-browser/UploadDialog.svelte`

**Interfaces:**
- Changes: `UploadStatus` gains `'stopped'`. `retryItems` resets `failed` only. New `resumeItems(items)` resets `stopped` to `waiting`.
- New: `isHiddenPath(relativePath: string): boolean` in `upload.ts` (any path part that starts with `.`).
- New: `retarget(items: UploadItem[], destination: string): UploadItem[]` in `upload.ts`. It changes `target` only for items that are not `done`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/data-browser/tests/upload.test.ts` (import the new names):

```ts
describe('stop, resume and retarget', () => {
	const base = planUpload('a/', [
		{ relativePath: 'x.nc', size: 1 },
		{ relativePath: 'y.nc', size: 1 },
		{ relativePath: 'z.nc', size: 1 }
	]);
	const mixed = [
		{ ...base[0], status: 'done' as const },
		{ ...base[1], status: 'stopped' as const },
		{ ...base[2], status: 'failed' as const, error: 'boom' }
	];

	it('retries failed items only', () => {
		expect(retryItems(mixed).map((item) => item.status)).toEqual(['done', 'stopped', 'waiting']);
	});

	it('resumes stopped items only', () => {
		expect(resumeItems(mixed).map((item) => item.status)).toEqual(['done', 'waiting', 'failed']);
	});

	it('keeps the target of a done item when the destination changes', () => {
		expect(retarget(mixed, 'b').map((item) => item.target)).toEqual(['a/x.nc', 'b/y.nc', 'b/z.nc']);
	});
});

describe('isHiddenPath', () => {
	it('finds a hidden file or a file in a hidden folder', () => {
		expect(isHiddenPath('.DS_Store')).toBe(true);
		expect(isHiddenPath('data/.git/config')).toBe(true);
		expect(isHiddenPath('data/a.nc')).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL. The new names do not exist.

- [ ] **Step 3: Write the domain changes**

In `upload.ts`:
- Change `UploadStatus` to `'waiting' | 'uploading' | 'done' | 'failed' | 'stopped'`.
- Add:

```ts
export function resumeItems(items: UploadItem[]): UploadItem[] {
	return items.map((item) => {
		if (item.status !== 'stopped') return item;
		return { ...item, status: 'waiting', uploaded: 0 };
	});
}

/** A done file stays where it went. Only the others follow a new destination. */
export function retarget(items: UploadItem[], destination: string): UploadItem[] {
	const folder = normalizeFolder(destination);

	return items.map((item) => {
		if (item.status === 'done') return item;
		return { ...item, target: `${folder}${item.relativePath.replace(/^\/+/, '')}` };
	});
}

/** Hidden files (`.DS_Store`, `.git/…`) are not datasets, and the server refuses them. */
export function isHiddenPath(relativePath: string): boolean {
	return relativePath.split('/').some((part) => part.startsWith('.'));
}
```

- [ ] **Step 4: Change the dialog**

In `UploadDialog.svelte`:
1. In `setPicked`, drop hidden files and count them:

```ts
	let skippedHidden = $state(0);

	function setPicked(files: PickedFile[]) {
		const visible = files.filter((entry) => !isHiddenPath(entry.relativePath));
		skippedHidden = files.length - visible.length;
		picked = visible;
		items = planUpload(
			destination,
			visible.map((entry) => ({ relativePath: entry.relativePath, size: entry.file.size }))
		);
		finished = false;
	}
```

   Under the drop area show: `{#if skippedHidden > 0}<p class="muted">Skipped {skippedHidden} hidden files.</p>{/if}`

2. In `start`, replace the two statements under the comment `// The destination can change after the pick, ...` with `items = retarget(items, destination);`. `picked[item.id]` still matches, because `retarget` keeps `id`.
3. In the two places that handle a stop (`result === null` and `signal.aborted` in the catch), set `status: 'stopped'` instead of `'waiting'`. Keep `break`.
4. In the `finally`, change `finished` to: `items.length > 0 && items.every((item) => item.status === 'done' || item.status === 'failed')`.
5. Add `function resume() { items = resumeItems(items); void start(); }`.
6. In the footer, with nothing running: show "Continue" (`resume`) when any item is `stopped`, else "Retry failed" when any item is `failed`, else "Upload".
7. Replace the hint paragraph with links (import `resolve` from `$app/paths` and `settings` from `@/stores/settings`):

```svelte
		{#if finished && summary.done > 0}
			<p class="muted">
				To query these files, create a table:
				{#if $settings.adminFeatures}
					<a href={resolve('/data-browser/crawlers')}>run a crawler</a>, or
				{/if}
				use Create external table on the <a href={resolve('/data-browser/data-tables')}>Data Tables</a> page.
			</p>
		{/if}
```

- [ ] **Step 5: Check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/components/data-browser`
Expected: all pass. Manual: stop an upload of three files after the first; "Continue" shows and sends the rest. Fail one file (no "Replace"), stop another: "Continue" first, then "Retry failed". Drop a folder with `.DS_Store`: "Skipped 1 hidden files."

---

### Task 3: Schema loads once per page (8)

**Files:**
- Modify: `src/routes/data-browser/data-tables/detail/+page.svelte`
- Modify: `src/routes/data-browser/datasets/detail/+page.svelte`

- [ ] **Step 1: Keep one promise per page**

In each detail page, wrap the schema request so a second call returns the first promise:

```ts
	let schemaLoad: Promise<unknown> | null = null;

	function loadSchemaOnce(): Promise<unknown> {
		if (!schemaLoad) {
			schemaLoad = /* the existing schema request */;
			// A failure can be tried again on the next open.
			schemaLoad.catch(() => (schemaLoad = null));
		}
		return schemaLoad;
	}
```

- Table detail: the existing request is `client.tableSchema(tableName, { catalog: ref.catalog, schema: ref.schema })`. Pass `load={loadSchemaOnce}` to `SchemaTable`.
- Dataset detail: rename the existing `loadSchema` body into the wrapped request, keep the `columns = …` line after the await inside a `.then`, and use `loadSchemaOnce` both for `SchemaTable` and for the preview's column load.

`SchemaTable` stays unchanged: it still calls `load()` on each mount, but the answer now comes from the same promise.

- [ ] **Step 2: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser`
Manual: open a detail page with the network tab open. Switch Schema, Preview, Schema: one `table-schema` (or `dataset-schema`) request.

---

### Task 4: Stale counts and the page number in the URL (6, 7)

**Files:**
- Modify: `src/routes/data-browser/+page.svelte`
- Modify: `src/routes/data-browser/datasets/+page.svelte`

- [ ] **Step 1: Drop a stale count**

In `data-browser/+page.svelte` `count()`: capture `const url = node.url;` and, in each `.then` callback, return early when `url !== nodeUrl`.

- [ ] **Step 2: Read the page number from the URL**

In `datasets/+page.svelte`:
- Replace `let requestedPage = $state(...)` with a derived value: `let requestedPage = $derived(Number(page.url.searchParams.get('page') ?? '1') || 1);`
- Add a helper that writes the page to the URL without a reload:

```ts
	function goToPage(next: number) {
		const url = new URL(page.url);
		if (next <= 1) {
			url.searchParams.delete('page');
		} else {
			url.searchParams.set('page', String(next));
		}
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}
```

- Replace each `requestedPage = …` assignment (lines 97, 145, 163, 291, 298) with `goToPage(…)`. In `openFolder`, `listHref(path)` already has no `page`, so remove the `requestedPage = 1` line there.
- Browser Back now restores both the folder and the page, because both live in the URL.

- [ ] **Step 3: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser`
Manual: open a folder with more than 100 rows, go to page 2, open a sub-folder, press browser Back: page 2 shows. Switch the node quickly on `/data-browser`: the counts match the last node.

---

### Task 5: Crawlers page (11, 12, 13)

**Files:**
- Modify: `src/routes/data-browser/crawlers/+page.svelte`
- Modify: `src/lib/components/data-browser/CrawlerDialog.svelte`

- [ ] **Step 1: A run belongs to its node**

In `run(crawler)`: after the `await`, write the report only when `current.url === nodeUrl`. In `load()`, at the start, set `running = null`. A node switch then enables the buttons, and a late report of the old node goes nowhere.

- [ ] **Step 2: "Try again"**

In the `state === 'error'` branch, add `<Button variant="outline" onclick={load}>Try again</Button>` under the error text.

- [ ] **Step 3: Load the file list once per node**

In the page, memoize `loadPaths` per node URL, and pass whether the list was cut:

```ts
	let pathsLoad: { url: string; promise: Promise<string[]> } | null = null;

	function loadPaths(): Promise<string[]> {
		if (!node) return Promise.resolve([]);
		if (pathsLoad && pathsLoad.url === node.url) return pathsLoad.promise;

		const url = node.url;
		const promise = makeBeaconClient(node)
			.datasets({ limit: DATASET_LIST_LIMIT })
			.then((raw) => parseEntries(raw).map((entry) => entry.path));
		promise.catch(() => (pathsLoad = null));
		pathsLoad = { url, promise };
		return promise;
	}
```

The dialog and the folder picker both call this `loadPaths`, so one request serves both.

In `CrawlerDialog.svelte`, change the `empty` check to pass the cut flag: `!folderHasFiles(form.folder, paths, paths.length >= DATASET_LIST_LIMIT)`, and import `DATASET_LIST_LIMIT` from `@/data-browser/datasets`.

- [ ] **Step 4: Check**

Run: `npm run check`, `npx eslint src/routes/data-browser/crawlers src/lib/components/data-browser`
Manual: open New crawler and the folder picker: one `list-datasets` request. Start a long run, switch the node: the buttons are enabled and no report shows.

---

### Task 6: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-data-browser-design.md`
- Modify: `docs/superpowers/admin-mode-roadmap.md`

- [ ] **Step 1: Spec**

In the domain table, change the row `crawler-form.ts` to `crawlers.ts`, and add the row `upload.ts` | Upload plan, progress, stop and resume, hidden files. Add `datasets.ts` | Dataset entries, folder listing, search, sort, sizes, preview and SQL Editor queries.

Under "Datasets > Upload", add: "Hidden files are skipped, with a count." and "Stop marks the rest as stopped. Continue sends them; Retry failed sends the failed ones." Under "Upload", add: "Progress per byte shows for files above 50 MiB only (SDK chunked path). A smaller file shows 'uploading' until done."

Under "Crawlers > Create and edit", change the schedule line to: "Only on Run, or every N seconds, minutes or hours. A stored value keeps its exact seconds."

- [ ] **Step 2: Roadmap**

In the status table: row 2 build `Committed (69e3f67)`, row 3 `Committed (08adc20)`, row 4 `Committed (e824dcc)`, row 5 as it is plus `fixes: plans/2026-10-06-data-browser-fixes.md`. Keep the "Manual test still open" parts.

- [ ] **Step 3: Final checks**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/beacon-api src/lib/components/data-browser src/routes/data-browser`
Expected: all pass. Report the results to the user.
