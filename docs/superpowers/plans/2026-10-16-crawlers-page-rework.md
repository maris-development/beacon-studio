# Crawlers Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/data-browser/crawlers` and `CrawlerDialog` to match GitHub issue #159. The API calls and the request shape stay the same.

**Architecture:** The form model in `lib/data-browser/crawlers.ts` changes first: one timer field in seconds, and one options text. Pure functions parse and print the options text. The dialog and the page then change their markup only. The page keeps its load, run and delete logic.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, Vitest, svelte-i18n, lucide icons.

**Spec:** GitHub issue #159 (parent #165). Also `docs/superpowers/specs/2026-10-06-data-browser-design.md`, section "Create and edit".

## Global Constraints

- Admin mode follows the GitHub issues of #165. Where `docs/superpowers/admin-mode-roadmap.md` disagrees, the issue wins.
- The request body of `crawlerRequest(form, replace)` keeps its keys: `name, target_prefix, format_filter, table_naming, detect_partitions, schedule_secs, event_driven, options, replace`.
- Do not touch the crawler cards, `CrawlerReport.svelte`, `beacon-api/crawler-run.ts` or the API calls.
- Every visible string comes from the catalog, placeholders too (ESLint `no-restricted-syntax`).
- Update all four catalogs: `en`, `es`, `it`, `nl`. The issue names three, but `SUPPORTED_LOCALES` also holds `es`.
- SCSS only. `font-size` only through `--font-size-*` tokens.
- Prefer `if`/`else` over `?:` in script code.
- Match the indentation of each file (tabs in these files).
- Run `git commit` only when the user writes "commit". Commit on `feature/admin-mode`. Messages: imperative, about 50 characters, no prefix.
- Docs URL, exact: `https://maris-development.github.io/beacon/docs/latest/server/crawlers.html`.
- Timer minimum: `MIN_SCHEDULE_SECS = 60` (exists).
- Mockups: the three images of 2026-10-16 (page with admin session and no crawlers, page with no session, New crawler dialog). They win over the issue text on layout.
- Decision of the user (2026-10-16): with no admin session, hide **New crawler**. This replaces "disabled with a lock icon" in the issue and in the mockup.

## Review Focus

1. Two bad option lines give two errors. The dialog keys its error list by `error.key`, so two equal keys crash the `{#each}`. Key the list by index (Task 2). Test in Task 1.
2. Options text pasted from Windows (`a=b\r\n`) or with spaces around `=`. Expect trimmed keys and values. Test in Task 1.
3. A value that holds `=` (`filter=a=b`). Expect a split on the first `=` only. Test in Task 1.
4. An existing crawler with `schedule_secs` below 60 (made through the API). Edit shows the value, and Save shows the minimum error. Test in Task 1.
5. A timer of `0`, a negative value or `90.5`. Expect the minimum error. An empty input binds to `null` and gives no schedule. Test in Task 1.

---

### Task 1: Form model, options parse, timer

