# System Info Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `/system-info` to match the two mockups of issue #162: a toolbar with health, Live and Refresh, four tiles with icons, an admin banner or a "Datasets store" card, CPU and "Memory and load" side by side, and a functions card in two columns.

**Architecture:** The page keeps the reads of `GET /api/info` and of the functions. `lib/system-info/host.ts` gets `freeMemory`, `meterTone` and `WHOLE_PERCENT_FORMAT`. `Meter` and `StatTile` get the mockup look. `AdminSummary` becomes the admin area: nothing, the sign-in banner, or the store card with the counts.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, Vitest, svelte-i18n, lucide icons (`@lucide/svelte/icons/*`), `@maris-development/beacon-client` 2.0.0.

**Spec:** GitHub issue #162 (parent #165), the two mockups of 2026-10-16 (session scratchpad, `images/1.png` with host data and no session, `images/2.png` with a session and no host data), and the decisions below. The mockups win over the issue text on layout.

## Global Constraints

- Build on top of the uncommitted #161 changes (sidebar, settings, catalogs). Do not revert them.
- #152 (`NodePicker`) and #154 (`askSignIn`, the never-ask rule) are done. Reuse them.
- The page never opens the sign-in dialog by itself. Only the "Sign in as admin" button calls `askSignIn(node)`.
- "Show admin features" off: no banner and no store card.
- Intro text: "View the version, health, CPU, memory and functions of a Beacon node."
- Every visible string comes from the catalog (ESLint `no-restricted-syntax`). ICU plural for the cores. Update `en`, `es`, `it` and `nl`. Keys stay under `systemInfo`.
- SCSS only. `font-size` only through `--font-size-*`, `font-family` only through `--font-family-*`. Function names and the store paths use `--font-family-mono`.
- Read the docs URL from `BRAND.links.docs` (`@/brand`). Never put a beacon-datalake.org URL in a component.
- Prefer `if`/`else` over `?:` in script code. Tabs for indentation, as in the existing files.
- Out of scope: the `systemInfoUpdateIntervalMs` setting, `StorageBar.svelte` (the Datasets page keeps it as is).
- Run `git commit` only when the user writes "commit". Commit on `feature/admin-mode`. Messages: imperative, about 50 characters, no prefix.
- `npm run lint` has old errors outside this work. "Lint passes" means no new errors.
- Smoke test with the Playwright MCP (`mcp__playwright__*`) against `npm run dev`. If it is not available, tell the user.

### Decisions of the user (2026-10-16)

- A meter turns red at 90% and above. Under 90% it is blue (`--primary`). This applies to every meter, the store bar too.
- Without host data, all four tiles show, with `—` for Host, Uptime and CPU, and an info banner under the admin area.
- With a session, the "Datasets store" card replaces the banner. It keeps the counts of crawlers, users and roles in a footer row.
- Add `es` too, beside the three catalogs that the issue names.

### Plan calls (check these)

- Meter percentages are whole numbers (`8%`). The store keeps one decimal (`96.1%`), as in mockup 2.
- The CPU tile line counts the cores in the grid (`host.cores.length`), so the tile and the grid agree (mockup: 32 cores, `#cpu0`…`#cpu31`). No line when the list is empty.
- Live is on at each page load. Off: no timer runs. A node change with Live off reads one time, so the page never shows the data of the previous node.
- Refresh is disabled while its own read runs.
- The footer counts link: Crawlers to `/data-browser/crawlers`, Users and Roles to `/node-management/users-roles`. A failed count shows `—`.
- A failed store read hides the store body and keeps the card title and the counts.
- S3 store (`used_percent` is `null`): the used size and the object count, with no bar (reuse `dataBrowser.datasets.storage.objects`).
- `BRAND.links.docs` is `null`: the footnote shows "documentation" as plain text.
- The info banner background is `color-mix(in oklch, var(--primary) 8%, var(--card))`. No new token.

## Review Focus

