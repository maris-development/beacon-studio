# Data Browser: Crawlers (step 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin-only Crawlers page: list crawlers as readable cards, create and edit them with a form, run them and show the run report, and delete them.

**Architecture:** Form and display rules go in `src/lib/data-browser/crawlers.ts` (plain TypeScript, unit tested). The run report comes from a temporary direct call in `src/lib/beacon-api/crawler-run.ts`, because the SDK's `admin.runCrawler()` returns `void`. Every other call uses the SDK through `withAdmin`. The page is an `adminOnly` menu item under Data Browser, and shows `AdminOnlyNotice` while admin features are off.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `@maris-development/beacon-client` 2.0.0, Vitest 3 with jsdom.

**Spec:** `docs/superpowers/specs/2026-10-06-data-browser-design.md` (sections "Shared parts", "Crawlers")
**Depends on:** steps 3 and 4 are built. Check that these exist: `src/lib/data-browser/back.ts`, `folders.ts`, `tables.ts`, `datasets.ts`, and `src/lib/components/data-browser/FolderPicker.svelte`. If one is missing, stop and report.
**Roadmap:** `docs/superpowers/admin-mode-roadmap.md` (update row 5 when done)

## Global Constraints

- Do not run `git commit` unless the user writes "commit". Never create a branch. No worktree.
- Edit files with the Edit or Write tool only. Never with `sed`, `perl` or `echo`.
- Tests go in `tests/` next to the code. Import with `../`.
- Prettier with tabs on new files only. SCSS only. No new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100.
- Prefer `if`/`else` over `?:` in script code. Markup expressions are exempt.
- Layer rule: `src/lib/data-browser/*` imports only SDK types and values, `src/lib/beacon-api/crawler-run.ts` types, `src/lib/sql/*` and other `src/lib/data-browser/*` files. `src/lib/beacon-api/crawler-run.ts` imports only the SDK.
- `crawler-run.ts` is temporary. Its header comment names the SDK issue: `admin.runCrawler()` returns `void` and drops the crawl report. Remove the file when an SDK release returns `CrawlReport`.
- Route: `/data-browser/crawlers`. Menu: Data Browser > Crawlers, `adminOnly: true`.
- Leave `event_driven` out of the form. Keep its stored value on Edit.
- Texts: notice `This page needs admin features. Turn on "Show admin features" in Settings.` / sign-in `Sign in to see the crawlers of <node name>.` / empty `No crawlers on this node, or the node could not list them.` / delete note `Tables that this crawler made stay. Delete them on the Tables page.` / empty folder `This folder holds no files. The crawler creates no tables.` / 409 `A crawler with this name exists.`

## Review Focus

- Edit a crawler whose `schedule_secs` is not a whole number of minutes (for example 90): the form shows a value that saves back to the same seconds, or the reviewer accepts the rounding. Test in Task 2.
- Edit keeps `event_driven: true` on a crawler that has it, although the form does not show it. Test in Task 2.
- A run that fails with a 401 (session expired): the sign-in dialog opens, and after a sign-in the run starts again with the new credentials. Test in Task 1 (the call throws `ApiError` 401), manual check in Task 5.
- A run report with failures: each failed table shows its reason. Test in Task 1, manual check in Task 5.
- The page with admin features off, opened by URL: only the notice shows, and no request goes out. Manual check in Task 5.

---

### Task 1: Temporary run call with report

**Files:**
- Create: `src/lib/beacon-api/crawler-run.ts`
- Test: `src/lib/beacon-api/tests/crawler-run.test.ts`

**Interfaces:**
- Produces:
  - `interface CrawlReport { crawler: string; discovered: number; created: string[]; updated: string[]; skipped: string[]; failed: [string, string][]; skippedFiles: number }`
  - `parseCrawlReport(raw: unknown): CrawlReport`
  - `runCrawlerReport(baseUrl: string, credentials: { username: string; password: string }, name: string, fetchImpl?: typeof fetch): Promise<CrawlReport>`. Throws the SDK `ApiError` on a non-2xx status and `ConnectionError` on a network failure, so `withAdmin` handles a 401 as for any SDK call.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/beacon-api/tests/crawler-run.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { parseCrawlReport, runCrawlerReport } from '../crawler-run';

const credentials = { username: 'alice', password: 'pw' };

const report = {
	crawler: 'argo',
	discovered: 3,
	created: ['argo_2024'],
	updated: ['argo_2023'],
	skipped: ['manual'],
	failed: [['argo_bad', 'unknown format']],
	skipped_files: 4
};

function respond(status: number, body: string) {
	return vi.fn().mockResolvedValue(new Response(body, { status }));
}

describe('parseCrawlReport', () => {
	it('reads the server report', () => {
		expect(parseCrawlReport(report)).toEqual({
			crawler: 'argo',
			discovered: 3,
			created: ['argo_2024'],
			updated: ['argo_2023'],
			skipped: ['manual'],
			failed: [['argo_bad', 'unknown format']],
			skippedFiles: 4
		});
	});

	it('fills gaps with empty values', () => {
		expect(parseCrawlReport({ crawler: 'x', failed: [['a']] })).toEqual({
			crawler: 'x',
			discovered: 0,
			created: [],
			updated: [],
			skipped: [],
			failed: [],
			skippedFiles: 0
		});
	});
});