**Files:**
- Modify: `src/lib/data-browser/crawlers.ts`
- Modify: `src/lib/data-browser/tests/crawlers.test.ts`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json` (only the two new error keys and the removed `error.scheduleMin`, so `MessageKey` type-checks)

**Interfaces:**
- Produces:
  - `CrawlerForm` loses `scheduled`, `every`, `unit`, `options`. It gets `timer: number | null` (seconds, `null` = no timer) and `optionsText: string`.
  - `ScheduleUnit` is deleted.
  - `parseTableOptions(text: string): { options: Record<string, string>; errors: Message[] }`
  - `optionsToText(options: Record<string, string>): string`
  - `CRAWLER_DOCS_URL: string` (the docs URL above)
  - `emptyCrawlerForm()`: `timer: null`, `optionsText: ''`, other defaults unchanged.
  - `formFromCrawler(c)`: `timer: c.scheduleSecs` (a value `<= 0` becomes `null`), `optionsText: optionsToText(c.options)`.
  - `crawlerRequest(form, replace)`: `schedule_secs: form.timer`, `options: parseTableOptions(form.optionsText).options`. Bad lines are left out.
  - `crawlerErrors(form)`: name and folder errors as now. Then `error.scheduleSeconds` with `{ min: 60 }` when `timer !== null` and (`!Number.isInteger(timer)` or `timer < 60`). Then the errors of `parseTableOptions`.
  - New catalog keys: `dataBrowser.crawlers.error.optionEquals` = "Line {line} has no =. Write key=value." and `dataBrowser.crawlers.error.optionKey` = "Line {line} has no key. Write key=value." `{line}` is the 1-based line number in the text.

- [ ] **Step 1: Rewrite the tests that use the old form fields, and add the new tests**

Replace the tests that read `scheduled`, `every`, `unit` and `options` rows. Keep "gives the same request after load and save, with replace". Add:

```ts
describe('parseTableOptions', () => {
	it('reads key=value lines, skips empty lines, trims, splits on the first =', () => {
		expect(parseTableOptions('read_dimensions=lat,lon\r\n\n  b = x=y  \n').options).toEqual({
			read_dimensions: 'lat,lon',
			b: 'x=y'
		});
	});

	it('gives one error for each bad line, with its line number', () => {
		const { options, errors } = parseTableOptions('a=1\nnoequals\n=x');
		expect(options).toEqual({ a: '1' });
		expect(errors.map((error) => translate(error))).toEqual([
			'Line 2 has no =. Write key=value.',
			'Line 3 has no key. Write key=value.'
		]);
	});

	it('round-trips with optionsToText', () => {
		const options = { read_dimensions: 'lat,lon', b: 'x=y' };
		expect(optionsToText(options)).toBe('read_dimensions=lat,lon\nb=x=y');
		expect(parseTableOptions(optionsToText(options)).options).toEqual(options);
	});
});

describe('timer', () => {
	it('sends no schedule for an empty timer', () => {
		expect(crawlerRequest({ ...emptyCrawlerForm(), timer: null }, false).schedule_secs).toBeNull();
	});

	it('shows a stored schedule in seconds', () => {
		expect(formFromCrawler({ ...crawler, scheduleSecs: 900 }).timer).toBe(900);
		expect(formFromCrawler({ ...crawler, scheduleSecs: null }).timer).toBeNull();
	});

	it.each([0, -5, 59, 90.5])('rejects a timer of %s', (timer) => {
		const form = { ...emptyCrawlerForm(), name: 'a', folder: 'a/', timer };
		expect(crawlerErrors(form).map((error) => translate(error))).toEqual([
			'Enter a schedule of at least 60 seconds.'
		]);
	});

	it('flags a stored schedule below the minimum on Edit', () => {
		expect(crawlerErrors(formFromCrawler({ ...crawler, scheduleSecs: 30 }))).toHaveLength(1);
	});
});

describe('event_driven', () => {
	it('follows the checkbox', () => {
		expect(crawlerRequest({ ...emptyCrawlerForm(), eventDriven: true }, false).event_driven).toBe(true);
		expect(crawlerRequest(emptyCrawlerForm(), false).event_driven).toBe(false);
	});
});
```

Change the `crawlerRequest` test "no empty options" to `optionsText: '\n  \n'`. Change the `crawlerErrors` test to `timer: 0`, with the third message "Enter a schedule of at least 60 seconds.".

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/data-browser/tests/crawlers.test.ts`
Expected: FAIL, `parseTableOptions` is not exported.

- [ ] **Step 3: Implement the interfaces above in `crawlers.ts`, and the catalog keys**

`parseTableOptions`: split on `\n`, trim each line, skip an empty line. No `=` gives `optionEquals`. An empty key after trim gives `optionKey`. A later duplicate key wins. Delete `error.scheduleMin` from all four catalogs.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/data-browser/tests/crawlers.test.ts`
Expected: PASS. `npm run check` fails in `CrawlerDialog.svelte` only. Task 2 fixes that.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Use timer seconds and options text in crawler form"`

### Task 2: Crawler dialog

