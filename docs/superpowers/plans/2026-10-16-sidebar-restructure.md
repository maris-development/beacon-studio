# Sidebar Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar to the mockup of GitHub issue #161: flat Query Workbench and Workspace items, SQL Console, Crawlers and Users & Roles as admin items in Node Management, a lock hint per admin item, and admin features on by default.

**Architecture:** `components/sidebar/menu.ts` gets pure functions for the active state and the lock state. The two sidebar components call them. `AppSidebar.svelte` holds the new menu data and passes a lock tooltip per item. The SQL Console page gets the admin gate of the Crawlers page.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, Vitest, svelte-i18n, lucide icons.

**Spec:** GitHub issue #161 (parent #165).

## Global Constraints

- #160 is committed (`d0a6cea`). It changed the admin-only page rule: the page ignores "Show admin features" and shows only `AdminSessionRequired` without a session. `AdminOnlyNotice` and `admin.onlyNotice.*` are deleted. This replaces the `AdminOnlyNotice` line of #161.
- #155 lands before the release. So the SQL Console becomes admin-only now (user decision 2026-10-16).
- The "Open in SQL Editor" buttons on the table and dataset detail pages go inside `AdminAction`, with a one-line `// TODO(#155): …` comment (user decision 2026-10-16).
- Admin mode follows the sub-issues of #165. Where `docs/superpowers/admin-mode-roadmap.md` disagrees, the issue wins.
- No route changes. `/sql-editor`, `/data-browser/crawlers`, `/visualisations/*` and `/node-management/users-roles` stay.
- Do not change `VisualisationTabs`, the Saved Queries page or the Query History page.
- Keep `withAdminFallback` and `lib/sql/privilege.ts` as they are.
- Update all four catalogs: `en`, `es`, `it`, `nl`. The issue names three, but `SUPPORTED_LOCALES` also holds `es`.
- `nav.item.usersRoles` exists already (#160). Do not add it again.
- `nav.item.queryBuilder` keeps its current text ("Query Builder"). #149 renames it. The Workspace item keeps `nav.item.workspace` ("Workspace") until the name is decided.
- The collapsed sidebar hides `.sidebar-content` (`AppSidebar.svelte`, `&.collapsed`). So the collapsed sidebar shows no lock with no extra code.
- Settings are a preference. A default change needs no migration.
- SCSS only. `font-size` only through `--font-size-*` tokens. Prefer `if`/`else` over `?:` in script code. Tabs for indentation, as in the existing files.
- Run `git commit` only when the user writes "commit". Commit on `feature/admin-mode`. Messages: imperative, about 50 characters, no prefix.
- `npm run lint` fails today with 8 errors in `PlotConfigPanel.svelte` and `services/beacon-node-health.ts`. "Lint passes" means no new errors.
- Smoke tests: Playwright MCP (`mcp__playwright__*`) against `npm run dev`. If it is not available, tell the user.
- **Plan call:** the tooltip names the current node. With no current node, the lock shows `nav.adminLock.noNode` instead.
- **Plan call:** a parent item with children and no `match` is active on its own URL and on the URL of a child. It is not active on other sub-paths. This makes Data Browser inactive on `/data-browser/crawlers`.

## Review Focus

1. `/data-browser/datasets/detail?file=…` is a sub-path of a child. Expect Data Browser and Datasets active, Crawlers not. Test in Task 1.
2. `/data-browser` (the Data Browser root page). Expect Data Browser active, no child active. Test in Task 1.
3. `/queries/history` and `/queries/query-editor`. Expect Query Workbench active (it has `match: '/queries'`). Test in Task 1.
4. No current node (empty node list on `/`, or before `selectFirstIfNone`). Expect a lock on each admin item with the `noNode` tooltip, and no crash. Test in Task 1 (`isLocked` with `hasSession: false`) and the smoke test in Task 5.
5. A link to `/sql-editor?sql=…` from a table or dataset detail page with no session. Expect the SQL in a new tab after the sign-in, and no lost text. The `onMount` handover runs in the page script, outside the gate. Check in the smoke test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/components/sidebar/menu.ts` | Menu types, `visibleGroups`, `isPathActive`, `isItemActive`, `isLocked` |
| `src/lib/components/sidebar/tests/menu.test.ts` | Tests of the four functions |
| `src/lib/components/sidebar/SidebarMenuItem.svelte` | One item: `match` for the active state, lock icon with tooltip |
| `src/lib/components/sidebar/SidebarCollapsibleMenu.svelte` | Parent item: active state through `isItemActive` |
| `src/lib/components/sidebar/AppSidebar.svelte` | The menu data and the lock tooltip per item |
| `src/routes/sql-editor/+page.svelte` | SQL Console title, breadcrumb and admin gate |
| `src/lib/stores/settings.ts`, `src/lib/stores/tests/settings.test.ts` | `adminFeatures` default `true` |
| `src/lib/i18n/locales/{en,es,it,nl}.json` | New and removed `nav` keys |
| `docs/superpowers/admin-mode-roadmap.md`, `AGENTS.md` | Changed decisions |

---

### Task 1: Pure menu rules

**Files:**
- Modify: `src/lib/components/sidebar/menu.ts`
- Test: `src/lib/components/sidebar/tests/menu.test.ts`

**Interfaces:**
- Produces:
  - `isPathActive(pathname: string, url: string): boolean`: `pathname === url` or `pathname.startsWith(url + '/')`. The rule that both components have today.
  - `isItemActive(pathname: string, item: { url: string; match?: string; children?: { url: string }[] }): boolean`. A structural type, so `SidebarCollapsibleMenu` can pass its translated items: with `match`, `isPathActive(pathname, match)`. With children and no `match`, `pathname === item.url` or a child with `isPathActive(pathname, child.url)`. Else `isPathActive(pathname, item.url)`.
  - `isLocked(item: { adminOnly?: boolean }, hasSession: boolean): boolean`: `true` only for an admin item with no session.

- [ ] **Step 1: Write the failing tests**

Keep the two `visibleGroups` tests. Add:

```ts
describe('isItemActive', () => {
	const dataBrowser = {
		url: '/data-browser',
		children: [{ url: '/data-browser/datasets' }, { url: '/data-browser/data-tables' }]
	};
	const crawlers = { url: '/data-browser/crawlers' };
	const workbench = { url: '/queries/workbench', match: '/queries' };
	const workspace = { url: '/visualisations/map-viewer', match: '/visualisations' };

	it('keeps Data Browser inactive on the Crawlers page', () => {
		expect(isItemActive('/data-browser/crawlers', dataBrowser)).toBe(false);
		expect(isItemActive('/data-browser/crawlers', crawlers)).toBe(true);
	});

	it('marks Data Browser active on its root and on a child sub-path', () => {
		expect(isItemActive('/data-browser', dataBrowser)).toBe(true);
		expect(isItemActive('/data-browser/datasets/detail', dataBrowser)).toBe(true);
	});

	it('marks Query Workbench active on every /queries route', () => {
		for (const path of ['/queries/workbench', '/queries/history', '/queries/query-editor']) {
			expect(isItemActive(path, workbench)).toBe(true);
		}
	});

	it('marks Workspace active on all three viewers', () => {
		for (const path of ['/visualisations/map-viewer', '/visualisations/table-explorer', '/visualisations/chart-explorer']) {
			expect(isItemActive(path, workspace)).toBe(true);
		}
	});

	it('does not match a path that only shares a prefix', () => {
		expect(isPathActive('/settings-old', '/settings')).toBe(false);
	});
});

describe('isLocked', () => {
	it('locks an admin item with no session', () => {
		expect(isLocked({ adminOnly: true }, false)).toBe(true);
	});

	it('unlocks an admin item with a session', () => {
		expect(isLocked({ adminOnly: true }, true)).toBe(false);
	});

	it('never locks an item for everyone', () => {
		expect(isLocked({}, false)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/components/sidebar/tests/menu.test.ts`
Expected: FAIL, `isItemActive`, `isPathActive` and `isLocked` are not exported.

- [ ] **Step 3: Implement the three functions in `menu.ts`**

Add a short JSDoc line to each, as `visibleGroups` has.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/components/sidebar/tests/menu.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit (only when the user writes "commit")**

`git commit -m "Add active and lock rules for sidebar items"`

---

### Task 2: New menu, lock icon and nav keys

**Files:**
- Modify: `src/lib/components/sidebar/SidebarMenuItem.svelte`
- Modify: `src/lib/components/sidebar/SidebarCollapsibleMenu.svelte`
- Modify: `src/lib/components/sidebar/AppSidebar.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `isPathActive`, `isItemActive`, `isLocked` (Task 1). `currentNode` (`@/services/beacon-node`), `signedInNodeIds` (`@/services/admin-session`).
- Produces: `SidebarMenuItem` props `match?: string` and `lock?: string`. A `lock` value shows the lock icon, with the value as tooltip and `aria-label`.

- [ ] **Step 1: Change `SidebarMenuItem.svelte`**

Compute `isActive` with `isItemActive(page.url.pathname, { url, match })` when `url` is set. When `lock` is set, render `LockIcon` (`@lucide/svelte/icons/lock`) in a `<span class="lock" title={lock} aria-label={lock}>` after `.item-title`, in the `<a>` branch only. Style: `.item-title { flex-grow: 1 }`, `.lock` icon 0.875rem, `color: var(--muted-foreground)`, `flex-shrink: 0`.

- [ ] **Step 2: Change `SidebarCollapsibleMenu.svelte`**

Replace the local `isActive` and `isHeaderActive` with `isItemActive(page.url.pathname, { url, match, children: items })`. The children keep `SidebarMenuItem`, which computes its own state.

- [ ] **Step 3: Change the menu data in `AppSidebar.svelte`**

| Group | Item | `url` | Other fields |
|---|---|---|---|
| `nav.group.dataAccess` | `nav.item.queryBuilder` | `/queries/workbench` | `match: '/queries'`, `TextSearchIcon`, no children |
| `nav.group.explore` | `nav.item.workspace` | `/visualisations/map-viewer` | `match: '/visualisations'`, `EyeIcon`, no children |
| `nav.group.nodeManagement` | `nav.item.dataBrowser` | `/data-browser` | `Table2Icon`, children Datasets and Data Tables only |
| | `nav.item.sqlConsole` | `/sql-editor` | `SquareTerminalIcon`, `adminOnly: true` |
| | `nav.item.crawlers` | `/data-browser/crawlers` | `RadarIcon`, `adminOnly: true` |
| | `nav.item.usersRoles` | `/node-management/users-roles` | `ShieldIcon` (replaces `UsersIcon` from #160), `adminOnly: true` |
| | `nav.item.systemInfo` | `/system-info` | `CpuIcon` |
| `nav.group.studio` | Beacon Nodes, Settings | unchanged | |

Wrap each URL in `resolve()`, as now. Keep the footer as it is.

- [ ] **Step 4: Pass the lock in `AppSidebar.svelte`**

Derive `hasSession` from `$currentNode` and `$signedInNodeIds` (`false` with no node). Add `lockOf(item): string | undefined`: `undefined` when `!isLocked(item, hasSession)`. Else `$t('nav.adminLock.signIn', { node: $currentNode.name })`, or `$t('nav.adminLock.noNode')` with no node. Pass `match={item.match}` and `lock={lockOf(item)}` to each flat `SidebarMenuItem`. Child items get no lock (no admin child is left).

- [ ] **Step 5: Change the `nav` keys in the four catalogs**

Add:

| Key | en | nl | it | es |
|---|---|---|---|---|
| `nav.item.sqlConsole` | SQL Console | SQL-console | Console SQL | Consola SQL |
| `nav.adminLock.signIn` | Sign in as admin on {node} to use this page. | Meld je aan als beheerder op {node} om deze pagina te gebruiken. | Accedi come amministratore su {node} per usare questa pagina. | Inicia sesión como administrador en {node} para usar esta página. |
| `nav.adminLock.noNode` | Sign in as admin to use this page. | Meld je aan als beheerder om deze pagina te gebruiken. | Accedi come amministratore per usare questa pagina. | Inicia sesión como administrador para usar esta página. |

Match the form of address of `admin.sessionRequired` in each catalog (`je`/`u`, `tu`/`usted`). Change the text above if it differs.

Remove: `nav.item.savedQueries`, `nav.item.queryHistory`, `nav.item.mapViewer`, `nav.item.tableExplorer`, `nav.item.chartExplorer`, `nav.item.sqlEditor`. Keep `nav.item.queries` and `nav.item.queryBuilder` (the Saved Queries and Query History pages use them). Task 3 replaces the last use of `nav.item.sqlEditor`, so do Step 5 and Task 3 Step 1 before you run `npm run check`.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: 0 errors. A remaining use of a removed key fails here.

- [ ] **Step 7: Commit (only when the user writes "commit")**

`git commit -m "Restructure sidebar and show admin lock"`

---

### Task 3: SQL Console becomes admin-only

**Files:**
- Modify: `src/routes/sql-editor/+page.svelte`
- Modify: `src/routes/data-browser/data-tables/detail/+page.svelte`, `src/routes/data-browser/datasets/detail/+page.svelte`

**Interfaces:**
- Consumes: `adminPageState`, `signedInNodeIds` (`@/services/admin-session`). `AdminSessionRequired` (`@/components/AdminSessionRequired.svelte`, prop `node`). `AdminAction` (`@/components/AdminAction.svelte`, snippet `children({ disabled })`).

- [ ] **Step 1: Rename the title, the breadcrumb and the `h1`**

Replace the three `nav.item.sqlEditor` uses with `nav.item.sqlConsole`.

- [ ] **Step 2: Add the gate**

Derive `gate = adminPageState(node, $signedInNodeIds)`, as the Crawlers and Users & Roles pages do. The setting plays no part. Keep the `NodePicker` in the header. Below it:
- `gate === 'pick-node'`: the existing `sqlEditor.pickNode` text.
- `gate === 'sign-in'`: `<AdminSessionRequired {node} />`.
- `gate === 'ready'`: the current `.workspace`.

Keep the `?sql=` handover in `onMount`, outside the gate, so the tab is ready after a sign-in. Load the catalogue only when `gate === 'ready'`: add it to the condition of the catalogue `$effect`, and read it before `untrack`.

- [ ] **Step 3: Wrap the two "Open in SQL Editor" buttons in `AdminAction`**

Pass `disabled` into each `Button`, as the Refresh and Drop buttons of the table detail page do. Above each wrapper, add `<!-- TODO(#155): open the SQL in the SQL mode of the workbench, for every user. -->`.

- [ ] **Step 4: Verify**

Run: `npm run check` and `npm test`
Expected: 0 errors; all tests pass.

- [ ] **Step 5: Commit (only when the user writes "commit")**

`git commit -m "Make the SQL Console an admin page"`

---

### Task 4: Admin features on by default, and the decisions

**Files:**
- Modify: `src/lib/stores/settings.ts` (the `adminFeatures: false` default)
- Test: `src/lib/stores/tests/settings.test.ts`
- Modify: `docs/superpowers/admin-mode-roadmap.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Change the test**

In `settings.test.ts`, the default test expects `getSettings().adminFeatures` to be `true`. Rename the test to say "on by default".

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stores/tests/settings.test.ts`
Expected: FAIL, `expected false to be true`.

- [ ] **Step 3: Change the default in `settings.ts` to `true`**

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stores/tests/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Change the roadmap**

In `admin-mode-roadmap.md`:
- "Setting and visibility": the setting defaults to on (#161). Admin items show with a lock while the current node has no session. With the setting off, the admin items stay hidden. The SQL Console is now an admin-only page. Replace the `AdminOnlyNotice` line: an admin-only page shows only the session card (#160).
- "Menu": replace the three lines with the menu of #161 (Query Workbench, Workspace, Node Management with Data Browser, SQL Console, Crawlers, Users & Roles, System Info). Crawlers is a top-level item, not a Data Browser child.
- Sub-project note 2: replace "for power users too, not admin only" with "admin only since #161. Every user gets SQL through the SQL mode of the workbench (#155)."
- Add a line under "Change of course" that names this plan.
- The "Sign-in" line "The sidebar shows no sign-in state" becomes "The sidebar shows a lock on an admin item while the current node has no session."

- [ ] **Step 6: Change `AGENTS.md`**

In "Frontend Conventions", the "Admin features" line: add "An admin item shows a lock in the sidebar while the current node has no session (`isLocked` in `components/sidebar/menu.ts`). The lock is a hint; the page shows `AdminSessionRequired`."

- [ ] **Step 7: Commit (only when the user writes "commit")**

`git commit -m "Turn admin features on by default"`

---

### Task 5: Verification and smoke test

- [ ] **Step 1: Run the checks**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all tests pass; 0 check errors; only the 8 known lint errors.

- [ ] **Step 2: Smoke test, expanded sidebar (Playwright MCP, `npm run dev`)**

Clear `localStorage` first, so the defaults apply. Check:
- The groups and items match the table in Task 2 Step 3. Query Workbench and Workspace have no chevron.
- `/queries/history`: Query Workbench active.
- `/visualisations/table-explorer` and `/visualisations/chart-explorer`: Workspace active.
- `/data-browser/crawlers`: only Crawlers active.
- No session: SQL Console, Crawlers and Users & Roles show a lock. The tooltip names the node.
- Sign in through the node picker: the three locks go away. Pick a node with no session: the locks come back.
- `/sql-editor` with no session: the sign-in card. Sign in: the editor.
- From a table detail page, "Open in SQL Editor" with no session, then sign in: the SQL is in a new tab.
- Settings, "Show admin features" off: the three items are hidden; `/sql-editor` by URL still shows the sign-in card (or the editor with a session); "Open in SQL Editor" is greyed out.

- [ ] **Step 3: Smoke test, collapsed and mobile**

Collapsed (desktop): no menu items and no lock show. Mobile (width 400 px): the overlay sidebar shows the locks; a click on an item closes the overlay.

- [ ] **Step 4: Update the roadmap status**

Add the result (tests, check, lint, smoke test) to the line that Task 4 Step 5 added under "Change of course".
