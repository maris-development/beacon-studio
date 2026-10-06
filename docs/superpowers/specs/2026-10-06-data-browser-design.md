# Data browser: Tables, Datasets, Crawlers (steps 3, 4, 5)

Date: 2026-10-06
Status: draft for review
Roadmap: [admin-mode-roadmap.md](../admin-mode-roadmap.md) (research facts and decisions, section "Sub-project notes")
Depends on: [step 1](2026-10-05-admin-mode-foundation-design.md) (`withAdmin`, `AdminAction`, `NodePicker`, `adminOnly` menu items) and [step 2](2026-10-06-sql-editor-design.md) (`parseSchema`, `buildTree`, `filterTree`, `quoteIdent`, `runPreview`, `ResultGrid`, `saveBlob`)

## Goal

Replace the data-browser pages with Tables, Datasets and Crawlers screens that match the features of `beacon-web`.
Normal users browse and preview. Admin features add create, refresh, drop, upload, download, delete and crawlers.

## Build order

One spec, three plans and builds:

1. **Tables** (step 3). It builds the shared parts.
2. **Datasets** (step 4).
3. **Crawlers** (step 5).

Each build ships on its own.

## Scope

Out:
- An upload does not start a crawler (same as beacon-web). Later: offer to run the crawlers of the folder after an upload. Server request: implement `event_driven`.
- "Open in Query Builder". Later: check first whether the builder can take a table from the URL.
- Server-side dataset search with `pattern`.
- A set-and-forget admin sign-in. See the roadmap, future work.

## Shared parts

### Routes and menu

The existing paths stay, because share links use them.

| Page | Route | Menu |
|---|---|---|
| Landing page | `/data-browser` | Data Browser |
| Tables list | `/data-browser/data-tables` | Data Browser > Data Tables |
| Table detail | `/data-browser/data-tables/detail?table_name=…&node=…` (+ `&catalog=…&schema=…` outside the default schema) | none |
| Datasets list | `/data-browser/datasets?folder=…` | Data Browser > Datasets |
| Dataset detail | `/data-browser/datasets/detail?file=…&node=…` | none |
| Crawlers | `/data-browser/crawlers` (new) | Data Browser > Crawlers, `adminOnly` |

- A detail URL without `catalog` and `schema` means the default catalog and schema. Old share links therefore keep working.
- Every page uses `page-wrapper` and `page-container`.

### Client
- The pages use the SDK through `makeBeaconClient`, not the legacy `BeaconClient`.
- One exception: the crawler run report. See "Crawlers, run".

### Node
- List pages and the Crawlers page use the global node through `NodePicker`.
- Detail pages take the node from `?node=` (`findByUrl`, else a client for that URL with no token), as today. A share link opens the right node in another browser.

### The way back
- A list builds each detail link with `&back=<list URL with folder, search and page>`.
- The detail page shows "← Tables" or "← Datasets" at the top. It goes to `back`.
- `backTarget(back, fallback)` accepts only a relative path that starts with the data-browser root under the base path. Anything else (absent, absolute URL, `//host`, another route) gives the plain list.

### Domain: `src/lib/data-browser/` (plain TypeScript, unit tested)

| File | Responsibility |
|---|---|
| `back.ts` | `backTarget`, and the detail link with `back`. |
| `folders.ts` | Folder tree from a flat path list: children of one folder, file counts, path parts, sort. |
| `preview.ts` | Preview queries and "Open in SQL Editor" queries for tables and datasets. Format to `from` key and `read_<fn>` names. |
| `external-table.ts` | File types with hints, and the request body of "Create external table". |
| `crawler-form.ts` | Crawler form values to and from the crawler definition. Schedule unit conversion. Table name examples. |

Tests go in `src/lib/data-browser/tests/`.

### Temporary direct call: `src/lib/beacon-api/crawler-run.ts`
- `POST /api/admin/crawlers/{name}/run` with Basic auth, returning a typed `CrawlReport`.
- One function, with a comment that names the SDK issue (`runCrawler()` returns `void`).
- Remove it when an SDK release returns `CrawlReport`.

### Components: `src/lib/components/data-browser/`

| Component | Responsibility |
|---|---|
| `BackLink.svelte` | "← <label>" to `backTarget(...)`. |
| `SchemaTable.svelte` | Column, type, nullable; a filter; 500 columns at a time with "Show more". |
| `PreviewGrid.svelte` | Loads and shows a preview through `runPreview` and `ResultGrid`. Loads when shown. |
| `AdminOnlyNotice.svelte` | "This page needs admin features. Turn on *Show admin features* in Settings." with a link. |
| `FolderPicker.svelte` | Picks a dataset folder. Used by Create external table and the crawler form. |