describe('runCrawlerReport', () => {
	it('posts with Basic auth to the run endpoint, and returns the report', async () => {
		const fetchImpl = respond(200, JSON.stringify(report));

		const result = await runCrawlerReport('https://a.org', credentials, 'my crawler', fetchImpl);

		expect(result.created).toEqual(['argo_2024']);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://a.org/api/admin/crawlers/my%20crawler/run');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toMatch(/^Basic /);
	});

	it('throws ApiError with the decoded body on a 400', async () => {
		const fetchImpl = respond(400, JSON.stringify('crawl produced no report'));

		const error = await runCrawlerReport('https://a.org', credentials, 'x', fetchImpl).catch((e) => e);

		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(400);
		expect(error.body).toBe('crawl produced no report');
	});

	it('throws ApiError on a 401, so withAdmin asks for a sign-in', async () => {
		const error = await runCrawlerReport('https://a.org', credentials, 'x', respond(401, '')).catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(401);
	});

	it('throws ConnectionError when the node cannot be reached', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		const error = await runCrawlerReport('https://a.org', credentials, 'x', fetchImpl).catch((e) => e);
		expect(error).toBeInstanceOf(ConnectionError);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/beacon-api`
Expected: FAIL with a missing-module error for `../crawler-run`.

- [ ] **Step 3: Write `crawler-run.ts`**

Create `src/lib/beacon-api/crawler-run.ts`:

```ts
/**
 * TEMPORARY. The SDK `admin.runCrawler()` returns `void` and drops the crawl report
 * that the server sends. This file calls the endpoint itself until an SDK release
 * returns the report. Then delete this file and use `admin.runCrawler()`.
 */

import { ApiError, ConnectionError, basicAuthHeader } from '@maris-development/beacon-client';

export interface CrawlReport {
	crawler: string;
	/** Candidate tables found. */
	discovered: number;
	created: string[];
	updated: string[];
	/** Tables that this crawler does not own. */
	skipped: string[];
	/** Table name and the reason. */
	failed: [string, string][];
	/** Files that matched no format. */
	skippedFiles: number;
}

function names(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
}

function count(value: unknown): number {
	if (typeof value === 'number') return value;
	return 0;
}

export function parseCrawlReport(raw: unknown): CrawlReport {
	const record = (raw ?? {}) as Record<string, unknown>;

	let failed: [string, string][] = [];
	if (Array.isArray(record.failed)) {
		failed = record.failed
			.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2)
			.map((pair) => [String(pair[0]), String(pair[1])]);
	}

	let crawler = '';
	if (typeof record.crawler === 'string') crawler = record.crawler;

	return {
		crawler,
		discovered: count(record.discovered),
		created: names(record.created),
		updated: names(record.updated),
		skipped: names(record.skipped),
		failed,
		skippedFiles: count(record.skipped_files)
	};
}

// The server sends an error as a JSON string. The SDK decodes it the same way.
function decodeBody(text: string): string {
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed === 'string') return parsed;
	} catch {
		// Plain text body.
	}
	return text;
}

export async function runCrawlerReport(
	baseUrl: string,
	credentials: { username: string; password: string },
	name: string,
	fetchImpl: typeof fetch = fetch
): Promise<CrawlReport> {
	const url = `${baseUrl}/api/admin/crawlers/${encodeURIComponent(name)}/run`;

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: 'POST',
			headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) }
		});
	} catch (cause) {
		throw new ConnectionError(url, cause);
	}

	const text = await response.text();
	if (!response.ok) throw new ApiError(response.status, decodeBody(text), url);

	return parseCrawlReport(JSON.parse(text));
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/beacon-api`
Expected: PASS. If `basicAuthHeader` returns the value without the `Basic ` prefix, add the prefix in `runCrawlerReport` and keep the test.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/beacon-api/crawler-run.ts src/lib/beacon-api/tests`, `npm run check`, `npx eslint src/lib/beacon-api/crawler-run.ts src/lib/beacon-api/tests`
Expected: no errors.

---

### Task 2: Crawler form and display rules

**Files:**
- Create: `src/lib/data-browser/crawlers.ts`
- Test: `src/lib/data-browser/tests/crawlers.test.ts`

