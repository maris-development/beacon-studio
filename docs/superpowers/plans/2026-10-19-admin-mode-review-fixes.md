# Admin mode review fixes

**Goal:** Fix the findings of the 2026-10-19 review of branch `feature/admin-mode` against `main`, before the merge.

**Spec:** The findings below are the requirements. Each finding was checked in the code. Background: `AGENTS.md`, `docs/superpowers/admin-mode-roadmap.md`, and the GitHub issues under #165. Where a finding cites an issue, the issue wins over the roadmap.

## Global Constraints

- Do not commit. Do not create a branch. Leave all changes in the working tree.
- Edit files with the Edit tool only. Never `sed`, `perl` or `echo`.
- Follow AGENTS.md: the layer rule, translations (every user-visible string in `en.json`, `es.json`, `it.json`, `nl.json`), `if`/`else` over the ternary in script code, SCSS only, `--font-size-*` tokens only, tests in a `tests/` folder next to the code.
- Comments: one short line, only for complex logic, describe current behavior only.
- Write a failing test first for each logic change in a `.ts` module. Svelte components have no test setup; for them, describe the manual check in the report.
- Run before the report: the test files of the touched modules, `npm run check`, and `npx eslint <touched files>`.
- Stay inside the files of your task. Another task owns the other files.

## Task 1: SQL Stop and the stream leak

Files: `src/lib/sql/run.ts`, `src/lib/sql/tests/run.test.ts`.

The SDK `@maris-development/beacon-client` 2.0.0 has two defects (confirmed in `node_modules/@maris-development/beacon-client/dist/index.js`):
- `fetchRaw` calls `cancel()` from `withTimeout` in its `finally` when the response headers arrive. That removes the listener on the caller's signal. After the headers, an abort of the caller's signal never reaches the fetch.
- `responseByteStream` only calls `reader.releaseLock()` in its `finally`. It never cancels the body.

Effect in `runPreview`:
- Stop after the first batch: the `for await` loop does not end. The page stays busy until the server ends the stream. Then `runPreview` returns `cancelled: false`.
- The 500-row stop (`break`): the body is not cancelled. The HTTP request and the server query stay open.
- A signal that is already aborted when `runPreview` starts (Stop during the sign-in dialog of the admin retry): `addEventListener('abort')` never fires, so the statement runs.

Required behavior:
1. When `options.signal.aborted` is true at the start, return `{ columns: [], types: [], rows: [], truncated: false, cancelled: true }` and do not call `queryBatches`.
2. Stop at any time returns at once with the rows so far and `cancelled: true`. Race each read of the batch iterator against the abort of `options.signal`.
3. On Stop, on the row limit, and on an error, end the iterator: call `return()` on it, without an `await` that can hang. A late rejection must not be unhandled.
4. Add one short comment at the workaround that names the SDK defect and says that the SDK must fix it, for example: `// Workaround: SDK 2.0.0 drops the abort after the headers and never cancels the body. Fix in the SDK.`
5. Tests: add a fake source whose batch iterator ignores the signal and never ends by itself (a pending promise after the first batch). Test: Stop after the first batch returns the first batch rows with `cancelled: true`. Test: the row limit calls `return()` on the iterator. Test: an aborted signal at the start returns cancelled and never calls `queryBatches`. Keep the existing tests green.

## Task 2: Admin sessions and sign-in

Files: `src/lib/services/admin-session.ts`, `src/lib/services/admin-vault.ts`, `src/lib/services/tests/admin-session*.test.ts`, `src/lib/services/tests/admin-vault.test.ts`, `src/lib/components/modals/AdminSignInDialog.svelte`, `src/lib/components/modals/AddBeaconModal.svelte`, `src/lib/components/system-info/AdminSummary.svelte`, `src/lib/components/data-browser/StorageBar.svelte`, the four locale catalogs (only to delete a key that the change makes unused).