### Preview
- 100 rows (`DETAIL_PREVIEW_ROWS = 100`), one page of `ResultGrid`.
- `runPreview` accepts an SQL string or a structured query (`QueryInput`). The SDK `queryBatches` accepts both.

### Actions, confirms, errors
- Admin controls sit inside `AdminAction`: greyed out with the hint while "Show admin features" is off.
- Admin calls go through `withAdmin`. An explicit admin button does not try as a normal user first.
- Drop, Delete file and Delete crawler ask first with `askConfirm({ destructive: true })`. The text says what stays.
- A load error shows inline on the page. A failed action shows a toast with `adminErrorMessage`.

## Tables (step 3)

### List
- Top: `NodePicker`, search, and a "Create" menu inside `AdminAction`: View, Materialized view, External table.
- Default schema: a flat list. Row: name, "Table" or "View" badge, "Default" for the default table.
- "Other schemas": a folded section with the tree of every other catalog and schema (`buildTree`, `filterTree` from `src/lib/sql/catalog.ts`).
- Search filters both parts and opens "Other schemas" when a match is there.
- A row opens the detail page with `back`.

### Detail
- Header: "← Tables", name, kind badge, `catalog.schema`.
- Actions: "Open in SQL Editor"; Refresh (not for a view) and Drop, both in `AdminAction`, both for the default schema only.
- Tabs:
  - Schema: `tableSchema(name, { catalog, schema })` in `SchemaTable`.
  - Preview: `SELECT * FROM <sqlName> LIMIT 100`. Loads when the tab opens.
  - Definition: `admin.tableDefinition`, with Copy. Setting off: the admin hint. Setting on: loads through `withAdmin` when the tab opens. `null`: "Beacon stores no definition for this table. A crawler made it, or it is an older table."
- Refresh: `REFRESH <name>` through `withAdmin`, then a toast.
- Drop: confirm ("The files stay in place."), `DROP TABLE IF EXISTS <name>` through `withAdmin`, then back to the list with a toast.

### Create view and materialized view
- Dialog: name and SQL (monospace text area).
- Statement: `CREATE [MATERIALIZED] VIEW <quoteIdent(name)> AS <sql>` through `withAdmin`.
- On success: open the detail page of the new view.

### Create external table
- Replaces `CreateTableModal`.
- Fields:
  - Name.
  - Location: text, plus "Pick folder" (`FolderPicker`) and a glob suffix.
  - File type: the 14 server types with hints (PARQUET, GEOPARQUET, CSV, ARROW, NC, HDF5, ZARR, ATLAS, TIFF, BBF, ODV, DELTA, ICEBERG, REMOTE).
  - Partition columns.
  - Option rows.
  - "Only if it does not exist".
- A folded "Request" shows the JSON.
- Call: `admin.createExternalTable({ name, location, file_type, partition_cols?, options?, if_not_exists })` through `withAdmin`. Send `partition_cols` and `options` only when not empty.
- On success: open the detail page of the new table.

## Datasets (step 4)

### List
- Top: `NodePicker`, search, "Upload" in `AdminAction`, and the total from `totalDatasets()`.
- Load the paths with `datasets({ limit: 100000 })`. When the result holds 100,000 entries, show "This node has more than 100,000 files. The list is incomplete."
- Folder path: "All / argo / 2024". Each part is a link. The folder is `?folder=`.
- Rows: folders first (with file count), then files (name, format, size, modified). Sort by name, size or date on the client. 100 rows per page.
- Search: substring of the full path in all folders. The result is a flat list of full paths.
- Storage use (bar and free space, `admin.datasetStorage`): only when a session exists for the node. With no session, nothing shows and nothing asks.

### Upload
- Destination: the current folder, editable. Normalize it: trim, no leading `/`, no double `/`, a trailing `/`.
- Files: pick files, pick a folder (with sub-folders, `webkitdirectory`), or drop files and folders.
- "Replace existing files": off by default (`overwrite`). Without it, an existing file fails with "already exists" for that file.
- Files go one after another through `admin.uploadDataset(dest + relativePath, file, { overwrite, signal, onProgress })` inside `withAdmin`.
- Each file shows: waiting, uploading, done, or failed with the reason. One progress bar weighted by bytes.
- "Retry failed" sends only the failed files. "Stop" aborts the running upload; a close of the dialog also stops it.
- When done: reload the list and show "To query these files, create a table: run a crawler, or use Create external table." Both are links. "run a crawler" shows only with admin features on.
- Replaces `UploadDatasetsModal`.