**Interfaces:**
- Consumes: `normalizeFolder` (`../folders`).
- Produces:
  - `CRAWLER_FORMATS: { value: string; label: string }[]` (9 entries)
  - `type TableNaming = 'leaf_prefix' | 'crawler_prefixed'`
  - `interface Crawler { name: string; targetPrefix: string; formatFilter: string[] | null; tableNaming: TableNaming; detectPartitions: boolean; scheduleSecs: number | null; eventDriven: boolean; options: Record<string, string> }`
  - `parseCrawlers(raw: unknown): Crawler[]`
  - `type ScheduleUnit = 'minutes' | 'hours'`
  - `interface CrawlerForm { name: string; folder: string; formats: string[]; naming: TableNaming; detectPartitions: boolean; scheduled: boolean; every: number; unit: ScheduleUnit; options: { key: string; value: string }[]; eventDriven: boolean }`
  - `emptyCrawlerForm(): CrawlerForm`
  - `formFromCrawler(crawler: Crawler): CrawlerForm`
  - `crawlerRequest(form: CrawlerForm, replace: boolean): Record<string, unknown>`
  - `crawlerErrors(form: CrawlerForm): string[]`
  - `describeSchedule(secs: number | null): string`
  - `describeFormats(filter: string[] | null): string`
  - `describeNaming(naming: TableNaming): string`
  - `tableNameExample(form: CrawlerForm): string`
  - `folderHasFiles(folder: string, paths: string[]): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data-browser/tests/crawlers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	crawlerErrors,
	crawlerRequest,
	describeFormats,
	describeSchedule,
	emptyCrawlerForm,
	folderHasFiles,
	formFromCrawler,
	parseCrawlers,
	tableNameExample,
	type Crawler
} from '../crawlers';

const server = {
	name: 'argo',
	target_prefix: 'argo/',
	format_filter: ['parquet', 'nc'],
	table_naming: 'crawler_prefixed',
	detect_partitions: true,
	schedule_secs: 21600,
	event_driven: true,
	options: { read_dimensions: 'lat,lon' }
};

const crawler: Crawler = {
	name: 'argo',
	targetPrefix: 'argo/',
	formatFilter: ['parquet', 'nc'],
	tableNaming: 'crawler_prefixed',
	detectPartitions: true,
	scheduleSecs: 21600,
	eventDriven: true,
	options: { read_dimensions: 'lat,lon' }
};

describe('parseCrawlers', () => {
	it('reads the server view and drops bad entries', () => {
		expect(parseCrawlers([server, { nope: 1 }, 'junk'])).toEqual([crawler]);
	});

	it('fills defaults for missing fields', () => {
		expect(parseCrawlers([{ name: 'x', target_prefix: 'x/' }])).toEqual([
			{
				name: 'x',
				targetPrefix: 'x/',
				formatFilter: null,
				tableNaming: 'leaf_prefix',
				detectPartitions: true,
				scheduleSecs: null,
				eventDriven: false,
				options: {}
			}
		]);
	});
});

describe('form round trip', () => {
	it('gives the same request after load and save, with replace', () => {
		const request = crawlerRequest(formFromCrawler(crawler), true);
		expect(request).toEqual({ ...server, replace: true });
	});

	it('keeps event_driven, which the form does not show', () => {
		expect(crawlerRequest(formFromCrawler(crawler), true).event_driven).toBe(true);
		expect(crawlerRequest(emptyCrawlerForm(), false).event_driven).toBe(false);
	});

	it('shows a schedule in hours when it divides by an hour, else in minutes', () => {
		expect(formFromCrawler({ ...crawler, scheduleSecs: 7200 })).toMatchObject({ scheduled: true, every: 2, unit: 'hours' });
		expect(formFromCrawler({ ...crawler, scheduleSecs: 900 })).toMatchObject({ scheduled: true, every: 15, unit: 'minutes' });
		expect(formFromCrawler({ ...crawler, scheduleSecs: null })).toMatchObject({ scheduled: false });
	});

	it('rounds a schedule of odd seconds up to whole minutes', () => {
		const form = formFromCrawler({ ...crawler, scheduleSecs: 90 });
		expect(form).toMatchObject({ every: 2, unit: 'minutes' });
		expect(crawlerRequest(form, true).schedule_secs).toBe(120);
	});
});

describe('crawlerRequest', () => {
	it('sends null formats for none checked, no schedule, and no empty options', () => {
		const form = { ...emptyCrawlerForm(), name: ' wod ', folder: '/wod', options: [{ key: ' ', value: 'x' }] };
		expect(crawlerRequest(form, false)).toEqual({
			name: 'wod',
			target_prefix: 'wod/',
			format_filter: null,
			table_naming: 'leaf_prefix',
			detect_partitions: true,
			schedule_secs: null,
			event_driven: false,
			options: {},
			replace: false
		});
	});
});

describe('crawlerErrors', () => {
	it('asks for a name, a folder and a schedule above zero', () => {
		const form = { ...emptyCrawlerForm(), scheduled: true, every: 0 };
		expect(crawlerErrors(form)).toEqual([
			'Enter a crawler name.',
			'Pick a folder.',
			'Enter a schedule of at least 1.'
		]);
	});

	it('accepts a complete form', () => {
		expect(crawlerErrors(formFromCrawler(crawler))).toEqual([]);
	});
});

describe('display', () => {
	it('describes a schedule', () => {
		expect(describeSchedule(null)).toBe('Only on Run');
		expect(describeSchedule(3600)).toBe('Every hour');
		expect(describeSchedule(21600)).toBe('Every 6 hours');
		expect(describeSchedule(60)).toBe('Every minute');
		expect(describeSchedule(900)).toBe('Every 15 minutes');
		expect(describeSchedule(90)).toBe('Every 90 seconds');
	});

	it('describes formats with labels', () => {
		expect(describeFormats(null)).toBe('All formats');
		expect(describeFormats(['nc', 'parquet'])).toBe('NetCDF, Parquet');
		expect(describeFormats(['xyz'])).toBe('xyz');
	});

	it('gives a table name example for both naming modes', () => {
		const form = { ...emptyCrawlerForm(), name: 'argo', folder: 'data/floats/' };
		expect(tableNameExample(form)).toBe('floats');
		expect(tableNameExample({ ...form, naming: 'crawler_prefixed' })).toBe('argo_floats');
		expect(tableNameExample({ ...form, folder: '' })).toBe('<folder>');
	});

	it('checks that a folder holds files', () => {
		expect(folderHasFiles('argo/', ['argo/a.nc'])).toBe(true);
		expect(folderHasFiles('argo', ['argos/a.nc'])).toBe(false);
		expect(folderHasFiles('', ['a.nc'])).toBe(true);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/data-browser`