**Files:**
- Modify: `src/lib/components/data-browser/CrawlerDialog.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: Task 1 (`CrawlerForm.timer`, `CrawlerForm.optionsText`, `crawlerRequest`, `tableNameExample`).
- Consumes: `splitNodeUrl(url).pathPrefix` from `@/services/beacon-node-url`. `Modal` prop `subtitle: string`.

- [ ] **Step 1: Change the markup, top to bottom**

| Part | Content |
|---|---|
| Modal `title` | Edit: `dialog.editTitle`. New: `newCrawler`. |
| Modal `subtitle` | `` `POST ${splitNodeUrl(node.url).pathPrefix}/api/admin/crawlers` `` as a `$derived` |
| Name | `Input`, `required`, placeholder `dialog.namePlaceholder` ("argo"), `disabled={editing}`. The label shows a red `*` (`aria-hidden`), in `--destructive`. |
| Target folder | Label `dialog.folder` ("Target folder"), `required`, red `*`. Keep `FolderPicker` and the `empty` warning. Hint `dialog.folderHint`. |
| Format filter | Legend `dialog.formats` ("Format filter"). Keep the `.checks` wrap row. Hint `dialog.formatsHint` (new text). |
| Table names + Timer | One `.pair` row: two equal columns (`grid-template-columns: 1fr 1fr`), one column below 480px. Each column has its own label above the control and its hint below. |
| Table names | `<select bind:value={form.naming}>`, two options. Label of each: `$t('dataBrowser.crawlers.dialog.namingOption', { naming: $t(describeNaming(n)), example: tableNameExample({ ...form, naming: n }) })`. The select fills the column, with the height of an `Input`. |
| Timer (seconds) | `<Input type="number" min="60" step="1" bind:value={form.timer}>`, placeholder `dialog.timerPlaceholder` ("900"), hint `dialog.timerHint` |
| Hive partitions | checkbox `form.detectPartitions`, text `dialog.partitions` (new text) |
| Event driven | checkbox `form.eventDriven`, text `dialog.eventDriven` |
| Table options | `<textarea class="mono" rows="4" bind:value={form.optionsText}>`, placeholder `dialog.optionsPlaceholder`, hint `dialog.optionsHint` |
| Request payload | `<details>` (closed), `<summary>` `dialog.payload`, `<pre class="mono">{payload}</pre>`. `payload = $derived(JSON.stringify(crawlerRequest(form, editing), null, 2))` |
| Errors | `{#each errors as error, index (index)}` (Review Focus 1) |
| Footer | Cancel (`outline`). Edit: `common.save`. New: `PlusIcon` + `dialog.create`. |

The two checkboxes (Hive partitions, event driven) sit close together, as one group. The payload `<summary>` is muted text with the native triangle.

`save()` stays the same. Remove `XIcon`, the option rows, the radios, `.every` and `.icon` styles. Style `textarea` and `pre` like the existing `select` (border, radius, `--font-size-sm`). Give `pre` `max-height` and `overflow: auto`.

- [ ] **Step 2: Update the catalogs (all four)**

Text in `en.json`, under `dataBrowser.crawlers`:

| Key | en |
|---|---|
| `dialog.namePlaceholder` | argo |
| `dialog.folder` | Target folder |
| `dialog.folderHint` | The folder of the datasets store to scan. |
| `dialog.formats` | Format filter |
| `dialog.formatsHint` | No selection: the crawler reads all formats. |
| `dialog.namingOption` | {naming} ({example}) |
| `dialog.timer` | Timer (seconds) |
| `dialog.timerPlaceholder` | 900 |
| `dialog.timerHint` | Empty: no timer. |
| `dialog.partitions` | Detect Hive partitions (key=value/) |
| `dialog.eventDriven` | Crawl on new files (event driven) |
| `dialog.options` | Table options |
| `dialog.optionsPlaceholder` | read_dimensions=lat,lon |
| `dialog.optionsHint` | One key=value for each line. Beacon adds them to the OPTIONS of each table. |
| `dialog.payload` | Request payload |
| `dialog.create` | Create crawler |
| `naming.leaf` | Last folder |
| `naming.prefixed` | Crawler name + last folder |

Delete: `dialog.example`, `dialog.every`, `dialog.unit`, `dialog.optionKey`, `dialog.optionValue`, `dialog.removeOption`, `dialog.addOption`. Keep `schedule.*`: the cards use `describeSchedule`. `naming.*` also shows on the cards, so the new text appears there too.

- [ ] **Step 3: Verify**

Run: `npm run check` and `npm run lint`
Expected: no errors. `npx vitest run src/lib/data-browser` passes.

- [ ] **Step 4: Commit (only on the word "commit")**

`git commit -m "Simplify the crawler dialog"`

### Task 3: Crawlers page

**Files:**
- Modify: `src/routes/data-browser/crawlers/+page.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `CRAWLER_DOCS_URL` (Task 1). `ExternalLink` (`@/components/ExternalLink.svelte`). Icons `refresh-cw`, `plus`, `info`, `radar` from `@lucide/svelte/icons/*`.

- [ ] **Step 1: Change the markup**

- Use `<NodePicker />` with no `actions` snippet. Keep the `actions` prop in `NodePicker`.
- Put it in a `.toolbar` row (flex, `align-items: flex-end`, wrap). A `.toolbar-actions` group sits on the right (`margin-left: auto`).
- Show the refresh button, New crawler and the banner only when `gate === 'ready'`. With no session the right side of the toolbar is empty.
- Refresh: icon `Button`, `variant="outline"`, `aria-label` `dataBrowser.crawlers.refresh`, `RefreshCwIcon`, `onclick={load}`, `disabled={phase === 'loading'}`.
- New crawler: primary `Button` with `PlusIcon`, `disabled={phase !== 'ready'}`. No lock icon.
- Info banner under the toolbar, full width: `--muted` background, radius `0.5rem`, small padding, `--font-size-sm`. Content: `InfoIcon` (16px, `--primary`), `banner.text`, a space, `<ExternalLink href={CRAWLER_DOCS_URL}>{$t('dataBrowser.crawlers.banner.link')}</ExternalLink>` (underlined, `--primary`).
- Empty state (`phase === 'ready' && crawlers.length === 0`): a full-width card (`--card` background, `--border`, radius `0.75rem`, about `2rem` padding), centered content. `RadarIcon` (24px, `--muted-foreground`, no tile), then `<h2>` `emptyState.title`, then `<p class="muted">` `emptyState.text`.
- Keep the `!node || gate === 'pick-node'`, `sign-in`, loading, error and card branches as they are.

- [ ] **Step 2: Update the catalogs (all four)**

| Key | en |
|---|---|
| `intro` (change) | A crawler scans a folder of the datasets store and registers the files as tables. Run it on demand, on a timer, or on new files. |
| `refresh` | Refresh |
| `banner.text` | Crawlers work like an AWS Glue crawler. |
| `banner.link` | Read the crawler documentation. |
| `emptyState.title` | No crawlers |
| `emptyState.text` | Click New crawler to make one. |

Delete `empty`. The keys `needsSignIn` and `signIn` under `dataBrowser.crawlers` are already gone (#154).

- [ ] **Step 3: Update the spec**

In `docs/superpowers/specs/2026-10-06-data-browser-design.md`, "Create and edit":
- Replace the `event_driven` line: "Crawl on new files (`event_driven`): a checkbox. The server does not act on it yet."
- Schedule line: "Timer (`schedule_secs`): seconds, empty is `null`. Minimum 60."
- Options line: "Table options: one `key=value` for each line."
- Table names line: a select, "Last folder" or "Crawler name + last folder", each with an example.

In `docs/superpowers/admin-mode-roadmap.md`, add one line at the top: admin mode now follows the sub-issues of #165, and the decisions below are history where they differ.

- [ ] **Step 4: Full verification**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass.

Smoke test on `npm run dev`, `/data-browser/crawlers`, with "Show admin features" on:
1. No session: the sign-in card shows. No New crawler button, no refresh button, no banner.
2. Sign in. A node with no crawlers shows the empty card.
3. Create a crawler with a timer of 900, two option lines and "event driven" on. Before Create, open "Request payload" and compare it with the request in the network tab.
4. Edit it: the timer shows 900, the options show as two lines, the checkbox is on. Clear the timer and Save: `schedule_secs` is `null`.
5. Run it, then delete it.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Rework the crawlers page layout"`