### Detail
- Header: "← Datasets" (back to the folder), path, format, size, modified.
- Actions: "Open in SQL Editor"; Download and Delete, both in `AdminAction`.
- Download: `admin.downloadDataset(path)` through `withAdmin`, then `saveBlob`.
- Delete: confirm ("A table that reads this file stops working."), `admin.deleteDataset(path)` through `withAdmin`, then back to the folder with a toast.
- Tabs:
  - Schema: `datasetSchema(file)` in `SchemaTable`.
  - Preview: `{ select: <schema columns>, from: { <format key>: { paths: [file] } }, limit: 100 }`. Format key: `nc` to `netcdf`, missing to `parquet`, else the format.
- `can_inspect: false`: Schema and Preview show "Beacon cannot read this file format."

## Crawlers (step 5)

### Access
- Setting off: `AdminOnlyNotice`.
- Setting on: the page loads the list through `withAdmin`, so it can open the sign-in dialog on load. On cancel: "Sign in to see the crawlers of <node>" with a Sign in button, and no second automatic dialog.

### List
- `NodePicker` and "New crawler".
- A card for each crawler: name, folder, formats ("All formats" or the list), naming ("Folder name" or "Crawler name + folder name"), partitions on or off, schedule ("Every 6 hours" or "Only on Run"), number of options. Buttons: Run, Edit, Delete.
- Empty list: "No crawlers on this node, or the node could not list them." The server returns `[]` also on a failure.

### Run
- Synchronous on the server. The card shows a busy state while it runs.
- Report under the card: "Found N tables."; Created and Updated (names link to the table detail pages); Skipped ("owned by another crawler or made by hand"); Failed (name and reason); "N files matched no format."
- The report stays until the page reloads.
- Uses `beacon-api/crawler-run.ts` (temporary).

### Create and edit
- Name: read-only on Edit.
- Folder (`target_prefix`): `FolderPicker` plus free text. A folder with no files shows a warning: "This folder holds no files. The crawler creates no tables."
- Formats (`format_filter`): checkboxes from the beacon-web list. None checked sends `null` (all formats).
- Table names (`table_naming`): "Folder name" (`leaf_prefix`) or "Crawler name + folder name" (`crawler_prefixed`), each with an example from the chosen folder.
- "Find partitions in folder names" (`detect_partitions`): on by default.
- Schedule (`schedule_secs`): "Only on Run" (`null`) or "Every N minutes/hours".
- Options: key/value rows.
- `event_driven` is not in the form (not implemented on the server). Edit keeps the stored value.
- Save: `admin.createCrawler(definition)` through `withAdmin`. Edit sends `replace: true`. A 409 on create shows "A crawler with this name exists."

### Delete
- Confirm: "Tables that this crawler made stay. Delete them on the Tables page."
- `admin.dropCrawler(name)` through `withAdmin`.

## Change to step 2
- The SQL editor reads `?sql=`, opens it in a new tab without a run, and removes the parameter from the URL.
- `runPreview` accepts `QueryInput` (SQL string or structured query).

## Testing
- Unit tests in `src/lib/data-browser/tests/` for every domain file:
  - `backTarget`: absent, absolute URL, `//host`, another route, a valid list URL with parameters, base path.
  - Folder tree: root, nested folders, counts, sort, a path with a trailing `/`.
  - Preview and SQL Editor queries: default and other schema, quoted names, each format key.
  - External table body: optional fields left out when empty.
  - Crawler form: round trip definition to form to definition; schedule units; `null` formats; examples for both naming modes.
- Unit tests for `crawler-run.ts` with a mocked `fetch`: report parse, 400 error, Basic auth header.
- A test that `runPreview` accepts a structured query.
- Manual tests: one list per build, in its plan.
- Run `npm test`, `npm run check` and `npm run lint` on the changed files.

## Open items
- SDK issue (user submits): `runCrawler()` returns `CrawlReport`. Then remove `crawler-run.ts`.
- Server: `GET /api/admin/crawlers` returns `[]` on error. Dataset delete has no "in use" check.