Expected: FAIL with a missing-module error for `../crawlers`.

- [ ] **Step 3: Write `crawlers.ts`**

Create `src/lib/data-browser/crawlers.ts`:

```ts
import { normalizeFolder } from './folders';

export const CRAWLER_FORMATS = [
	{ value: 'parquet', label: 'Parquet' },
	{ value: 'nc', label: 'NetCDF' },
	{ value: 'csv', label: 'CSV' },
	{ value: 'zarr', label: 'Zarr' },
	{ value: 'atlas', label: 'Atlas' },
	{ value: 'arrow', label: 'Arrow' },
	{ value: 'odv', label: 'ODV' },
	{ value: 'tiff', label: 'GeoTIFF' },
	{ value: 'bbf', label: 'BBF' }
];

export type TableNaming = 'leaf_prefix' | 'crawler_prefixed';

export interface Crawler {
	name: string;
	targetPrefix: string;
	/** `null` means every format. */
	formatFilter: string[] | null;
	tableNaming: TableNaming;
	detectPartitions: boolean;
	/** `null` means only on Run. */
	scheduleSecs: number | null;
	/** The server does not use it yet. The form keeps it on Edit. */
	eventDriven: boolean;
	options: Record<string, string>;
}

/** Reads `GET /api/admin/crawlers`. */
export function parseCrawlers(raw: unknown): Crawler[] {
	if (!Array.isArray(raw)) return [];

	const result: Crawler[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		if (typeof record.name !== 'string' || typeof record.target_prefix !== 'string') continue;

		let formatFilter: string[] | null = null;
		if (Array.isArray(record.format_filter)) {
			formatFilter = record.format_filter.filter((value): value is string => typeof value === 'string');
		}

		let tableNaming: TableNaming = 'leaf_prefix';
		if (record.table_naming === 'crawler_prefixed') tableNaming = 'crawler_prefixed';

		let scheduleSecs: number | null = null;
		if (typeof record.schedule_secs === 'number') scheduleSecs = record.schedule_secs;

		const options: Record<string, string> = {};
		if (record.options && typeof record.options === 'object') {
			for (const [key, value] of Object.entries(record.options as Record<string, unknown>)) {
				options[key] = String(value);
			}
		}

		result.push({
			name: record.name,
			targetPrefix: record.target_prefix,
			formatFilter,
			tableNaming,
			detectPartitions: record.detect_partitions !== false,
			scheduleSecs,
			eventDriven: record.event_driven === true,
			options
		});
	}

	return result;
}

export type ScheduleUnit = 'minutes' | 'hours';

export interface CrawlerForm {
	name: string;
	folder: string;
	formats: string[];
	naming: TableNaming;
	detectPartitions: boolean;
	scheduled: boolean;
	every: number;
	unit: ScheduleUnit;
	options: { key: string; value: string }[];
	eventDriven: boolean;
}

export function emptyCrawlerForm(): CrawlerForm {
	return {
		name: '',
		folder: '',
		formats: [],
		naming: 'leaf_prefix',
		detectPartitions: true,
		scheduled: false,
		every: 1,
		unit: 'hours',
		options: [],
		eventDriven: false
	};
}

// The form holds whole minutes or hours. Odd seconds round up to the next minute.
export function formFromCrawler(crawler: Crawler): CrawlerForm {
	let scheduled = false;
	let every = 1;
	let unit: ScheduleUnit = 'hours';

	if (crawler.scheduleSecs !== null && crawler.scheduleSecs > 0) {
		scheduled = true;
		if (crawler.scheduleSecs % 3600 === 0) {
			every = crawler.scheduleSecs / 3600;
		} else {
			unit = 'minutes';
			every = Math.ceil(crawler.scheduleSecs / 60);
		}
	}

	return {
		name: crawler.name,
		folder: crawler.targetPrefix,
		formats: crawler.formatFilter ?? [],
		naming: crawler.tableNaming,
		detectPartitions: crawler.detectPartitions,
		scheduled,
		every,
		unit,
		options: Object.entries(crawler.options).map(([key, value]) => ({ key, value })),
		eventDriven: crawler.eventDriven
	};
}

/** The body of `POST /api/admin/crawlers`. */
export function crawlerRequest(form: CrawlerForm, replace: boolean): Record<string, unknown> {
	let formatFilter: string[] | null = null;
	if (form.formats.length > 0) formatFilter = form.formats;

	let scheduleSecs: number | null = null;
	if (form.scheduled) {
		let factor = 3600;
		if (form.unit === 'minutes') factor = 60;
		scheduleSecs = form.every * factor;
	}

	const options: Record<string, string> = {};
	for (const option of form.options) {
		if (option.key.trim() !== '') options[option.key.trim()] = option.value;
	}

	return {
		name: form.name.trim(),
		target_prefix: normalizeFolder(form.folder),
		format_filter: formatFilter,
		table_naming: form.naming,
		detect_partitions: form.detectPartitions,
		schedule_secs: scheduleSecs,
		event_driven: form.eventDriven,
		options,
		replace
	};
}

export function crawlerErrors(form: CrawlerForm): string[] {
	const errors: string[] = [];

	if (form.name.trim() === '') errors.push('Enter a crawler name.');
	if (normalizeFolder(form.folder) === '') errors.push('Pick a folder.');
	if (form.scheduled && (!Number.isInteger(form.every) || form.every < 1)) {
		errors.push('Enter a schedule of at least 1.');
	}

	return errors;
}

export function describeSchedule(secs: number | null): string {
	if (secs === null || secs <= 0) return 'Only on Run';
	if (secs === 3600) return 'Every hour';
	if (secs % 3600 === 0) return `Every ${secs / 3600} hours`;
	if (secs === 60) return 'Every minute';
	if (secs % 60 === 0) return `Every ${secs / 60} minutes`;
	return `Every ${secs} seconds`;
}

export function describeFormats(filter: string[] | null): string {
	if (filter === null || filter.length === 0) return 'All formats';

	return filter
		.map((value) => CRAWLER_FORMATS.find((format) => format.value === value)?.label ?? value)
		.join(', ');
}

export function describeNaming(naming: TableNaming): string {
	if (naming === 'crawler_prefixed') return 'Crawler name + folder name';
	return 'Folder name';
}

/** The name of a table from the chosen folder. The crawler uses each sub-folder the same way. */
export function tableNameExample(form: CrawlerForm): string {
	const parts = normalizeFolder(form.folder).split('/').filter((part) => part !== '');
	const leaf = parts[parts.length - 1] ?? '<folder>';

	if (form.naming === 'crawler_prefixed') return `${form.name.trim() || '<crawler>'}_${leaf}`;
	return leaf;
}

export function folderHasFiles(folder: string, paths: string[]): boolean {
	const prefix = normalizeFolder(folder);
	return paths.some((path) => path.startsWith(prefix));
}
```