1. Refresh is clicked, then the user picks another node before the answer lands. Expect the old answer to be dropped: the refresh read uses the `alive` flag of the current effect. Check in the Task 4 smoke test.
2. The interval setting is 0.5 s. Expect "Live (0.5 s)", formatted with `$formatNumber`. Check in the Task 4 smoke test.
3. The server sends `free_memory: 0`. Expect "Free 0 B", not a hidden value. Test in Task 1.
4. "Show admin features" is off while the node has a session. Expect no banner and no card, and no admin requests in the network list. Check in the Task 4 smoke test.
5. A narrow screen (390 px). Expect the tiles, the two panels and the two function columns to stack, with no horizontal page scroll. Check in the Task 4 smoke test.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/system-info/host.ts` | Read of `/api/info` (`freeMemory`), `meterTone`, `WHOLE_PERCENT_FORMAT` |
| `src/lib/system-info/tests/host.test.ts` | Tests of the above |
| `src/lib/components/system-info/Meter.svelte` | Label, end text, bar with tone, `compact` size |
| `src/lib/components/system-info/StatTile.svelte` | Tile with an icon before the label |
| `src/lib/components/system-info/AdminSummary.svelte` | Admin area: nothing, sign-in banner, or store card with counts |
| `src/routes/system-info/+page.svelte` | Toolbar, Live state, reads, tiles, panels, functions, raw answer |
| `src/lib/i18n/locales/{en,es,it,nl}.json` | `systemInfo` keys |
| `docs/superpowers/admin-mode-roadmap.md` | Row 7 points to #162 and this plan |

---

### Task 1: Host read and meter rules

**Files:**
- Modify: `src/lib/system-info/host.ts`
- Test: `src/lib/system-info/tests/host.test.ts`

**Interfaces:**
- Produces:
  - `HostView.freeMemory: number | null` (from `system_info.free_memory`)
  - `export type MeterTone = 'normal' | 'high'`
  - `export const HIGH_PERCENT = 90`
  - `export function meterTone(percent: number | null): MeterTone`
  - `export const WHOLE_PERCENT_FORMAT: Intl.NumberFormatOptions` (`style: 'percent'`, `maximumFractionDigits: 0`)
  - `PERCENT_FORMAT` stays (one decimal) for the store.

- [ ] **Step 1: Write the failing tests**

In `host.test.ts`: add `free_memory: 100` to the `host` fixture and `freeMemory: 100` to the expected view of "reads a full answer". Add:

```ts
it('reads a free memory of zero', () => {
	expect(readInfo({ system_info: { ...host, free_memory: 0 } }).host?.freeMemory).toBe(0);
});

it('gives no free memory when the server sends none', () => {
	const rest: Record<string, unknown> = { ...host };
	delete rest.free_memory;
	expect(readInfo({ system_info: rest }).host?.freeMemory).toBeNull();
});