1. **Important. A session can follow a node to another server.** Sessions in `sessionStorage` are keyed by node id only (`admin-session.ts`, `credentialsOf`). The node list is a `persisted` store that syncs between browser tabs through the `storage` event. `updateNode` in `beacon-node.ts` calls `signOut(id)` on a URL change only in the tab that made the edit. Scenario: tab A signs in to node X at url1. Tab B changes node X to url2. Tab A gets url2 and keeps its credentials, so `withAdmin` and `withAdminSession` send the Basic password to url2. Fix: store the normalized node URL with each tab session. A session whose URL differs from the URL of the node it is used for counts as no session: remove it (sign out) and return null. Every path that reads credentials for a node must check this (`credentialsOf` callers, `requireAdminClient`, `withAdmin`, `withAdminSession`, `adminPageState` through `signedInNodeIds` if needed). Read an old stored session without a URL as no session (the class is "Cache": discard). Test the URL mismatch. Do not edit `beacon-node.ts` unless there is no other way; if you must, say why in the report.
2. **AdminSummary and StorageBar keep a rejected session.** Both build `makeAdminClient` themselves and turn every error into `null`. A 401 shows dashes and keeps the session, the Admin badge and the vault entry. Fix: load through `withAdminSession(node, fn)`, which signs out on a 401 and never asks. In `AdminSummary`, the storage and the three counts load in one `withAdminSession` call. A 401 from any of the four calls must reach `withAdminSession`. Other errors of one count still give a dash for that count only.
3. **Cancel during a running sign-in still signs in.** `AdminSignInDialog.svelte`: Cancel and Escape call `answerSignIn(false)` while `signIn` runs, and nothing stops it. The session, and with "Remember" the vault entry, appear after the cancel. Fix: disable Cancel and ignore Escape while `busy`.
4. **Duplicate element ids.** `AddBeaconModal.svelte` and `AdminSignInDialog.svelte` both use `admin-username`, `admin-password`, `admin-remember`. The dialog can open over the modal. Fix: prefix the ids in `AddBeaconModal` with `node-`.
5. **Remember checkbox must be hidden when it cannot work.** Issue #153 "Platform": "If either is not available, hide the checkbox and use `sessionStorage`." Both forms now show it disabled with a tooltip. Fix: render the remember block only when remember is available, in both forms. Delete the catalog key of the tooltip in all four catalogs if nothing else uses it.
6. **`forgetAllRemembered` can report a false failure.** `admin-vault.ts`: it rejects on `onblocked`, but `deleteDatabase` still completes when open connections close. It also skips `vaultQueue`. Fix: resolve on `onsuccess`, reject on `onerror` only, ignore `onblocked`. Wait for the pending vault queue first. Test it.
7. **Ternary in script code.** `AddBeaconModal.svelte`: `$: adminInput = showAdminFields ? {...} : null`. Use if/else.

## Task 3: SQL Console

Files: `src/lib/sql/identifiers.ts`, `src/lib/sql/tabs.ts`, `src/lib/sql/privilege.ts` (only if needed), `src/lib/sql/tests/identifiers.test.ts`, `src/lib/sql/tests/tabs.test.ts`, `src/lib/components/sql-editor/*`, `src/routes/sql-editor/+page.svelte`, `src/routes/sql-editor/+page.server.ts`, the four locale catalogs (only `sqlEditor.*` keys).

1. **`quoteIdent` leaves reserved words bare.** `BARE_IDENT` matches `null`, `order`, `user`, `select`. A column insert, a completion, `previewSql`, `refreshSql`, `dropSql`, `editorSql` and `createViewSql` then build invalid SQL, or SQL that reads the literal `NULL`. Fix: quote a name that is a SQL reserved word. Use one reserved-word set in `identifiers.ts`, lower case, that covers the DataFusion / sqlparser reserved words used as identifiers in practice (at least: all, and, any, array, as, asc, between, by, case, cast, create, cross, current_date, current_time, current_timestamp, default, delete, desc, distinct, drop, else, end, except, exists, false, fetch, filter, for, from, full, group, having, in, inner, insert, intersect, interval, into, is, join, lateral, left, like, limit, natural, not, null, offset, on, or, order, outer, over, partition, primary, references, right, select, set, table, then, to, true, union, unique, update, user, using, values, when, where, window, with). If `completion.ts` already has a keyword list, do not merge the two: the completion list is for suggestions, this set is for quoting. Test: `quoteIdent('null')` is `"null"`, `quoteIdent('order')` is `"order"`, `quoteIdent('temp')` is `temp`.
2. **Important. A statement with no rows gives no feedback.** `+page.svelte`: after a successful run with no rows (for example `DROP TABLE x`), the grid looks the same as a tab that never ran. Spec `2026-10-06-sql-editor-design.md` "Run": "A statement that returns no rows shows 'The statement ran. It returned no rows.'" Fix: add `sqlEditor.result.noRows` to all four catalogs and show it when the outcome is rows, the row list is empty, and the run was not cancelled.
3. **CatalogTree writes a stale column load into the new tree.** `CatalogTree.svelte` (column load): a load that finishes after a node switch writes into the new `columns` state with the same key. Fix: capture the tree (or node URL) before the `await` and drop the result when it changed.
4. **Dead branches.** `+page.svelte` passes `adminFeatures: true`, so `withAdminFallback` never returns `needs-admin-features` there. Remove the dead `needs-admin-features` / `adminHint` branches on this page and any key or prop that becomes unused. Keep `withAdminFallback` and its option if another caller uses it.
5. **Ternaries in `tabs.ts`** (the two `map` callbacks near `renameTab` and `setTabSql`). Use if/else.
6. **The tabs test saves empty SQL.** `tests/tabs.test.ts` "saves and loads": `setTabSql(emptyTabs(), emptyTabs().tabs[0].id, 'x')` uses two states with different random ids. Fix: create one state, then use its tab id. Assert that the loaded state holds `'x'`.
7. **Nested buttons.** `DownloadMenu.svelte`: `DropdownMenu.Trigger` renders a button and `Button` renders another one inside it. Fix: use the `child` snippet and pass its `props` to `Button`, as `src/lib/components/sidebar/LanguageMenu.svelte` does.
8. **`src/routes/sql-editor/+page.server.ts` has no effect.** The root `+layout.server.ts` already sets `ssr` and `prerender`. Delete the file if no other route-specific setting is in it.

