# AGENTS.md

## Purpose
This file is a quick operational guide for coding agents working in this repository.

## Project Snapshot
- Name: beacon-studio-sv
- Stack: SvelteKit 2, Svelte 5, TypeScript, Vite 6, Tailwind CSS 4, SCSS
- Build target: static site via `@sveltejs/adapter-static` into `build/`
- Runtime model: mostly client-side (`ssr = false` on layout and key routes)
- Domain: Beacon data exploration (query building/editing + map/table/chart visualizations)

## Platform Strategy (Important)
- **Develop web-first.** The browser is the primary target; build, test, and validate
  changes against `npm run dev` / `npm run build` (static web) first.
- Tauri/desktop (`npm run tauri:dev`, `npm run tauri:build`) is supported and must
  keep working, but it is secondary. Don't introduce desktop-only assumptions
  (native APIs, Tauri plugins) into shared code paths unless web has an equivalent
  or graceful fallback.

## API Client Strategy (Important)
- Studio uses `@maris-development/beacon-client` (source in the `beacon` repo, `beacon-clients/beacon-ts`). Build a client with `makeBeaconClient` (`src/lib/beacon-api/client.ts`). Use the SDK query builder and result decoding. Do not write local copies.
- The legacy `BeaconClient` class in `src/lib/beacon-api/client.ts` remains for these uses only:
  - query download (`queryToDownload`) and the output formats (`output_formats`, `outputFormatToExtension`);
  - the cached table lists of the query builder (`getCachedTables`, `getCachedDefaultTable`);
  - `ChooseBeaconModal.svelte`;
  - the static cache facade (cache stats, clear, on/off, `recordDownload`). It only calls `queryStore`. Run and peek a query on `queryStore` itself.
  Add no new use. Move a remaining use to the SDK when you touch it.
- The SDK class is also called `BeaconClient`. Check the import source of `BeaconClient` in every file.
- One temporary exception: `src/lib/beacon-api/crawler-run.ts` calls `POST /api/admin/crawlers/{name}/run` itself, because the SDK `admin.runCrawler()` returns `void` and drops the crawl report. Delete the file and `beacon-api/tests/crawler-run.test.ts` when an SDK release returns the report. Add no other direct calls.
- SDK 2.0.0 drops a stop after the response headers and never cancels the body. `runPreview` (`src/lib/sql/run.ts`) races each batch read against the signal as a workaround. Remove the race when an SDK release holds beacon PR #591. `readLimited` in the same file reads the body with its own reader and cancels it on a stop, so it needs no race.

## Core Commands
- Install deps: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Type check: `npm run check`
- Lint: `npm run lint`. Use this command for every lint check. Do not run `eslint` or `prettier --check` by hand.
- Format one file: `npx prettier --write <file>`. Do not run `npm run format`.

## Formatting (Prettier)
- `.prettierrc` sets the house style: 4 spaces, double quotes, width 120. Most files still have the old style (tabs, single quotes, width 100).
- The new style comes in step by step. Do not format the whole repository, and do not run `npm run format`. One large format commit causes merge conflicts in every open branch.
- `npm run lint` runs ESLint on all of `src`, and the Prettier check only on the `src` files that differ from `main` (`scripts/prettier-changed.js`). Set `PRETTIER_BASE` for another base branch.
- When `npm run lint` reports a file, format it with `npx prettier --write <file>`. Format only the files that the task changes.
- Fix every ESLint error in a file that the task changes.
- When you commit, put the formatting in its own commit, before the commit with the real change. A reviewer then sees the real change apart from the formatting. This rule does not ask for a commit.

## Deployment/Base Path
- `svelte.config.js` sets `kit.paths.base` from `BASE_PATH` env var.
- For subdirectory deploys, build with e.g. `BASE_PATH=//studio npm run build`. The `//` stops Git Bash path conversion; PowerShell takes `/studio` (README).
- Keep path handling consistent by using SvelteKit helpers (`resolve`, `asset`) already used in the codebase.

## Brands (Important)
A project changes the look through one folder, `src/brands/<name>/`. Guide: `src/brands/default/README.md`.

