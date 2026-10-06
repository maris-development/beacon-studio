# SQL editor (step 2)

Date: 2026-10-06
Status: draft for review
Roadmap: [admin-mode-roadmap.md](../admin-mode-roadmap.md)
Depends on: [step 1, admin mode foundation](2026-10-05-admin-mode-foundation-design.md) (`withAdmin`, `NodePicker`, the `adminFeatures` setting)

## Goal

Add a SQL editor page for power users. A user writes SQL, runs it on the global Beacon node, and sees a preview of the result.
The page needs no admin for a SELECT. A statement that needs the super-user runs as admin through the step 1 sign-in.

## Scope

In:
- Monaco SQL editor with tabs and Ctrl+Enter.
- Catalogue tree: catalog > schema > table > columns, with a filter. A click inserts the name.
- Autocomplete: tables, functions, keywords and column names.
- Run the selection only, when text is selected.
- Preview of at most 500 rows. Stop keeps the partial rows.
- Download of the full result: CSV, Parquet, Arrow IPC, NetCDF.
- Explain and Explain Analyze as a plan tree.

Out (see the roadmap):
- The query metrics dialog. The server does not yet produce that response reliably.
- SQL in the query store, blocks, share links, viewers, Query History and Saved Queries. A later sub-project "SQL in Studio" adds them.
- A saved-SQL list.
- Telemetry events.

## Server facts

- `POST /api/query` with `{sql}` runs a SELECT anonymously or with a bearer token.
- DDL, DML, `REFRESH` and `ALTER` need the super-user. The server refuses them with status **400** and the body
  `operation not permitted: this statement requires super-user privileges` (`beacon-core/src/statement_plan/mod.rs:70`, `:75`).
  The refusal happens during plan validation, before anything runs.
- A node with `config.sql.enable = false` answers status 400 with `SQL queries are not enabled`.
- `catalogs`, `tableSchema`, `functions`, `explainQuery` and `explainAnalyzeQuery` need no admin.

## Behaviour

### Route and menu
- Route: `/sql-editor`. Not under `/queries`: the "Queries" menu item matches every path under `/queries`, so it would show as active on this page too.
- Menu: "SQL Editor" in the group "Data Access", after "Queries". Always visible.

### Layout
- Top: `NodePicker` (global node).
- Left: catalogue panel. On a narrow screen (below 768px) it opens from a button.
- Right, top to bottom: tabs, toolbar, editor, result area.
- Toolbar: Run (Stop while busy), Explain, Analyze, Download menu.

### Tabs
- A tab holds `{ id, title, sql }`. Tabs are global, not tied to a node.
- Tabs persist in localStorage, key `beacon-studio.sql-tabs`. This is UI state: read with defaults, no migration.
- A bad or missing stored value gives one empty tab named "Query 1".
- The result of a tab lives in memory only. A reload clears results.
- Closing the last tab leaves one new empty tab.

### Run
- Ctrl+Enter (Cmd+Enter on macOS) and the Run button run the selection when text is selected, otherwise the full tab text.
- An empty statement after trim does nothing.
- One action at a time: a new Run, Explain or Analyze aborts the running action.
- Stop aborts and keeps the rows already received.
- The preview streams with `queryBatches` and stops at 500 rows. It then aborts the request and shows
  "First 500 rows. Download for the full result."
- A statement that returns no rows shows "The statement ran. It returned no rows."

### Explain and Analyze
- Explain calls `explainQuery`. Analyze calls `explainAnalyzeQuery`.
- The result area shows the plan as a tree. Each node can fold.

### Download
- The Download menu offers CSV, Parquet, Arrow IPC and NetCDF.
- It calls `queryRaw(sql, format)` and saves the full result as a file named `query-<timestamp>.<ext>`.
- Download uses the same statement rule as Run (selection or full text).

### Admin refusal
For Run, Explain, Analyze and Download:
- The page sends every statement as a normal user first.
- On a super-user refusal with "Show admin features" on: send it again through `withAdmin`. That call can open the sign-in dialog.
  A cancel of the sign-in shows "Cancelled." in the result area.
- On a super-user refusal with the setting off: show the server message and the hint
  `Turn on "Show admin features" in Settings`.
- Detect the refusal with status 400 and the text `requires super-user privileges`.