Note: the 9 formats come from `beacon-web` `pages/crawlers.tsx:32-42`. The round-trip test compares the request with the server view, so key order does not matter (`toEqual`).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/data-browser`
Expected: PASS.

- [ ] **Step 5: Format and check**

Run: `npx prettier --write src/lib/data-browser`, `npm run check`, `npx eslint src/lib/data-browser`
Expected: no errors.

---

### Task 3: Components

**Files:**
- Create: `src/lib/components/data-browser/AdminOnlyNotice.svelte`
- Create: `src/lib/components/data-browser/CrawlerReport.svelte`
- Create: `src/lib/components/data-browser/CrawlerDialog.svelte`

**Interfaces:**
- Consumes: Task 1 (`CrawlReport`), Task 2 (all of `crawlers.ts`), `FolderPicker` (step 3), `withAdmin`, `adminErrorMessage`.
- Produces:
  - `AdminOnlyNotice` (no props)
  - `CrawlerReport` props `{ report: CrawlReport; tableHref: (name: string) => string }`
  - `CrawlerDialog` props `{ node: BeaconNode; crawler: Crawler | null; loadPaths: () => Promise<string[]>; onClose: () => void; onSaved: () => void }`. `crawler: null` creates; a crawler edits.

- [ ] **Step 1: Create `AdminOnlyNotice.svelte`**

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<p class="notice">
	This page needs admin features. Turn on "Show admin features" in
	<a href={resolve('/settings')}>Settings</a>.
</p>

<style lang="scss">
	.notice {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		color: var(--muted-foreground);
	}
</style>
```

- [ ] **Step 2: Create `CrawlerReport.svelte`**

```svelte
<script lang="ts">
	import type { CrawlReport } from '@/beacon-api/crawler-run';

	let { report, tableHref }: { report: CrawlReport; tableHref: (name: string) => string } = $props();
</script>

<div class="report">
	<p>Found {report.discovered} tables.</p>

	{#if report.created.length > 0}
		<p>
			<strong>Created:</strong>
			{#each report.created as name, index (name)}
				{#if index > 0}, {/if}<a href={tableHref(name)}>{name}</a>
			{/each}
		</p>
	{/if}

	{#if report.updated.length > 0}
		<p>
			<strong>Updated:</strong>
			{#each report.updated as name, index (name)}
				{#if index > 0}, {/if}<a href={tableHref(name)}>{name}</a>
			{/each}
		</p>
	{/if}

	{#if report.skipped.length > 0}
		<p><strong>Skipped (owned by another crawler or made by hand):</strong> {report.skipped.join(', ')}</p>
	{/if}

	{#if report.failed.length > 0}
		<div class="failed">
			<strong>Failed:</strong>
			<ul>
				{#each report.failed as [name, reason] (name)}
					<li><span class="name">{name}</span>: {reason}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if report.skippedFiles > 0}
		<p class="muted">{report.skippedFiles} files matched no format.</p>
	{/if}
</div>

<style lang="scss">
	.report {
		margin-top: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: var(--secondary);
		font-size: 0.875rem;

		p {
			margin: 0 0 0.375rem;
		}
	}

	.failed {
		color: var(--destructive);

		ul {
			margin: 0.25rem 0 0;
			padding-left: 1.25rem;
		}
	}

	.name {
		font-family: monospace;
	}

	.muted {
		color: var(--muted-foreground);
	}
</style>
```