- Every brand lives on `main`. Do not make a fork or a branch per brand. `default` is the empty template, and `example` is a demo.
- `resolveBrand()` (`scripts/brand.js`) picks the brand: `STUDIO_BRAND`, else `default`. Set `STUDIO_BRAND` in the build of each project.
- Vite, svelte-check, ESLint and the SvelteKit child processes all load `svelte.config.js`. Keep `resolveBrand()` free of writes and logs.
- `kit.alias.$brand` points to the active folder. Import `$brand/theme.scss` only in `+layout.svelte`, after `tailwind.css`. A second import moves it into a shared chunk, and the CSS order breaks.
- A brand needs `brand.ts`, `theme.scss` and `locales.ts`. Add a new brand option only as a field of `BrandConfig` with a default. A new required file breaks the build of every brand.
- Read the name, logo, links and endpoints from `BRAND` (`@/brand`). Never put the app name, the logo import or a beacon-datalake.org URL in a component.
- `theme.scss` holds only `:root` tokens and `@font-face`. A brand changes a component through a token. When a project needs a hardcoded value changed, move it to a token in `src/tailwind.css` `:root`, with the current value as default.
- `brandPlugin` serves `src/brands/<name>/static/` in dev and copies it over `static/` in the client build. Do not use `kit.files.assets`. SvelteKit 2 marks it deprecated.
- `--map-draw` must stay a hex color. Terra Draw takes only hex.
- `--ring` and `--deny` have no definition. Several components read them, some with a fallback. A definition changes their look, so define them in a separate change.
- A brand can get a feature, for example a table catalog on the home page. Put the feature in shared code behind a `BrandConfig` field. ESLint limits a brand folder to config, so a feature never goes there or on a brand branch.
- A brand turns on a feature through `features` in `brand.ts`. Add the feature id to `BrandFeature` (`brand/define.ts`), and test `BRAND.features.includes(id)`. No feature exists yet: the first one changes `BrandFeature` from `never` to a union of ids.
- Never test the brand name in code. Test the feature id, so another brand can turn on the feature.
- The brand merge replaces an array whole. Only a plain object merges key by key.
- Planned home page pattern, not built yet: `home.sections` in `BrandConfig`, a list of section ids. `HomeSection` maps each id to a lazy component through `Record<HomeSectionId, …>`. Use it when one `{#if}` per section no longer fits. A brand then sets which sections show and their order.

## High-Level Architecture
- App shell and navigation:
  - `src/routes/+layout.svelte`
  - `src/lib/components/sidebar/AppSidebar.svelte`
- Landing and top-level sections:
  - `src/routes/+page.svelte`
  - `src/routes/queries/*`
  - `src/routes/visualisations/*`
  - `src/routes/data-browser/*`
- API client and query model:
  - `@maris-development/beacon-client` — preferred SDK; built via `makeBeaconClient` in `src/lib/beacon-api/client.ts`
  - `src/lib/beacon-api/client.ts` — also the legacy client; see "API Client Strategy" for its remaining uses
  - `src/lib/beacon-api/query.ts`
  - `src/lib/beacon-api/types.ts`