describe('meterTone', () => {
	it('is high from 90 percent', () => {
		expect(meterTone(89.9)).toBe('normal');
		expect(meterTone(90)).toBe('high');
		expect(meterTone(100)).toBe('high');
	});

	it('is normal without a value', () => {
		expect(meterTone(null)).toBe('normal');
	});
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/system-info/tests/host.test.ts`
Expected: FAIL. `meterTone` is not exported, and `freeMemory` is missing.

- [ ] **Step 3: Implement**

Add the field and `freeMemory: count(value.free_memory)` in `readHost`. Add `meterTone`, `HIGH_PERCENT` and `WHOLE_PERCENT_FORMAT` next to `PERCENT_FORMAT`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/system-info/tests/host.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (only when the user writes "commit")

`git add src/lib/system-info` then `git commit -m "Read free memory and add meter tone"`

---

### Task 2: Meter and StatTile

**Files:**
- Modify: `src/lib/components/system-info/Meter.svelte`
- Modify: `src/lib/components/system-info/StatTile.svelte`

**Interfaces:**
- Consumes: `meterTone`, `WHOLE_PERCENT_FORMAT` (Task 1).
- Produces:
  - `Meter` props: `{ label: string; percent: number | null; end?: string; size?: 'default' | 'compact' }`. `end` replaces the right text. Without it the right text is the whole percent, or `—` for `null`. `detail` goes away.
  - `StatTile` props: `{ label: string; value: string; detail?: string; icon?: Component }` (lucide component, rendered at size 14 before the label).

- [ ] **Step 1: Meter**

`default`: label left, `end` right (bold, as "of 152 GB" and "8%" in mockup 1), a 0.375rem bar under it. `compact` (core grid): `--font-size-xs`, muted label left, percent right, a 0.25rem bar. The bar fill has class `high` when `meterTone(percent) === 'high'`, with `background: var(--destructive)`. Keep `role="meter"` and the `aria-*` attributes.

- [ ] **Step 2: StatTile**

Icon and label in one muted row (`--font-size-sm`), the value under it (`--font-size-lg`, weight 600, one line with ellipsis), the detail under that (`--font-size-xs`, muted). Background `var(--card)`, border `var(--card-border)`, radius 0.5rem, padding 0.75rem 1rem.

- [ ] **Step 3: Check**

Run: `npm run check`
Expected: errors only in `routes/system-info/+page.svelte` (the `detail` prop of `Meter`). Task 4 fixes them.

- [ ] **Step 4: Commit** (only when the user writes "commit")

`git commit -m "Restyle system info meter and tile"`

---

### Task 3: Admin area

**Files:**
- Modify: `src/lib/components/system-info/AdminSummary.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `Meter` (Task 2), `meterTone`, `PERCENT_FORMAT` (Task 1), `askSignIn`, `credentialsOf`, `makeAdminClient`, `signedInNodeIds` (`@/services/admin-session`), `AdminBadge`, `Button` (`@/components/buttons/Button.svelte`), `formatSize` (`@/data-browser/datasets`).
- Produces: `<AdminSummary {node} />`, same prop as now. The page places it under the tiles.

- [ ] **Step 1: Keys**

Add to `systemInfo` in `en.json`, and the same keys translated in `es`, `it`, `nl`:

```json
"admin": {
	"signInNeeded": "The disk space of the datasets store needs an admin session.",
	"users": "Users",
	"roles": "Roles"
},
"store": {
	"title": "Datasets store",
	"usedFree": "{used} used · {free} free",
	"percentOf": "{percent} of {total}",
	"folder": "Folder",
	"mountPoint": "Mount point"
}
```

Remove `systemInfo.admin.title`. The button text is `admin.sessionRequired.button` ("Sign in as admin").

- [ ] **Step 2: Three states**

- `$settings.adminFeatures` off: render nothing, and load nothing.
- On, no session (`!$signedInNodeIds.has(node.id)`): a banner row (card background, border, radius 0.5rem). `LockIcon` and `systemInfo.admin.signInNeeded` on the left in muted `--font-size-sm`. On the right an outline `Button` size `sm` with `KeyRoundIcon` and `admin.sessionRequired.button`, which calls `void askSignIn(node)`.
- On, with a session: a card. Header row: `HardDriveIcon`, `systemInfo.store.title`, `<AdminBadge />`, and a divider under it. Body:
  - Local store: `usedFree` on the left, `percentOf` (bold, `PERCENT_FORMAT`) on the right, then a full-width bar with the `high` tone rule. Use `Meter` with `label` = `usedFree` text, `end` = `percentOf` text, `percent` = `used_percent`. Then a two-column list (`<dl>`): Folder `location`, Mount point `mount_point`, values in `--font-family-mono`. Leave out the Mount point row when it is `null`.
  - S3 (`used_percent === null`): the `dataBrowser.datasets.storage.objects` text and the Folder row only.
  - Footer under a divider: "Crawlers {n} · Users {n} · Roles {n}" as three links (see the plan calls). The labels are `nav.item.crawlers`, `systemInfo.admin.users`, `systemInfo.admin.roles`.

- [ ] **Step 3: One load**

One `$effect`, tracking only `nodeId`, `nodeUrl` and `active` (as now), loads `admin.datasetStorage()` and the three counts with `Promise.all`. Each part fails on its own: storage to `null`, a count to `null`. Keep the `current` flag and `untrack(() => node)`.

- [ ] **Step 4: Check**

Run: `npm run check`
Expected: no errors in `AdminSummary.svelte`.

- [ ] **Step 5: Commit** (only when the user writes "commit")

`git commit -m "Show sign-in banner or datasets store card"`

---

### Task 4: Page

**Files:**
- Modify: `src/routes/system-info/+page.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: everything above, `poll` (`@/system-info/poll`, unchanged), `BRAND` (`@/brand`).

- [ ] **Step 1: Keys**

Set `systemInfo` in `en.json` to these keys, and translate them in `es`, `it`, `nl`. Keep `title`, `noNode`, `version`, `host`, `uptime.*`, `memory.noSwap`, `functions.loading`, `functions.filter`, `raw` and the Task 3 keys.

```json
"intro": "View the version, health, CPU, memory and functions of a Beacon node.",
"live": "Live ({seconds} s)",
"paused": "Paused",
"liveStop": "Stop live updates",
"liveStart": "Start live updates",
"refresh": "Read now",
"noHostBefore": "The node shows no host metrics. Start the server with",
"noHostAfter": "to see CPU, memory and load.",
"uptime": { "kernel": "kernel {kernel}" },
"cpu": {
	"title": "CPU",
	"total": "Total use",
	"cores": "{count, plural, one {# core} other {# cores}}"
},
"memory": {
	"title": "Memory and load",
	"used": "{size} used",
	"of": "of {total}",
	"available": "Available {size}",
	"availableFree": "Available {available} · Free {free}",
	"swap": "{size} swap",
	"noSwap": "No swap."
},
"load": {
	"one": "Load 1 min",
	"five": "Load 5 min",
	"fifteen": "Load 15 min"
},
"functions": {
	"title": "Functions",
	"total": "({total})",
	"count": "({shown} of {total})",
	"noteBefore": "Table functions (read_parquet, read_netcdf, …) are not in this list. See the",
	"noteLink": "documentation",
	"noteAfter": "."
}
```

Remove `systemInfo.health`, `noHost`, `cpu.overall`, `cpu.physicalCores`, `memory.usage`, `load.title`, `load.values`, `load.perCore` from all four catalogs. Then search `src` for each removed key; expect no hits.

- [ ] **Step 2: Live state and reads**

- `let live = $state(true)` and `let refreshing = $state(false)`.
- The info `$effect` tracks `nodeUrl`, `period` and `live`. It clears `info`, `raw` and `error` only when `nodeUrl` changes (keep the last URL in a plain variable), so a Live toggle does not blank the page.
- In the effect, `read` is the current function. Store it in a plain `let readNow: (() => Promise<void>) | null`. Live on: `stop = poll(read, every)`. Live off: `void read()` only when the node changed, else nothing. The cleanup sets `alive = false`, stops the poll and sets `readNow = null`.
- `refresh()`: when `readNow` is set and `!refreshing`, set `refreshing`, `await readNow()`, then clear `refreshing` in `finally`.

- [ ] **Step 3: Header and toolbar**

`h1`, intro, then one row: `NodePicker` on the left. On the right, in this order:
- `<BeaconNodeStatus health={node} variant="compact" />`
- an outline `Button` size `sm` with `TimerIcon`, `aria-pressed={live}`, `title` = `liveStop` or `liveStart`. Text: `systemInfo.live` with `seconds` = `$formatNumber(period / 1000)`, or `systemInfo.paused`.
- an outline `Button` size `icon` with `RefreshCwIcon`, `aria-label` = `systemInfo.refresh`, `disabled={refreshing}`.

The row wraps on a narrow screen. Without a node, show the picker and `noNode` only.

- [ ] **Step 4: Tiles, banner, admin area**

A grid of four tiles (`repeat(auto-fit, minmax(14rem, 1fr))`):

| Tile | Icon | Value | Detail |
|---|---|---|---|
| `systemInfo.version` | `TagIcon` | `info?.version ?? '—'` | none |
| `systemInfo.host` | `ServerIcon` | `host?.hostName ?? '—'` | `host.osName` |
| `systemInfo.uptime.label` | `ClockIcon` | `uptimeText(host?.uptimeSecs ?? null)` | `uptime.kernel` when `host.kernel` is set |
| `systemInfo.cpu.title` | `CpuIcon` | `host?.cpuBrand ?? '—'` | `cpu.cores` with `count` = `host.cores.length`, when above 0 |

Then `<AdminSummary {node} />`. Then, when `info` is loaded and `info.host` is `null`, the info banner: `InfoIcon`, `noHostBefore`, `<code>BEACON_ENABLE_SYS_INFO=true</code>` (mono, `--font-size-xs`), `noHostAfter`.

- [ ] **Step 5: CPU and "Memory and load"**

With `info.host`, a grid of two cards (`repeat(auto-fit, minmax(22rem, 1fr))`). Each card has a header row (icon, `h2`) and a divider, as the store card.
- CPU (`GaugeIcon`): `Meter` with `cpu.total` and `host.cpuPercent`. Then a grid of compact meters, `repeat(auto-fill, minmax(6.5rem, 1fr))`, label `#{core.name}`.
- Memory and load (`MemoryStickIcon`):
  - `Meter` label `memory.used` (size = used), `end` = `memory.of` (total), percent = `memory.percent`. With no memory data, `—`.
  - A muted line: `availableFree` when `freeMemory !== null`, else `available`.
  - Swap: `Meter` label `memory.swap`, `end` = `memory.of`, or the `noSwap` text.
  - With `host.load`: a two-column `<dl>` with `load.one`, `load.five`, `load.fifteen` and the values with two decimals.

- [ ] **Step 6: Functions card**

A card. Header: `SquareFunctionIcon`, `h2` `functions.title`, the muted count (`functions.total`, or `functions.count` while the filter has text), and on the right the filter `Input` with `SearchIcon`. Body: a `<ul>` with `grid-template-columns: repeat(2, minmax(0, 1fr))` (one column under 48rem), `max-height: 28rem`, `overflow: auto`. Each item: the name (mono, weight 600, `--font-size-xs`) and the description under it (muted, `--font-size-xs`). Footer: `noteBefore`, then `<a href={BRAND.links.docs} target="_blank" rel="noreferrer">` with `noteLink`, or plain `noteLink` when `docs` is `null`, then `noteAfter`. Loading and error states as now.

- [ ] **Step 7: Raw answer**

Keep the `<details>` at the bottom, as now.

- [ ] **Step 8: Remove dead code**

Remove `systemDetail`, `coresDetail`, `usageDetail`, `percentText` and the `.health` styles. Keep `uptimeText` and `loadText`.

- [ ] **Step 9: Verify**

Run: `npm test`, then `npm run check`, then `npm run lint`.
Expected: all tests pass; `check` has 0 errors; `lint` has no new errors in the touched files.

- [ ] **Step 10: Smoke test**

`npm run dev`, then `/system-info` with the Playwright MCP:
1. A node with `BEACON_ENABLE_SYS_INFO` on, no session. Compare with mockup 1. Check the network list: one `/api/info` request per interval.
2. Click Live. Expect "Paused" and no new `/api/info` requests for 3 intervals. Click Refresh. Expect one request. Click Live again. Expect polling again.
3. Click "Sign in as admin" and sign in. Expect the store card with the counts, and no banner.
4. A node with `BEACON_ENABLE_SYS_INFO` off, with a session. Compare with mockup 2.
5. Settings, "Show admin features" off. Expect no banner, no card, and no `/api/admin/` requests.
6. Set the interval to 0.5 s. Expect "Live (0.5 s)".
7. Click Refresh, then switch the node at once. Expect the data of the new node only.
8. Resize to 390 px wide. Expect no horizontal page scroll.

- [ ] **Step 11: Roadmap**

In `docs/superpowers/admin-mode-roadmap.md`: add "System info: #162, [plan](plans/2026-10-16-system-info-rework.md)" to the change-of-course line. In row 7, set the plan link to this plan and the build cell to the result of Step 9 (date, test count, check, lint). The 2026-10-07 build is committed (`d242181`). In the System info note, drop "load per core" and add "free memory".

- [ ] **Step 12: Commit** (only when the user writes "commit")

`git commit -m "Rework system info page to match mockups"`
