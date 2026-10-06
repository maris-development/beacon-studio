# Admin mode roadmap

Read this file first. It holds the state of the admin mode work, every decision so far, and the next step.
Agents: update this file when you finish a stage (spec, plan, build). Keep it short. Link to specs and plans for detail.

## Goal

Move the admin features of `beacon-web` (`beacon/beacon-clients/beacon-web`) into Beacon Studio.
Users who are not technical must see almost no change.

## Status

| # | Sub-project | Spec | Plan | Build |
|---|---|---|---|---|
| 1 | Admin mode foundation | [spec](specs/2026-10-05-admin-mode-foundation-design.md) | [plan](plans/2026-10-05-admin-mode-foundation.md) | Code complete, not committed. Verified 2026-10-06: 26 tests pass, `npm run check` clean, no new lint errors. Manual test (plan Task 8 Step 6) still open. |
| 2 | SQL editor with catalogue | [spec](specs/2026-10-06-sql-editor-design.md) (draft, user review pending) | - | - |
| 3 | Tables | - | - | - |
| 4 | Datasets | - | - | - |
| 5 | Crawlers | - | - | - |
| 6 | Users and roles | - | - | - |
| 7 | System info | - | - | - |

Sub-projects 2 to 7 depend only on sub-project 1. Their order is free.

## Process