- Domain modules (no Svelte, no DOM — plain TypeScript, safe to unit test):
  - `src/lib/query/draft.ts` (`QueryDraft`, `compileDraft` — the builder's editable state, and the compile to `CompiledQuery`)
  - `src/lib/query/run-query.ts` (`RunQuery`: the query that `queryStore.ensure()` runs. A `CompiledQuery`, or `{ sql }` for a workbench SQL block. `QueryWorkspace.resultQueryOf(block)` gives it for both modes.)
  - `src/lib/query/seed-hydration.ts` (`hydrateDraftFromQuery` — the reverse: `CompiledQuery` back into a draft, best effort)
  - `src/lib/query/filter-types.ts` (`ParameterFilterType`, `SelectedFilterType` — the filter shapes the builder edits)
  - `src/lib/query/selection-status.ts`, `src/lib/query/functions.ts`
  - `src/lib/geo/spatial-selection.ts` (drawn area, and its conversion to query filters)
  - `src/lib/geo/coordinate-columns.ts` (`detectCoordinateColumns`)
  - `src/lib/access/*` (users and roles: name check, password, access summary, multi-step creates. No Svelte and no services.)
  - `src/lib/data-browser/*` (data-browser rules: `backTarget` for the safe "← back" link, folder tree, table statements, external-table body. Shared parts in `components/data-browser/`.)
  - `src/lib/system-info/host.ts` (`readInfo`: a safe read of `GET /api/info`. `cpu_usage` is already a percentage. `system_info` is `null` unless the server runs with `BEACON_ENABLE_SYS_INFO`; the admin route returns the same data.)
  - `src/lib/sql/*` (the SQL editor: tabs, statement rules, catalogue cache, completion, 500-row preview, admin fallback. `withAdminFallback` takes the admin runner as an argument, so this folder imports no service.)
- Shared state:
  - `src/lib/stores/query-store.svelte.ts` (persistent in-memory query-result cache; `queryStore.ensure()`)
  - `src/lib/stores/opfs-arrow-cache.ts` (OPFS tier under the query store: raw compressed Arrow IPC bytes, survives reloads/restarts)
  - `src/lib/stores/query-history.ts` (persisted log of executed queries; recorded by `queryStore.ensure()`, listed by `QueryHistoryModal`)
  - `src/lib/services/beacon-node.ts` (the single owner of the Beacon node list and the selection; read `$nodes` / `$currentNode` in a component, and write only through its actions)
    - Admin and data-browser pages use `$currentNode` through the shared `NodePicker`. Add no second node store.
    - A query block keeps its own node. The node picker does not change the node of a block.
  - `src/lib/services/admin-session.ts` (admin sign-in for each node: Basic auth in `sessionStorage`. Run every admin call through `withAdmin(node, fn)` or `withAdminSession(node, fn)`. `withAdmin` asks the one `AdminSignInDialog` for a sign-in, and retries one time after a 401. `withAdminSession` never asks, and a 401 there signs out. A remembered sign-in is also saved in `services/admin-vault.ts` (IndexedDB, encrypted). `restoreRememberedSessions` runs at the top of the `+layout.svelte` script. `requireAdminClient` awaits it. The layout renders the page only after the restore, or after 1 second, so a page never sees a remembered session arrive late. The sidebar and the header render at once. The vault stores a secret with a `kind`: the password now, the session token of beacon PR #590 later.)
    - A tab session holds the node id and the normalized node URL. A URL mismatch signs out. A session on node A gives no rights on node B.
    - Every sign-out also deletes the remembered secret: "Close admin session", a 401, a removed node, a URL change. A second open tab keeps its own tab session until the tab closes.
    - A 401 signs out, asks again and retries one time. A 403 shows a toast and keeps the session.
    - A non-extractable AES-GCM key encrypts the remembered secret. A script in the Studio origin can still decrypt it, and a full copy of the browser profile holds the key.
  - The layout `onMount` runs before the page mounts, because the layout holds the page back
    for the session restore. The `AppSidebar` `onMount` still runs before the layout `onMount`.
    The public node list is fetched in the layout `onMount`, but the fetch is async, so a
    first-ever visit has no node list when a page mounts. A page that names a
    node by URL (a share link) must wait for `openNodesSettled` / `whenOpenNodesSettled()`
    (`services/open-nodes-import.ts`) before it reports that node as missing. `AppSidebar`
    blocks a route that needs a node, and waits for the same flag, so a first visit is not
    sent home before the public nodes land.
  - `src/lib/stores/settings.ts` (persisted user settings; the `/settings` page builds its form from `SETTING_DEFINITIONS`. Read a value with `getSettings()` at the point of use, or `$settings` in a component. Never read it at module load.)
    - `setSetting` stores the whole settings object, defaults included. A new default therefore reaches only users with no stored settings. Example: `adminFeatures` is `true` since #161, but a user who changed any setting before #161 keeps `false`.
  - `src/lib/stores/toasts.ts` (global toasts)
- Heavy data operations (off-main-thread, one shared worker via `getArrowWorker()`):
  - `src/lib/workers/ArrowProcessingWorker.ts`
  - `src/lib/workers/ArrowProcessingWorkerManager.ts`

## Data Flow (Important)
1. User configures a query in the builder (`QueryBuilder.svelte`, on `/queries/workbench`) or in the raw editor (`/queries/query-editor`).
2. Query is compiled to `CompiledQuery` (`QueryBuilder` in `beacon-api/query.ts`).
3. Query is passed between pages via a gzipped URL payload (`?query=`). That payload is a `SharedQuery` (`stores/stored-query.ts`): the `CompiledQuery`, the query name, the node URL and an optional coordinate pair. Build it with `buildShareLink(record)`. Use `encodeSharedQuery` / `decodeSharedQuery`. The decode also reads the old shapes: a bare gzipped `CompiledQuery` with its node in `?instance=`, and `instanceUrl` in the payload. The `CompiledQuery` inside it also serves as the persistent cache key.
4. Visualizer pages call `queryStore.ensure(query)` (`stores/query-store.svelte.ts`) with `QueryWorkspace.resultQueryOf(block)`, which fetches once via `@maris-development/beacon-client` (`queryRaw()`) and caches the Arrow table in memory across navigations — switching map/table/chart reuses the result with no re-fetch.
5. Results arrive as a native (zstd) Arrow IPC stream; the raw bytes are persisted to OPFS (`stores/opfs-arrow-cache.ts`, best-effort, LRU + 24h TTL) and decoded app-side to an Arrow table (`getArrowDecoder()` from `@maris-development/beacon-client`, no Parquet round-trip). A memory-evicted or reloaded session rehydrates from OPFS instead of re-running the query. Cache keys include the Beacon node URL.
6. Heavy transforms (sort, dedup, min/max, map geometry) are delegated to one shared worker; the map derives its GeoArrow geometry client-side from lat/lon.
7. Every successful `queryStore.ensure()` records the query in the persisted query history (`stores/query-history.ts`), deduped by cache key (which includes the node URL) and snapshotting the node name, row count, duration, and timestamp. `QueryHistoryModal` in the action bar lists them, and opens each as a block on the current page. `query-editor` preloads a query from `?q=` or `?query=`.

## Query and Output Rules
- `queryStore.ensure()` requests the default Arrow IPC stream (omits `output`) and returns an Arrow table; the server accepts the local `CompiledQuery` shape via serde aliases (`query_parameters`→`select`, `for_query_parameter`→`column`, `filters`).
- Map viewer requires latitude/longitude query columns and builds the GeoArrow point geometry client-side (`ApacheArrowUtils.addPointGeometryColumn`). `detectCoordinateColumns` (`geo/coordinate-columns.ts`) is the single rule that finds those two columns by name. Use it; do not repeat the match.
- `beacon-api/data-type.ts` holds the checks on a schema `DataType` (number, string, Timestamp, Date, Dictionary). A schema type can be any Arrow type, so each check must accept an unknown value and never throw.
- A `Date32` / `Date64` column takes the same ISO filter strings as a Timestamp column (`2020-01-01T00:00:00Z`), so the builder gives both the timestamp filters (`isTemporalDataType`). The server drops the time from the literal (`gt 2020-06-16T12:00:00Z` excludes the whole 16th), so a date column gets a date-only input (`DateTimeInput` `dateOnly`) and stores `YYYY-MM-DD`. Arrow JS returns a date value as epoch milliseconds.
- `queryCellLimit()` (in the query store, backed by the settings store) protects browser stability; `limit_reached` warnings are surfaced with toasts.
- A SQL run has no column count before the result. `readLimited` (`sql/run.ts`) stops the stream at `cellLimit / columns` rows and cuts the table. The OPFS tier then stores the cut table (`tableToIPC`), not the bytes of the node.
- The legacy `BeaconClient` fronts I/O only. Transforms of a fetched result (sort, dedup, min/max, geometry) do no I/O and live on `queryStore`; call it directly for those, and do not add pass-through statics for them.

## Map Viewer and Spatial Filters
- `MapViewController` imports `maplibre-gl/dist/maplibre-gl.css`. Keep that import. Without it the zoom controls have no styling, the canvas stays in the normal flow and the map grows on every resize, and the draw tools get the wrong pointer coordinates.
- The map page (`routes/visualisations/map-viewer/+page.svelte`) keeps only the query effect, the area selection and the markup. `MapViewController` (`components/visualisation/MapViewController.svelte.ts`) owns the map, the deck.gl overlay, the popup and the result table. Add map behaviour to the controller, not to the page.
- deck.gl writes an inline `cursor` on the MapLibre canvas on **every frame** (`@deck.gl/core` `deck.js`, `container.style.cursor = this.props.getCursor(...)`). CSS can never win, not even with `:global` on `.maplibregl-canvas-container`. Change the cursor with the `getCursor` prop of `MapboxOverlay`.
- `MapboxOverlay.setProps({ layers })` replaces the **whole** layer array. Any other map overlay must use MapLibre sources and layers, not deck.gl layers, or the next data change deletes it.
- The server supports point-in-polygon. `beacon-core` has a `GeoJsonFilter` (`beacon-core/src/query/filter/geo_json.rs`) that compiles to `st_within_point(st_geojson_as_wkt(<geometry>), lon, lat)`. Wire shape: `{ longitude_query_parameter, latitude_query_parameter, geometry }`. The variant is untagged, so it goes straight into `filters`.
- Polygon, box and cross section all end as one closed ring, so there is one filter kind. A cross section is a line plus a width; `crossSectionRing` in `geo/spatial-selection.ts` converts it.
- Always send the bounding box of the polygon beside it, as `MinMaxFilter`s on the latitude and longitude columns. The server can prune data with those, but not with the polygon test. `toSpatialFilters` derives the box; never store it on a field.
- The server tests the raw longitude column, and a producer stores longitudes as -180..180 or as 0..360. `toSpatialFilters` therefore sends every copy of the ring that reaches -180..360, and never guesses the range of a dataset. `ringWorldCopies` gives the copies, with the copy of the map frame first. An area away from a seam gives one copy and a flat filter. An area over a seam gives two, as an `or` of two `and` groups, because one polygon cannot hold both sides of a seam. Each group keeps its own longitude box; the latitude box holds for every copy and stays outside. A row matches one copy at most, so the copies never select more than the drawn area.
- Move every point of a ring by the same amount. A move per point breaks the shape: a box from -10 to 10 becomes a shape 340 degrees wide.
- The compile and the read of an area are a round trip: `fromGeoJsonFilter` moves the first copy back to -180..180, so a share link redraws the area and recompiles to the same filters. Keep it that way. A read that infers a range from one copy breaks, because the first copy of a seam area is already in the map frame.
- `QueryDraft.spatialFilter` holds the area, because it applies to two columns and has no card of its own. `QueryWorkspace.updateActiveSpatialFilter` writes it, and also handles a block that has no draft (share link, JSON editor) by patching `compiled.filters`.
- A block stores one coordinate pair: `StoredQuery.coordinateColumns` (null means detect). The map plots it, the area filter tests it, and the cross section plot reads it. `SpatialSelection` holds only the shape. Never put a pair on the area or on `view.map`.
- Resolve the pair with `resolveCoordinateColumns` (`geo/spatial-selection.ts`), never with `detectCoordinateColumns` alone. The stored pair wins while the query selects both columns. Pass the pair to `compileDraft(draft, pair)`.
- Write the pair only through `QueryWorkspace.updateActiveCoordinateColumns`, or through `updateActiveDraft(draft, pair)` when the area also changes. With an area filter the query changes and the result link drops. Without one the result stays.
- A block from a query with no pair (share link without a pair, JSON editor, old record) takes the pair of its geo filter (`coordinateColumnsOf`) in `makeStoredQuery` and in the load migration. Without that, a recompile moves the filter to the detected pair and changes the query.
- `CoordinateColumnsDialog` is the one picker for the pair. The map viewer and `GeospatialFilterModal` both open it. `Modal` boxes are transformed, so render the dialog as a sibling of another modal, never inside it.
- Terra Draw (`terra-draw` + `terra-draw-maplibre-gl-adapter`) draws the shape. After a shape is complete `MapDrawTools.svelte` clears Terra Draw and renders the ring in its own MapLibre source, so a loaded area and a new area look the same.

## Admin Server and SQL Console
- Endpoints: `catalogs`, `table-schema`, `functions`, `list-datasets`, `dataset-schema`, `total-datasets` and `POST /api/query` need no admin. Every `/api/admin/*` endpoint needs the super-user. `GET /api/admin/check` gives 200 or 401. `/admin/api/...` is an alias of `/api/admin/...`.
- A plain SELECT needs no admin. DDL, DML, REFRESH and ALTER need the super-user. A server with `sql.enable = false` answers 400 "SQL queries are not enabled".
- Privileged SQL runs as a normal user first. The server refuses with status 400 and the text `requires super-user privileges`, and `withAdminFallback` then runs it again as admin. The server refuses before it runs anything, so a statement never runs twice.
- The SQL Console stays outside the query store, the blocks and the share links. A handover of SQL results to the viewers is a separate project.
- The SQL preview stops at 500 rows and ignores `queryCellLimit()`. Download fetches the full result.
- The route is `/sql-editor`, not under `/queries`. The Queries menu item has `match: '/queries'` and would also show as active.
- Handoff to the SQL Console: `?sql=` opens a new tab and does not run it. With `?node=`, the page first selects that node, after `whenOpenNodesSettled()`. The page then removes both parameters from the URL.
- An upload does not start a crawler. A table appears only through a crawler run (Run, or `schedule_secs`) or through "Create external table".

## Workbench SQL Mode (Important)
- A workbench SQL query only reads. It must never add, change, move, create or delete data.
- A block stores `mode` (`builder` or `sql`) and `sql` on `StoredQuery`. Read them with `queryModeOf` and `sqlTextOf`, because an old record has neither field.
- A SQL block keeps an empty draft. The draft holds only the output format, and `compiled` stays null.
- Every workbench SQL request goes through `readOnlyPreview`, `readOnlyDownload` or `readOnlyResult` (`sql/guard.ts`). They check the text, and refused SQL sends no request. `queryStore.ensure({ sql })` uses `readOnlyResult`.
- The guard accepts one statement that starts with SELECT, WITH or VALUES, and that holds no write word (`WRITE_WORDS`).
- The guard refuses a mark that another dialect reads in another way: a backslash before a quote, a nested `/*`, `$`, a backtick, `#`.
- The guard follows the DataFusion generic dialect. It does not handle the MSSQL `[name]` rule or the MySQL `--x` rule.
- The workbench never uses `withAdmin`, `withAdminFallback` or `makeAdminClient`. `makeBeaconClient` sends only the bearer token, and Beacon never treats a bearer token as the super-user.
- `quoteIdent` also quotes a word of `WRITE_WORDS`. A name from the table tree therefore never fails the guard.
- `QueryWorkspace.blockReason(block, requireFilter)` is the one run check for both modes. In a component, pass `$settings.requireQueryFilters`.
- `workspace.preview` holds the preview runs. It is transient. Reset, a mode switch, a node switch and a close clear the entry of the block.
- `SqlEditor` binds Ctrl+Enter with `addAction`. Monaco `addCommand` registers a global keybinding that stays after the editor is gone.
- Visualise runs a SQL block through `queryStore.ensure({ sql })`. The cache key holds the trimmed text and the node URL. Save and share stay off (`workbench.sql.notYet`). Later sub-issues turn them on.
- `updateBlockSql` drops `datasetKey` on a text change. Without that, a viewer shows the result of the old text from `peekByKey`.
- The map takes the columns of a SQL block from the result schema, so its coordinate pair resolves only after the result.
- A SQL block has no map area filter: the area writes into `compiled.filters`. `MapDrawTools` gets `lockedReason`, and `updateActiveSpatialFilter` ignores a SQL block.

## Persisted Data and Migrations (Important)
Sort each persisted value into one class. The class decides whether a change needs a migration.

| Class | Examples | Rule |
|---|---|---|
| Cache | OPFS Arrow cache, `datasetKey`, query history, remembered admin sign-ins (`admin-vault.ts`, bump `VAULT_VERSION`) | Never migrate. Bump a version and discard. |
| Preference or UI state | settings, selected node, blocks-state, SQL editor tabs (`beacon-studio.sql-tabs`), `view.map`, `view.chart` | Never migrate. Read with defaults (`normalize`, `normaliseChartView`). A rename resets the value. |
| User data | node list (tokens), saved queries, workbench blocks | Migrate only when the user loses real work. |
| External format | share links (`SharedQuery`), `?q=` bookmarks, data-browser detail URLs (`?file=…&node=`, `?table_name=…&node=`), data-browser list URLs (`?search=`, `?folder=`; the lists also read the old `?q=`) | Cannot be migrated. Read every old shape. |

- Never break a share link, also before 1.0. Keep each old field in the read, for example `instanceUrl` in `decodeSharedQuery`.
- The `legacy` prop of `query.open` counts old links. Remove an old field only when that count stays at zero.
- Before 1.0, a preference and a UI state can break with no migration.
- A user-data migration stays until 1.0. At 1.0, delete the migrations of before 1.0.
- From 1.0, keep a user-data migration for 3 minor releases after the release that adds it, and for 6 months at least. Then delete it.
- A safe read with defaults is not a migration. Keep it.
- Current user-data migrations: `migrateKey` in `services/beacon-node.ts`, and `migrateRecord` in `stores/query-collection.ts`.

## Layer Rule (Important)
Imports point down this chain. Point a new import down, never up:

`brand` → `i18n` → `stores/settings` → `beacon-api` → domain (`query`, `geo`, `sql`, `data-browser`, `access`, `system-info`) → `services` / `telemetry` → other `stores` → `components` → `routes`

- A domain folder imports only `brand`, `i18n`, `stores/settings`, `beacon-api` and other domain folders. It never imports `services`, another store or `components`.
- `stores/settings.ts` imports only `build-info` and `i18n`. Keep it there, because the domain reads it.
- Known upward imports. Do not add more, and remove one when you touch it:
  - `beacon-api/client.ts` imports `services/beacon-node-url`, `services/open-nodes` and `stores/toasts`.
  - `stores` and `telemetry` import each other. Only `stores/settings.ts` must stay free of telemetry.
- ESLint checks only part of this rule:
  - `query`, `geo`, `access` and `stores` must not import from `components`;
  - `brand` imports only `$brand` and `$lib/assets`;
  - `i18n` imports only `brand`.
  The rest is a convention. Check it by hand.
- `src/lib/brand/*` is pure config at the bottom.
- A domain folder must never import a type out of a `.svelte` file. A type that both a component and the domain need belongs in
  the domain layer. `query/filter-types.ts` exists for that reason: `ParameterFilter.svelte` and
  `AddFilterDropdown.svelte` declared those types, and `utils.ts` plus `query/draft.ts` had to reach
  up into a component to get them.
- `src/lib/sql/*` needs an admin runner, but must not import `services`. The page passes `withAdmin` into `withAdminFallback`.
- The persisted shape of a query (`QueryDraft`) is domain, not view, so `stores` never needs `components`.
- `watchSettings` in `telemetry/index.ts` diffs the settings store and reports a change. That keeps telemetry out of `stores/settings.ts`.
- `src/lib/components/*` holds `.svelte` files, plus the `.svelte.ts` runes classes and the barrel
  `index.ts` files that belong to one component folder. Anything with no Svelte dependency and more
  than one consumer belongs below, in a domain folder.
- New non-component files under `src/lib/query/*` and `src/lib/geo/*` use kebab-case, matching
  `stores/` and `beacon-api/`. Components keep PascalCase.

## Telemetry (Important)
Read `src/lib/telemetry/README.md` before you add an event.

- Event names are a **closed list on both sides**: `ActionName` in `telemetry/types.ts`, and
  `TelemetryValidator::NAMES` on `beacon-datalake.org`. The server drops an unknown name with no
  error and no log line. Land the server list first, then Studio.
- **The `studio_telemetry` table takes no new columns**, unless absolutely required. Discuss that with
  the user first. Every new field goes in the `props` JSON object. A new column needs a change in
  three places plus a migration, and that is a separate job.
- The server **drops a whole `props` object** above its cap; it does not cut it. `track` routes every
  object through `fitProps`, which degrades in steps. Never build an event that bypasses `track`.
- A build sends telemetry only with `STUDIO_TELEMETRY=on` (`TELEMETRY_BUILD_ENABLED` in `build-info.ts`).
  Without it, `isDisabled()` stops everything and the settings page hides the Telemetry group.
  Code must not expect the telemetry settings to appear on the page.
- Add `describeQuery(query)` to the props of every query event. Query content is open data
  (ERA5, WOD), so the filter values go out as well, and the time range is the most used field.

### The two files outside this repo
| Part | Path |
|---|---|
| Receiver (the endpoint that Studio posts to) | `S:\www\beacon-datalake.org\src\Controller\Api\TelemetryController.php` |
| Dashboard (the page that reads the events) | `S:\application\beacon-datalake.org\management\src\Controller\StudioTelemetryController.php` |

Edit either file **only when the task needs it**. Both live in another repository, on a slow share.
**Always tell the user which of the two you changed.** The user deploys them by hand. Without that
message the change never reaches production.

## Translations (Important)
- svelte-i18n runs the translations. `src/lib/i18n/index.ts` wraps it. Import from `@/i18n`, never from `svelte-i18n`.
- The catalog is `src/lib/i18n/locales/en.json`. English is the source language and the fallback. A new language is one JSON file plus one entry in `SUPPORTED_LOCALES`.
- Every user-visible string comes from the catalog. ESLint (`no-restricted-syntax`) rejects literal words in markup, in `title`/`placeholder`/`aria-label`/`alt`/`label`, and in `addToast`/`askConfirm` text.
- Use `$t('key')` in a component. Use `translate('key')` in plain code, at the point of use. A call at module load fixes the language of the first load.
- `MessageKey` is the union of all catalog keys. A wrong key fails `npm run check`. A key built from a template (`settings.field.${key}.label`) is checked as well.
- Domain code (`query/`, `geo/`, `plots/`) returns a `Message` (`message(key, values)`). The component translates it, so a stored warning follows a language change.
- A toast takes `key` and `values`. `message` holds only raw text, for example a server error. The toast shows the key text, then the raw text.
- Toast telemetry puts the key in `message` and the raw text in `props.detail`. The dashboard then groups one toast as one row in every language.
- Counts and numbers go in ICU messages (`{count, plural, one {# row} other {# rows}}`). Never join `toLocaleString()` and a word. Use `$formatNumber`, `$formatDate`, `$formatRelative` for a bare value.
- The settings page derives its text from the setting key: `settings.field.<key>.label` and `.description`, and `settings.group.<id>`. A new setting needs those keys.
- `+layout.svelte` calls `setLanguage` at the top of its script, not in `onMount`. A child `onMount` runs first.
- `<html lang>` follows the active locale. `app.html` holds only the start value.
- Write `{app}` where a string shows the whole app name as one unit. `t` and `translate` pass the brand name as `app` on every call.
- A string that styles one part of the name keeps the literal words, for example `home.title` (only "Studio" is highlighted). A brand overrides such a string in `locales.ts`, in every language.
- svelte-i18n parses a string as ICU only when it gets values. The `app` value makes every string go through the parser. A literal `{` or `''` in a catalog string is therefore ICU syntax.

## Frontend Conventions
- Prefer existing UI primitives from `src/lib/components/ui/*`.
- Prefer PascalCase naming for components, types, and other applicable identifiers.
- Keep route pages orchestration-focused; move reusable logic/components under `src/lib/components/*`.
- Style with SCSS. Do not add plain CSS stylesheets or plain CSS blocks. Use nested rules where they make the styles easier to read.
- Use Tailwind only for its CSS variables, or for a utility class that does exactly what the SCSS rule would do. Tailwind can be removed later, so add no pattern that only Tailwind can give.
- A heading (`h1`-`h6`) that works as a heading keeps the font family, size and weight from `app.scss`. Change only its layout and spacing (margin, padding, position).
- A large text that is not a heading, for example a stat tile value, uses no heading tag. Give it a suitable element and a font-size token.
- Set `font-size` only with a `--font-size-*` token, and `font-family` only with a `--font-family-*` token. `:root` in `app.scss` holds them. `src/tests/typography.test.ts` fails on a literal value.
  - Body text uses three sizes: `xs`, `sm`, `md`. The larger tokens belong to headings. `--font-size-icon` sizes a close glyph only. A stat tile value (`components/system-info/StatTile.svelte`) uses `--font-size-lg`.
  - Use `--font-family-mono` (or the global `.mono` class) for code-like values only: SQL, column types, storage paths. Show a table, dataset or node name in the base font.
  - Tailwind `text-xs` to `text-2xl` and `font-mono` map to the same tokens in `tailwind.css`. Do not use arbitrary values such as `text-[13px]`.
- Prefer native CSS custom properties (`--var` syntax) for design tokens and runtime theming.
- Use `@/` alias for `src/lib/*` imports where already adopted.
- Reuse toast patterns for user-facing errors; avoid silent failures.
- Admin features: an admin-only page gets `adminOnly: true` in the sidebar menu (`components/sidebar/menu.ts`). An admin control in a page for everyone goes inside `AdminAction`, which greys it out while "Show admin features" is off. An admin-only page picks its view with `adminPageState`, shows `AdminSessionRequired` without a session, and loads through `withAdminSession`. It never opens the sign-in dialog by itself. An admin-only page ignores "Show admin features": the setting hides the menu item only, and a direct link still opens the page. The sidebar shows a lock on an admin item while the current node has no session (`isLocked`). The lock is a hint only.
- A sidebar parent with children and no `match` is active only on its own URL and on its children (`isItemActive`). A top-level item below its URL, for example Crawlers at `/data-browser/crawlers`, does not activate the parent.
- Prefer `if`/`else` over the ternary `?:` operator — it reads better. This is about
  branching, not null-handling: `??` and `?.` are fine and preferred where they fit.
  Inline expressions in Svelte markup, where a statement is not possible, are exempt.

## Performance and Safety Patterns
- Transform a cached result through the `queryStore` methods (`sort`, `minMax`, `countInRing`, `dedup`, `findSimilar`, `mapTable`), not through `getArrowWorker()` directly. They key the worker's loaded tables by the dataset cache key, which is what makes the load-once transfer correct, and `mapTable` is memoized and purged on eviction. Reach for `getArrowWorker()` only for a table that is not a `DatasetEntry`.
- One shared worker keeps tables loaded by key across navigations. Don't `new ArrowProcessingWorkerManager()` per page or `terminate()` the shared instance.
- Avoid blocking the main thread with large Arrow transforms.
- Preserve guards like `isLoading` / `firstLoad` around query execution.
- A canvas path holds about 150,000 arcs. Above that the browser drops the fill and reports no error, so the plot draws blank. `fillPointChunks` in `plots/uplot-render.ts` flushes the path every 10,000 arcs, and it also draws faster than one large path. Draw every point set through it. A palette bucket needs the same flush: the buckets divide the Z range, not the row count, so one bucket can hold every row.
- `QueryWorkspace.blocks` gets a new array, and a new object for each changed block, on every write to the block collection — including the run result that `queryStore.ensure()` writes and any draft update. Do not read `workspace.activeBlock` (or a query object derived from it) directly inside an `$effect`. That makes the effect re-fire after its own write, in a loop that never stops. Track primitive values instead (block id, a stringified compiled query) and read the live block/query with `untrack`. See `src/routes/visualisations/table-explorer/+page.svelte` for the pattern.

## Editing Guidance for Agents
- Make minimal, localized changes; avoid broad refactors unless requested.
- Preserve public behavior for query compile/execute and visualization URL handoff.
- When touching query types, verify compatibility across:
  - builders (`query-builder/*`)
  - editor (`query-editor/*`)
  - visualizers (`visualisations/*`)
  - API client (`@maris-development/beacon-client`; legacy `beacon-api/client.ts` where still used)
- Prefer fixing root causes over adding one-off patches in page components.
- `QueryBuilder` gates steps 2 to 4 and keeps every step mounted. The parameter block gets an empty `table_name` until the node answers. An empty table stops its schema load, its draft emit and its column reset. Gate the block only through `table_name`, so a stored draft or a blocked seed stays intact.
- The saved-query list and the history list are modals in `QueryActionBar`. Open calls `QueryActions.openStoredQuery`, then `QueryWorkspace.openStoredQuery`.
- Do not open a list entry with `goto`. A page reads `?q=` only in `onMount`, and a `goto` to the same route does not remount it.
- `openStoredQuery` selects a block with the same compiled query and node URL. A block copy gets a new id, so an id test never finds it.
- Build UI from the primitives in `src/lib/components/ui` (bits-ui). Add no new component library.

## Tests
- Unit tests: Vitest with jsdom. Run `npm test`.
- Browser tests: the Playwright MCP against `npm run dev`. See "Validation Checklist Before Finishing".
- Put a test in a `tests/` folder next to the code it tests: `src/lib/sql/tests/tabs.test.ts` tests `src/lib/sql/tabs.ts`. Import the code with `../`.

## Validation Checklist Before Finishing
- Run: `npm test`
- Run: `npm run check`
- Run: `npm run lint`
- If behavior changed, smoke-test relevant route(s):
  - `/queries/workbench`
  - `/queries/query-editor`
  - `/visualisations/map-viewer`
  - `/visualisations/table-explorer`
  - `/visualisations/chart-explorer`
  - `/sql-editor`
- Confirm no regressions in query JSON -> visualization navigation path.
- Do the smoke test in a browser with the Playwright MCP (`mcp__playwright__*`), against `npm run dev`.
- If the Playwright MCP is not available, tell the developer. They can install it with `claude mcp add playwright -s user -- npx @playwright/mcp@latest`.

## Known Repo Facts
- Static adapter outputs to `build/` and uses `fallback: 'index.html'`.
- Monaco editor is included and loaded client-side.
- `build/` holds generated artifacts. Git ignores it. Avoid editing generated files directly unless explicitly asked.

## Comment Rules
The org instructions hold the comment rules. Two more:
- Do not write user stories or issue lists in comments.
- Do not repeat the code in words. State only new information.