- [ ] **Step 3: Create `CrawlerDialog.svelte`**

```svelte
<script lang="ts">
	import { ApiError } from '@maris-development/beacon-client';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import FolderPicker from '@/components/data-browser/FolderPicker.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import {
		CRAWLER_FORMATS,
		crawlerErrors,
		crawlerRequest,
		emptyCrawlerForm,
		folderHasFiles,
		formFromCrawler,
		tableNameExample,
		type Crawler,
		type CrawlerForm
	} from '@/data-browser/crawlers';

	type Props = {
		node: BeaconNode;
		crawler: Crawler | null;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onSaved: () => void;
	};

	let { node, crawler, loadPaths, onClose, onSaved }: Props = $props();

	const editing = crawler !== null;

	let form: CrawlerForm = $state(crawler ? formFromCrawler(crawler) : emptyCrawlerForm());
	let errors: string[] = $state([]);
	let busy = $state(false);
	let paths: string[] | null = $state(null);

	let empty = $derived(paths !== null && form.folder.trim() !== '' && !folderHasFiles(form.folder, paths));

	$effect(() => {
		loadPaths().then(
			(value) => (paths = value),
			() => (paths = null)
		);
	});

	function toggleFormat(value: string) {
		if (form.formats.includes(value)) {
			form.formats = form.formats.filter((item) => item !== value);
		} else {
			form.formats = [...form.formats, value];
		}
	}

	async function save() {
		errors = crawlerErrors(form);
		if (errors.length > 0) return;

		busy = true;
		const body = crawlerRequest(form, editing);

		try {
			const done = await withAdmin(node, async (client) => {
				await client.admin.createCrawler(body);
				return true;
			});
			if (done) onSaved();
		} catch (caught) {
			if (caught instanceof ApiError && caught.status === 409) {
				errors = ['A crawler with this name exists.'];
			} else {
				errors = [adminErrorMessage(caught)];
			}
		} finally {
			busy = false;
		}
	}
</script>

<Modal title={editing ? `Edit crawler ${form.name}` : 'New crawler'} onClose={onClose} canCloseModal={!busy} width="640px">
	<div class="form">
		<div class="field">
			<Label for="crawler-name">Name</Label>
			<Input id="crawler-name" bind:value={form.name} disabled={editing} />
		</div>

		<div class="field">
			<Label for="crawler-folder">Folder</Label>
			<div class="row">
				<Input id="crawler-folder" bind:value={form.folder} placeholder="argo/" />
				<FolderPicker {loadPaths} onPick={(folder) => (form.folder = folder)} />
			</div>
			{#if empty}
				<span class="warning">This folder holds no files. The crawler creates no tables.</span>
			{/if}
		</div>

		<fieldset class="field">
			<legend>Formats</legend>
			<div class="checks">
				{#each CRAWLER_FORMATS as format (format.value)}
					<label>
						<input
							type="checkbox"
							checked={form.formats.includes(format.value)}
							onchange={() => toggleFormat(format.value)}
						/>
						{format.label}
					</label>
				{/each}
			</div>
			<span class="hint">None checked means all formats.</span>
		</fieldset>

		<fieldset class="field">
			<legend>Table names</legend>
			<label>
				<input type="radio" bind:group={form.naming} value="leaf_prefix" />
				Folder name
			</label>
			<label>
				<input type="radio" bind:group={form.naming} value="crawler_prefixed" />
				Crawler name + folder name
			</label>
			<span class="hint">Example: {tableNameExample(form)}</span>
		</fieldset>

		<label class="check">
			<input type="checkbox" bind:checked={form.detectPartitions} />
			Find partitions in folder names (key=value/)
		</label>

		<fieldset class="field">
			<legend>Schedule</legend>
			<label>
				<input type="radio" bind:group={form.scheduled} value={false} />
				Only on Run
			</label>
			<div class="row">
				<label>
					<input type="radio" bind:group={form.scheduled} value={true} />
					Every
				</label>
				<input class="every" type="number" min="1" step="1" bind:value={form.every} disabled={!form.scheduled} />
				<select bind:value={form.unit} disabled={!form.scheduled}>
					<option value="minutes">minutes</option>
					<option value="hours">hours</option>
				</select>
			</div>
		</fieldset>

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

		{#each errors as message (message)}
			<p class="error" role="alert">{message}</p>
		{/each}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
		<Button onclick={save} disabled={busy}>Save</Button>
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
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.25rem;
		font-weight: 500;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.every {
		width: 5rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
	}

	select {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--background);
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.warning,
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: 0.875rem;
	}

	.icon {
		display: flex;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
```

Notes for the implementer:
- `crawler ? formFromCrawler(crawler) : emptyCrawlerForm()` in `$state(...)` is script code. Write it with `if`/`else` in a small function `initialForm()`.
- `title={editing ? ... : ...}` is markup, so `?:` is fine there.
- The `$effect` that loads the paths runs once; it reads no state.

- [ ] **Step 4: Format and check**

Run: `npx prettier --write src/lib/components/data-browser`, `npm run check`, `npx eslint src/lib/components/data-browser`
Expected: no errors.

---

### Task 4: Crawlers page and menu

**Files:**
- Create: `src/routes/data-browser/crawlers/+page.svelte`
- Modify: `src/lib/components/sidebar/AppSidebar.svelte` (the Data Browser `children`, around line 80)