## Task 4: Tables and Datasets

Files: `src/routes/data-browser/data-tables/+page.svelte`, `data-tables/detail/+page.svelte`, `datasets/+page.svelte`, `datasets/detail/+page.svelte`, `src/routes/sql-editor/+page.svelte` (only the `?node=` handoff), `src/lib/data-browser/*` and tests, the four locale catalogs (only `dataBrowser.*` keys).

Run this task after Task 3, because both touch `src/routes/sql-editor/+page.svelte`.

1. **Important. "Open in SQL Editor" runs on the wrong node.** Both detail pages navigate to `/sql-editor?sql=…` only. The SQL editor runs on `$currentNode`, not on the `?node=` node of the detail page. A share link for a table on node B, opened while node A is selected, runs the SQL on node A. Fix: pass `&node=<node URL>` too. The SQL editor reads `?node=`, waits for `whenOpenNodesSettled()` (`services/open-nodes-import.ts`), selects that node through the actions of `services/beacon-node.ts` (for example `selectNode` with the node found by URL), then removes `node` from the URL with the `sql` parameter. An unknown node URL shows a toast and keeps the current node.
2. **Drop ignores the way back.** `data-tables/detail/+page.svelte` uses `goto(LIST)` after a drop. Use `backTarget(...)` as the dataset Delete does.
3. **Wrong empty text.** `data-tables/+page.svelte`: with no tables in the default schema and no search, the list says "No tables match." Show an "empty" text when there is no search (new key in all four catalogs if none exists).
4. **Raw dates.** `datasets/+page.svelte` shows `lastModified.slice(0, 10)`, and `datasets/detail/+page.svelte` shows the raw ISO string. Use `$formatDate`. AGENTS.md "Translations".
5. **"Other schemas" cannot fold during a search.** `data-tables/+page.svelte`: `open={othersOpen || searching}`. Open the section once when a search starts, then let the user toggle it.
6. **Duplicate list code.** `data-tables/+page.svelte` `loadPaths()` repeats the literal `100000` and a raw `{file_path}` cast. Use `DATASET_LIST_LIMIT` and `parseEntries` from `data-browser/datasets.ts`.
7. **A failed schema load makes Preview final.** `datasets/detail/+page.svelte`: a failed schema load sets `columns = []`, so Preview shows "no columns" for good. Leave `columns` as `null` on failure and show the error.

## Task 5: Crawlers

Files: `src/lib/data-browser/crawlers.ts`, `src/lib/data-browser/tests/crawlers.test.ts`, `src/lib/components/data-browser/CrawlerDialog.svelte`, the four locale catalogs (only `dataBrowser.crawlers.*` keys).

1. **Important. The format list does not match the server.** `CRAWLER_FORMATS` in `crawlers.ts`. The reviewer reports: the server registers no ODV format (`beacon-core/src/runtime_builder.rs`), the crawler always skips Zarr and Atlas because their markers are `*.json` (`beacon-core/src/crawler/discovery.rs`), and GeoParquet and HDF5 can be crawled but have no checkbox. Delta and Iceberg folders become tables even with a format filter (`engine.rs`). First verify each claim in the server source at `d:/repositories/beacon/beacon-db/beacon-core/src/` (read only). Then make the list match the formats that a crawler can really find, with the exact format strings that the server compares. If the server source contradicts the reviewer, follow the server and say so in the report.
2. **The table-name example is not slugified.** `tableNameExample` in `crawlers.ts`. The server slugifies (`discovery.rs`): find the exact rule there (case, character mapping, trim). A crawler "Argo Floats" on folder `My Data/` gives `argo_floats_my_data` on the server, but the label shows `Argo Floats_My Data`. Apply the server rule and test it.
3. **Untranslated placeholders.** `crawlers.ts` puts the literal words `<folder>` and `<crawler>` into the example. Domain code returns a `Message` or takes the placeholder text as an argument, and the dialog translates it. New keys in all four catalogs.