### Errors
- SQL off on the node: show "SQL is turned off on this Beacon node." The buttons stay enabled, because the user can pick another node.
- Any other error: show the server message in the result area as an error block. Do not use a toast.
- No node selected: the page shows the `NodePicker` and the text "Pick a Beacon node." The buttons are disabled.

### Catalogue
- Loads with one `catalogs()` call. The default catalog and schema open on load.
- The columns of a table load when it opens (`tableSchema(name, { catalog, schema })`). They show name and type.
- A Beacon table can have more than 100,000 columns. The tree shows 500 columns at a time, with a "Show more" button.
- The filter matches catalog, schema, table and loaded column names, and opens the matches.
- A Refresh button loads the tree again.
- A click on a table inserts its name, quoted and qualified when needed. A click on a column inserts its name, quoted when needed.
- The tree caches by node URL for the life of the page. A node change loads the tree of that node.

### Autocomplete
- Tables: the qualified name outside the default catalog and schema.
- Functions from `functions()`, inserted as `name($0)`.
- SQL keywords.
- Column names of every table whose columns are loaded. At most 5,000 column entries in total, to keep the editor fast.
- A `functions()` failure removes function entries only. It shows no error.

## Units

### Domain: `src/lib/sql/` (plain TypeScript, no Svelte, unit tested)

New domain folder beside `query/` and `geo/`. Layer: `beacon-api` → `query` / `geo` / `sql` → `stores` → `components` → `routes`.

| File | Responsibility |
|---|---|
| `tabs.ts` | Tab model, read and write of `beacon-studio.sql-tabs`, defaults. |
| `statement.ts` | `sqlToRun(text, selection)`, `isSuperUserRefusal(error)`, `isSqlDisabled(error)`. |
| `identifiers.ts` | `quoteIdent(name)`, `sqlName(catalog, schema, table, defaults)`. |
| `catalog.ts` | Tree from `catalogs()`, lazy columns from `tableSchema`, cache by node URL. |
| `completion.ts` | Completion entries from catalogue, functions and keywords. No Monaco import. |
| `run.ts` | `runPreview(client, sql, { limit, signal })`: batches into plain rows and column names, with `truncated` and `cancelled`. |
| `privilege.ts` | `withAdminFallback`: the admin refusal rule, with the admin runner passed in, so it has no service import. |
| `download.ts` | Formats and their file names. |

### Components: `src/lib/components/sql-editor/`

| File | Responsibility |
|---|---|
| `SqlEditor.svelte` | Monaco in `sql` mode, completion provider, Ctrl+Enter, `insert(text)`. |
| `SqlTabs.svelte` | Tab bar: add, close, rename, select. |
| `CatalogTree.svelte` | The tree, filter, refresh, click to insert. |
| `ResultGrid.svelte` | Rows into `DataTable`, pages of 100 rows. |
| `PlanTree.svelte` | Foldable plan tree. |
| `DownloadMenu.svelte` | Format menu and file save. |

### Shared Monaco setup
- `src/lib/monaco/environment.ts` sets `self.MonacoEnvironment` one time (editor worker, JSON worker).
- `QueryTextEditor.svelte` and `SqlEditor.svelte` both import it. Neither sets `MonacoEnvironment` itself.

### Route
- `src/routes/sql-editor/+page.svelte`: orchestration only. It holds the action state and connects the parts.

## Testing

- Unit tests (Vitest, set up in step 1) for every file in `src/lib/sql/`:
  - `tabs.ts`: defaults, bad JSON, close of the last tab.
  - `statement.ts`: selection, full text, empty text, both error matchers, a 400 with other text.
  - `identifiers.ts`: plain name, name with capitals, quotes or spaces, default and other schema.
  - `catalog.ts`: tree shape, lazy load runs once per table, cache by node URL.
  - `completion.ts`: qualified names, function snippets, loaded columns only.
  - `run.ts`: stop at the limit with `truncated`, abort with `cancelled`, empty result.
- Manual tests: a node with SQL on, a node with SQL off, a privileged statement with the setting on and off, and the JSON query editor (shared Monaco setup).
- Run `npm test`, `npm run check` and `npm run lint`.

## Open items

- Server request: return 403 for the super-user refusal, so Studio does not match on message text.
- Telemetry: a `sql.run` event needs the server name list first.