**Interfaces:**
- Consumes: Tasks 1-3. `NodePicker`, `makeBeaconClient`, `currentNode`, `normalizeUrl` (`@/services/beacon-node`), `withAdmin`, `credentialsOf`, `adminErrorMessage` (`@/services/admin-session`), `askConfirm`, `addToast`, `settings`. `withBack` (step 3). `parseEntries` (step 4).

- [ ] **Step 1: Add the menu item**

In `src/lib/components/sidebar/AppSidebar.svelte`, in the Data Browser item, change `children` to:

```ts
					children: [
						{ title: 'Datasets', url: resolve('/data-browser/datasets') },
						{ title: 'Data Tables', url: resolve('/data-browser/data-tables') },
						{ title: 'Crawlers', url: resolve('/data-browser/crawlers'), adminOnly: true }
					]
```

`resolve('/data-browser/crawlers')` needs the route to exist. Create the page in Step 2 before you run the check.

- [ ] **Step 2: Create the page**

Create `src/routes/data-browser/crawlers/+page.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminOnlyNotice from '@/components/data-browser/AdminOnlyNotice.svelte';
	import CrawlerDialog from '@/components/data-browser/CrawlerDialog.svelte';
	import CrawlerReport from '@/components/data-browser/CrawlerReport.svelte';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { runCrawlerReport, type CrawlReport } from '@/beacon-api/crawler-run';
	import { currentNode, normalizeUrl } from '@/services/beacon-node';
	import { adminErrorMessage, credentialsOf, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { settings } from '@/stores/settings';
	import { withBack } from '@/data-browser/back';
	import {
		describeFormats,
		describeNaming,
		describeSchedule,
		parseCrawlers,
		type Crawler
	} from '@/data-browser/crawlers';
	import { DATASET_LIST_LIMIT, parseEntries } from '@/data-browser/datasets';

	type State = 'idle' | 'loading' | 'needs-sign-in' | 'ready' | 'error';

	let state: State = $state('idle');
	let crawlers: Crawler[] = $state([]);
	let error = $state('');
	let running: string | null = $state(null);
	let reports: Record<string, CrawlReport> = $state({});
	let dialog: { crawler: Crawler | null } | null = $state(null);

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let admin = $derived($settings.adminFeatures);

	// Opening this page counts as an admin action, so it can ask for a sign-in.
	$effect(() => {
		if (!admin || !nodeUrl) return;
		untrack(() => load());
	});

	async function load() {
		const current = node;
		if (!current) return;

		state = 'loading';
		reports = {};

		try {
			const raw = await withAdmin(current, (client) => client.admin.listCrawlers<unknown>());
			if (current.url !== nodeUrl) return;

			if (raw === null) {
				state = 'needs-sign-in';
				return;
			}

			crawlers = parseCrawlers(raw).sort((a, b) => a.name.localeCompare(b.name));
			state = 'ready';
		} catch (caught) {
			if (current.url === nodeUrl) {
				error = adminErrorMessage(caught);
				state = 'error';
			}
		}
	}

	async function loadPaths(): Promise<string[]> {
		if (!node) return [];
		const raw = await makeBeaconClient(node).datasets({ limit: DATASET_LIST_LIMIT });
		return parseEntries(raw).map((entry) => entry.path);
	}

	async function run(crawler: Crawler) {
		const current = node;
		if (!current || running) return;

		running = crawler.name;

		try {
			// The credentials are read inside, so a retry after a new sign-in uses the new ones.
			const report = await withAdmin(current, () => {
				const credentials = credentialsOf(current.id);
				if (!credentials) throw new Error('No admin session.');
				return runCrawlerReport(normalizeUrl(current.url), credentials, crawler.name);
			});
			if (report !== null) reports[crawler.name] = report;
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			running = null;
		}
	}

	async function remove(crawler: Crawler) {
		const current = node;
		if (!current) return;

		const sure = await askConfirm({
			title: `Delete crawler ${crawler.name}`,
			message: `Delete the crawler "${crawler.name}" from ${current.name}?`,
			note: 'Tables that this crawler made stay. Delete them on the Tables page.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!sure) return;

		try {
			const done = await withAdmin(current, async (client) => {
				await client.admin.dropCrawler(crawler.name);
				return true;
			});
			if (done) {
				addToast({ type: 'success', message: `Deleted the crawler ${crawler.name}.` });
				await load();
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		}
	}

	function tableHref(name: string): string {
		if (!node) return '#';
		const query = new URLSearchParams({ table_name: name, node: node.url }).toString();
		return withBack(`${resolve('/data-browser/data-tables/detail')}?${query}`, `${page.url.pathname}${page.url.search}`);
	}

	async function onSaved() {
		dialog = null;
		await load();
	}
</script>

<svelte:head>
	<title>Crawlers - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Crawlers', href: resolve('/data-browser/crawlers') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Crawlers</h1>

		<p>A crawler scans a folder of the node and creates a table for each group of files.</p>

		{#if !admin}
			<AdminOnlyNotice />
		{:else}
			<NodePicker>
				{#snippet actions()}
					<Button variant="outline" disabled={!node || state !== 'ready'} onclick={() => (dialog = { crawler: null })}>
						<PlusIcon />
						New crawler
					</Button>
				{/snippet}
			</NodePicker>

			{#if !node}
				<p>Pick a Beacon node.</p>
			{:else if state === 'loading'}
				<p class="muted">Loading the crawlers...</p>
			{:else if state === 'needs-sign-in'}
				<p>Sign in to see the crawlers of {node.name}.</p>
				<Button onclick={load}>Sign in</Button>
			{:else if state === 'error'}
				<p class="error">{error}</p>
			{:else if state === 'ready' && crawlers.length === 0}
				<p class="muted">No crawlers on this node, or the node could not list them.</p>
			{:else if state === 'ready'}
				<ul class="cards">
					{#each crawlers as crawler (crawler.name)}
						<li class="card">
							<div class="card-head">
								<h3>{crawler.name}</h3>
								<div class="card-actions">
									<Button size="sm" disabled={running !== null} onclick={() => run(crawler)}>
										<PlayIcon />
										{#if running === crawler.name}Busy...{:else}Run{/if}
									</Button>
									<Button size="sm" variant="outline" disabled={running !== null} onclick={() => (dialog = { crawler })}>Edit</Button>
									<Button size="sm" variant="destructive" disabled={running !== null} onclick={() => remove(crawler)}>Delete</Button>
								</div>
							</div>

							<dl>
								<dt>Folder</dt><dd class="mono">{crawler.targetPrefix}</dd>
								<dt>Formats</dt><dd>{describeFormats(crawler.formatFilter)}</dd>
								<dt>Table names</dt><dd>{describeNaming(crawler.tableNaming)}</dd>
								<dt>Partitions</dt><dd>{crawler.detectPartitions ? 'On' : 'Off'}</dd>
								<dt>Schedule</dt><dd>{describeSchedule(crawler.scheduleSecs)}</dd>
								<dt>Options</dt><dd>{Object.keys(crawler.options).length}</dd>
							</dl>

							{#if reports[crawler.name]}
								<CrawlerReport report={reports[crawler.name]} {tableHref} />
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

{#if dialog && node}
	<CrawlerDialog {node} crawler={dialog.crawler} {loadPaths} onClose={() => (dialog = null)} {onSaved} />
{/if}

<style lang="scss">
	.cards {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;

		h3 {
			margin: 0;
		}
	}

	.card-actions {
		display: flex;
		gap: 0.5rem;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0.75rem 0 0;
		font-size: 0.875rem;
	}

	dt {
		color: var(--muted-foreground);
	}

	dd {
		margin: 0;
	}

	.mono {
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
- `state` as a variable name clashed with the `$state` rune in step 2. If `svelte-check` complains, rename it to `phase` everywhere in this file.
- The table links in a report have no `catalog` or `schema`, so they open the table in the default schema. A crawler creates its tables there.
- The crawlers list does not reload after a run. A run changes tables, not crawlers.

- [ ] **Step 3: Check**

Run: `npm test`, `npm run check`, `npx eslint src/routes/data-browser/crawlers src/lib/components/sidebar/AppSidebar.svelte`, `npx prettier --write src/routes/data-browser/crawlers/+page.svelte`
Expected: no errors.

---

### Task 5: Docs, checks and manual test

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/admin-mode-roadmap.md`