## Task 6: Users & Roles

Files: `src/routes/node-management/users-roles/+page.svelte`, `src/lib/components/users-roles/*`, `src/lib/access/*` and tests.

1. **Important. Add Rule lists only public tables.** `AddRuleDialog.svelte` loads `makeBeaconClient(node).catalogs()`. The server returns only the tables that the caller's roles can read (`beacon-server/src/axum/client/tables.rs`), so an admin cannot pick a table that anonymous users cannot read. Issue #160: "Table: select from the node's tables." Fix: load through `withAdminSession(node, (client) => client.catalogs())`. Keep the free-text input as the fallback when the list is empty or the load fails.
2. **An older load can win.** `+page.svelte` `load()`: two loads can run at once (two quick chip removals), and the last answer to arrive wins. Give each load a sequence number and ignore an answer that is not from the latest load.
3. **The password mask misses the quoted form.** `NewUserDialog.svelte`: the error mask finds the password only as typed. The SDK doubles each `'` in the SQL. Mask both `secret` and `secret.replace(/'/g, "''")`. If the mask is a function in `src/lib/access/`, test it there.
4. **The roles detail ignores the filter.** `RolesPanel.svelte` `current` falls back to `roles`, not to the filtered `list`. A filter that hides the selected role still shows it, and its actions work. Pick `current` from `list`; show the empty detail when `list` is empty.
5. **Dead 409 branches.** `NewUserDialog.svelte` and `NewRoleDialog.svelte`: the SDK sends every create through `POST /api/query`, which gives 400 for a duplicate, so the `ApiError` 409 branches never run. Delete them and the `exists` flag. The check against the loaded list stays.

## Task 7: System Info and cross-cutting

Files: `src/lib/system-info/host.ts` and tests, `src/routes/system-info/+page.svelte`, `vite.config.ts`, `AGENTS.md`, the four locale catalogs, `src/lib/services/tests/node-form.test.ts`, `src/lib/components/plots/PlotConfigPanel.svelte`, `src/lib/services/beacon-node-health.ts`, plus Prettier on the branch files.

Run this task last among the code tasks, because step 9 formats the files of all tasks.

1. **"##1".** `host.ts` falls back to the core name `#<n>`, and the page adds `#` again. Fall back to `String(index + 1)`. Update the test.
2. **Unused field.** `HostView.physicalCores` in `host.ts` is never used. Remove it and its test lines.
3. **Unused define.** `vite.config.ts` `basePathFlag()` defines `__BASE_PATH__`, which no file reads, and logs on every load. Delete it and its use. Check with a search first.
4. **AGENTS.md:**
   - The persisted-data table lists "data-browser node", but `stores/data-browser-node.ts` is deleted. Remove that entry.
   - Add the SQL editor tabs (`beacon-studio.sql-tabs`) to the table, in the class "Preference or UI state" (the spec calls it UI state).
   - In "Frontend Conventions", the body-text rule: add the exception that a stat tile value (`components/system-info/StatTile.svelte`) uses `--font-size-lg`.
5. **Telemetry privacy text names a fixed host.** `settings.field.telemetryEnabled.description` in all four catalogs says "beacon-datalake.org", but a brand can change `BRAND.endpoints.telemetry`. Remove the host name from the text in all four languages.
6. **Orphan key.** Delete `admin.signIn.help` from all four catalogs. Search first: it must have no use.
7. **Flaky test.** `node-form.test.ts` "sees admin input when either field holds text" times out at 5 s under load, because it pays the cold dynamic import. Warm the imports once in a `beforeAll` (import the same modules), and keep `vi.resetModules()` per test.
8. **Old ESLint errors.** `npm run lint` reports 7 × `svelte/require-each-key` in `PlotConfigPanel.svelte` and 1 unused `_removed` in `beacon-node-health.ts`. Fix all 8 without a change in behavior.
9. **Prettier.** Run `npx prettier --write` only on the files that this branch changed against `main` (`git diff --name-only main -- src` plus untracked files under `src`), not on the whole repo. Then `npx prettier --check` on the same list must pass. Do not touch other files.
10. Run the full gates: `npm test`, `npm run check`, `npm run lint`. Report the output. `npm run lint` also runs `prettier --check` on all of `src`, which still fails on files that `main` already had; report the count, and confirm no branch file is in it.

## Task 8: Verification

Not a subagent task. The controller runs the gates and the smoke test with the Playwright MCP, with the user for the admin sign-in.

## Task 9: Issue texts

Not a subagent task. The controller writes the SDK issue for `beacon-ts` and the comment for #161.

## Task 10: Docs cleanup

Not part of this run. The user reviews AGENTS.md first.