1. Brainstorm with the user (`superpowers:brainstorming`). Ask one question at a time.
2. Write the spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. The user reviews it.
3. Write the plan to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` (`superpowers:writing-plans`). The user reviews it and picks the execution method.
4. Build. Then update the status table above.

Rules from the user for this work:
- Do not commit unless the user writes "commit". Never create a branch.
- An answer of the user in a brainstorm is input, not a final decision. Give your own view and disagree when you have a reason.
- Check a fact in the code before you state it. An earlier wrong guess: "the node picker changes the node of query blocks". It does not. A block keeps its own node.

## Decisions

Each line: the decision, then the reason.

### Setting and visibility
- One setting, "Show admin features" (`adminFeatures`), group `System`, default off. There is no sidebar toggle. The setting keeps the UI the same for normal users.
- Pages with no value for normal users (Crawlers, Users & Roles) are `adminOnly` menu items. They are hidden while the setting is off.
- Pages for everyone (Datasets, Data Tables, System Info, SQL Editor) always show. Their admin controls are greyed out while the setting is off, with the hint `Turn on "Show admin features" in Settings`.
- An admin-only page opened by URL with the setting off shows a short notice with a link to Settings. Sub-project 5 adds it, because it adds the first admin-only page.

### Sign-in
- A sign-in belongs to one node. A session on node A gives no rights on node B.
- Studio asks for a sign-in only when the user starts an admin action. The dialog title is "Sign in to Beacon node <name>".
- Credentials go in `sessionStorage` (option A). They go away when the tab closes. Reason: Basic auth sends the real super-user password.
- Future work: the convenience of saved credentials with the security of `sessionStorage`. One option: a non-extractable `CryptoKey` in IndexedDB that encrypts the saved password.
- A 401 removes the session, asks again, and retries one time. A 403 shows a toast and keeps the session.
- "Signed in" and a "Sign out" link show under the node picker. No username shows. The sidebar shows no sign-in state.
- Every admin call goes through `withAdmin(node, fn)` in `services/admin-session.ts`. No page or modal asks for credentials itself.

### Menu
- Group names stay the same: "Data Access", "Explore and Analyze", "Node Management", "Beacon Studio".
- The SQL Editor goes in "Data Access", and is always visible.
- Crawlers and Users & Roles go in "Node Management", as `adminOnly` items.

### Node
- Admin and browse pages use the global node (`$currentNode`) through one shared `NodePicker`.
- `stores/data-browser-node.ts` is deleted. The data browser used a separate selection before.
- Query blocks keep their own node. The picker does not change them.

### Server facts (checked in `beacon-server`)
- Admin endpoints live at `/api/admin/...`. The `/admin/api/...` path is an alias (`beacon-server/src/axum/router.rs`). Studio uses the default SDK prefix.
- `GET /api/admin/check` returns 200 for an admin and 401 otherwise.
- `/api/admin/upload-file` and `/api/admin/create-table` do not exist. The old Studio modals called them. Upload now uses `admin.uploadDataset`. Create Table is wired to `admin.createExternalTable`, but its body is the old shape. Sub-project 3 fixes the body.
- `@maris-development/beacon-client` 2.0.0 has every endpoint that the admin screens need. Studio adds UI only.

### Feature baseline for sub-projects 3 and 4
The `beacon-web` pages set the minimum. See the table in the [step 1 spec](specs/2026-10-05-admin-mode-foundation-design.md#sub-projects).
- Tables: list, schema, preview; admin: table definition, refresh, drop, create external table, create view.
- Datasets: search with total, schema per file, preview; admin: chunked upload with progress, download, delete, storage use.

## Sub-project notes

Short notes that are not in a spec yet. Move them into the spec when it is written.

- 2 SQL editor: for power users too, not admin only. Includes a catalogue of tables and their fields.
  - Decision (2026-10-06): option C. Step 2 is a separate page, outside the query store, blocks and share links. The result shape stays ready for a later "open in viewers" handover. That handover is its own sub-project.
  - Decision (2026-10-06): privileged SQL runs as admin only when the server refuses it. Run as a normal user first. On refusal with "Show admin features" on, run again through `withAdmin`. With the setting off, show the error and the settings hint.
  - Server signal for that refusal: status **400** (not 401/403), body `operation not permitted: this statement requires super-user privileges`. The server refuses during plan validation, before it runs anything, so the retry cannot run a statement twice. Match the text `requires super-user privileges`.
  - Decision (2026-10-06): editor tabs, saved in localStorage. No saved-SQL list in step 2. Reason: a second "saved" concept beside Saved Queries needs a user-data migration later.
  - Decision (2026-10-06): fixed preview of 500 rows, as in beacon-web. Stream with `queryBatches` and stop at 500. Download (`queryRaw`) gets the full result. `queryCellLimit()` does not apply to this page.
  - Decision (2026-10-06): features of step 2: Monaco SQL with Ctrl+Enter and tabs; catalogue tree with filter and click-to-insert; autocomplete of tables, functions, keywords and column names (from the loaded catalogue); run the selection only when text is selected; Stop keeps partial rows; download CSV, Parquet, Arrow IPC, NetCDF; Explain and Explain Analyze as a plan tree.
  - Later: query metrics dialog (`queryMetrics`). Left out because the server does not yet produce that response reliably.
  - Later sub-project "SQL in Studio" (after step 2, not admin work): SQL results in the map, table and chart viewers, plus SQL in Query History and Saved Queries. Explore both in one brainstorm.
  - Server request (open): return 403 for this refusal, so Studio does not match on message text.
  - Future, separate task: maybe move the JSON query model to SQL completely. Not part of the admin work.
  - Path: not `/queries/workbench`. That route is the visual query builder and the share-link target (`SHARE_LINK_PATH`).
  - Server: a plain SELECT needs no admin. `POST /api/query` with `{sql}` works anonymously or with a bearer token. DDL, DML, REFRESH and ALTER need the super-user (`validate_query_plan` in `beacon-core/src/statement_plan/mod.rs`). A server with `config.sql.enable = false` answers 400 "SQL queries are not enabled".
  - Catalogue endpoints (`catalogs`, `tableSchema`, `functions`, `explainQuery`) are on the client router, so they need no admin.
  - beacon-web workbench (`pages/workbench.tsx`): Monaco SQL with tabs saved in localStorage; autocomplete of tables, functions and keywords (no columns); Ctrl+Enter runs the full tab; stream with `queryBatches`, stop at 500 rows; Stop keeps partial rows; download through `queryRaw` (CSV, Parquet, Arrow IPC, NetCDF); explain and explain-analyze as a plan tree; query metrics dialog. Catalogue tree: catalog > schema > table > columns (lazy `tableSchema`), with a filter; a click inserts the quoted name.
  - Studio today: `QueryTextEditor.svelte` hard-codes `language: 'json'` and loads the full `monaco-editor`. `queryStore.ensure()`, `StoredQuery` and `SharedQuery` accept a `CompiledQuery` only, so a SQL result cannot reach the map, table or chart viewers yet.
- 5 Crawlers: auto-create tables when datasets are uploaded.
- 7 System info: extend the current `/system-info` page with CPU and memory (`GET /api/info`) and health.