- [ ] **Step 1: Update AGENTS.md**

In section "API Client Strategy (Important)", add a bullet:

```markdown
- One temporary exception: `src/lib/beacon-api/crawler-run.ts` calls `POST /api/admin/crawlers/{name}/run` itself, because the SDK `admin.runCrawler()` returns `void` and drops the crawl report. Delete the file when an SDK release returns the report. Add no other direct calls.
```

- [ ] **Step 2: Run every check**

Run: `npm test`, `npm run check`, `npx eslint src/lib/data-browser src/lib/beacon-api/crawler-run.ts src/lib/components/data-browser src/routes/data-browser`
Expected: all pass.

- [ ] **Step 3: Manual test**

Run `npm run dev`. Use a node with a folder of files and its admin credentials.

1. Settings off: the sidebar has no "Crawlers". Open `/data-browser/crawlers` by URL: only the notice shows, and the network tab shows no request to `/api/admin/crawlers`.
2. Settings on: "Crawlers" shows under Data Browser. Open it with no session: the sign-in dialog opens. Cancel: "Sign in to see the crawlers of …" with a Sign in button. Sign in: the list loads.
3. New crawler: pick a folder with the folder picker. The table name example changes with the naming choice. Pick an empty folder name by hand: the warning shows. Save with no name: the errors show.
4. Save a valid crawler with "Every 15 minutes". Its card shows "Every 15 minutes".
5. Run it: the button is busy; the report shows Created with links. Click a link: the table detail opens, and "← Tables" goes to the plain list.
6. Run it again: the tables show under Updated.
7. Edit it: the name is read-only; the form shows the saved values. Change the formats and save. The card shows the new formats.
8. Create a second crawler with the same name: "A crawler with this name exists."
9. Delete the crawler: the confirm says the tables stay. The card goes. The tables are still on the Tables page.
10. Sign out under the node picker, then press Run on another crawler: the sign-in dialog opens, and the run starts after a sign-in.

- [ ] **Step 4: Update the roadmap**

Set row 5 of the status table: plan link `[plan](plans/2026-10-06-data-browser-crawlers.md)` and the build status with the date and the results. Report each failed manual step to the user with what you saw.
