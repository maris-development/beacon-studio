# AGENTS.md

## ASD-STE100 Style Rule
Write strictly using **ASD-STE100 (Simplified Technical English)** constraints:
* **Limits:** Max 20 words per instruction, 25 per description. One thought per sentence.
* **Grammar:** Active voice, simple present tense, imperative for steps (e.g., "Push button"). Avoid `-ing` verbs and em-dashes.
* **Vocabulary:** Strict consistency (one word = one meaning; no synonyms). No filler ("Furthermore", "In conclusion") or jargon. Max 3 nouns in a row.

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
- **Migrate to `@beacon/client`** (installed via `package.json` as
  `"@beacon/client": "file:../beacon/clients/beacon-ts"`). It is the isomorphic
  TypeScript SDK for querying Beacon (browser + Node), with a fluent query builder,
  Arrow/CSV result decoding, and admin endpoints. See its README for the full API.
- The local `src/lib/beacon-api/client.ts` is legacy. Prefer `@beacon/client` for
  new code, and migrate existing usage toward it instead of extending the local
  client. Reuse the SDK's query builder and result handling rather than
  reimplementing them locally.

## Core Commands
- Install deps: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview: `npm run preview`
- Type/lint checks: `npm run check` and `npm run lint`
- Format: `npm run format`

## Deployment/Base Path
- `svelte.config.js` sets `kit.paths.base` from `BASE_PATH` env var.
- For subdirectory deploys, build with e.g. `BASE_PATH=//studio npm run build --omit=dev`.
- Keep path handling consistent by using SvelteKit helpers (`resolve`, `asset`) already used in the codebase.

## High-Level Architecture
- App shell and navigation:
  - `src/routes/+layout.svelte`
  - `src/lib/components/app-sidebar.svelte`
- Landing and top-level sections:
  - `src/routes/+page.svelte`
  - `src/routes/queries/*`
  - `src/routes/visualisations/*`
  - `src/routes/data-browser/*`
- API client and query model:
  - `@beacon/client` — preferred SDK; built via `src/lib/beacon-api/sdk-client.ts` (`makeBeaconClient`)
  - `src/lib/beacon-api/client.ts` — legacy client, now metadata/download only
  - `src/lib/beacon-api/query.ts`
  - `src/lib/beacon-api/types.ts`
- Domain modules (no Svelte, no DOM — plain TypeScript, safe to unit test):
  - `src/lib/query/draft.ts` (`QueryDraft`, `compileDraft` — the builder's editable state, and the compile to `CompiledQuery`)
  - `src/lib/query/seed-hydration.ts` (`hydrateDraftFromQuery` — the reverse: `CompiledQuery` back into a draft, best effort)
  - `src/lib/query/filter-types.ts` (`ParameterFilterType`, `SelectedFilterType` — the filter shapes the builder edits)
  - `src/lib/query/selection-status.ts`, `src/lib/query/functions.ts`
  - `src/lib/geo/spatial-selection.ts` (drawn area, and its conversion to query filters)
  - `src/lib/geo/coordinate-columns.ts` (`detectCoordinateColumns`)
- Shared state:
  - `src/lib/stores/query-store.svelte.ts` (persistent in-memory query-result cache; `queryStore.ensure()`)
  - `src/lib/stores/opfs-arrow-cache.ts` (OPFS tier under the query store: raw compressed Arrow IPC bytes, survives reloads/restarts)
  - `src/lib/stores/query-history.ts` (persisted log of executed queries; recorded by `queryStore.ensure()`, consumed by `queries/query-history`)
  - `src/lib/stores/config.ts` (persisted Beacon instance selection)
  - `src/lib/stores/settings.ts` (persisted user settings; the `/settings` page builds its form from `SETTING_DEFINITIONS`. Read a value with `getSettings()` at the point of use, or `$settings` in a component. Never read it at module load.)
  - `src/lib/stores/toasts.ts` (global toasts)
- Heavy data operations (off-main-thread, one shared worker via `getArrowWorker()`):
  - `src/lib/workers/ArrowProcessingWorker.ts`
  - `src/lib/workers/ArrowProcessingWorkerManager.ts`

## Data Flow (Important)
1. User configures a query via easy/advanced builder or raw editor.
2. Query is compiled to `CompiledQuery` (`QueryBuilder` in `beacon-api/query.ts`).
3. Query is passed between pages via a gzipped URL payload (`Utils.objectToGzipString` / `?query=`), which also serves as the persistent cache key.
4. Visualizer pages call `queryStore.ensure(query)` (`stores/query-store.svelte.ts`), which fetches once via `@beacon/client` (`queryRaw()`) and caches the Arrow table in memory across navigations — switching map/table/chart reuses the result with no re-fetch.
5. Results arrive as a native (zstd) Arrow IPC stream; the raw bytes are persisted to OPFS (`stores/opfs-arrow-cache.ts`, best-effort, LRU + 24h TTL) and decoded app-side to an Arrow table (`getArrowDecoder()` from `@beacon/client`, no Parquet round-trip). A memory-evicted or reloaded session rehydrates from OPFS instead of re-running the query. Cache keys include the Beacon instance URL.
6. Heavy transforms (sort, dedup, min/max, map geometry) are delegated to one shared worker; the map derives its GeoArrow geometry client-side from lat/lon.
7. Every successful `queryStore.ensure()` records the query in the persisted query history (`stores/query-history.ts`), deduped by cache key (which includes the instance URL) and snapshotting the instance name, row count, duration, and timestamp. The `queries/query-history` page lists them and re-runs each by navigating to a visualiser (or the editor) with the gzipped `?query=` payload; `query-editor` preloads a query supplied via `?query=`.

## Query and Output Rules
- `queryStore.ensure()` requests the default Arrow IPC stream (omits `output`) and returns an Arrow table; the server accepts the local `CompiledQuery` shape via serde aliases (`query_parameters`→`select`, `for_query_parameter`→`column`, `filters`).
- Map viewer requires latitude/longitude query columns and builds the GeoArrow point geometry client-side (`ApacheArrowUtils.addPointGeometryColumn`). `detectCoordinateColumns` (`geo/coordinate-columns.ts`) is the single rule that finds those two columns by name. Use it; do not repeat the match.
- `queryCellLimit()` (in the query store, backed by the settings store) protects browser stability; `limit_reached` warnings are surfaced with toasts.
- The legacy `BeaconClient` (`beacon-api/client.ts`) is metadata/download only (`queryToDownload`, tables/datasets/schema/system-info), plus the `static` execution and cache-control facade (`ensureQuery`, `peekQuery*`, `invalidateQueryCache`, cache stats/toggle). Its Parquet query path and `parquet-wasm` have been removed.
- `BeaconClient` fronts I/O only. Transforms of a fetched result (sort, dedup, min/max, geometry) do no I/O and live on `queryStore`; call it directly for those, and do not add pass-through statics for them.

## Map Viewer and Spatial Filters
- `MapViewController` imports `maplibre-gl/dist/maplibre-gl.css`. Keep that import. Without it the zoom controls have no styling, the canvas stays in the normal flow and the map grows on every resize, and the draw tools get the wrong pointer coordinates.
- The map page (`routes/visualisations/map-viewer/+page.svelte`) keeps only the query effect, the area selection and the markup. `MapViewController` (`components/visualisation/MapViewController.svelte.ts`) owns the map, the deck.gl overlay, the popup and the result table. Add map behaviour to the controller, not to the page.
- deck.gl writes an inline `cursor` on the MapLibre canvas on **every frame** (`@deck.gl/core` `deck.js`, `container.style.cursor = this.props.getCursor(...)`). CSS can never win, not even with `:global` on `.maplibregl-canvas-container`. Change the cursor with the `getCursor` prop of `MapboxOverlay`.
- `MapboxOverlay.setProps({ layers })` replaces the **whole** layer array. Any other map overlay must use MapLibre sources and layers, not deck.gl layers, or the next data change deletes it.
- The server supports point-in-polygon. `beacon-core` has a `GeoJsonFilter` (`beacon-core/src/query/filter/geo_json.rs`) that compiles to `st_within_point(st_geojson_as_wkt(<geometry>), lon, lat)`. Wire shape: `{ longitude_query_parameter, latitude_query_parameter, geometry }`. The variant is untagged, so it goes straight into `filters`.
- Polygon, box and cross section all end as one closed ring, so there is one filter kind. A cross section is a line plus a width; `crossSectionRing` in `geo/spatial-selection.ts` converts it.
- Always send the bounding box of the polygon beside it, as two `MinMaxFilter`s on the latitude and longitude columns. The server can prune data with those, but not with the polygon test. `compileDraft` derives the box; never store it on a field.
- `QueryDraft.spatialFilter` holds the area, because it applies to two columns and has no card of its own. `QueryWorkspace.updateActiveSpatialFilter` writes it, and also handles a block that has no draft (share link, JSON editor) by patching `compiled.filters`.
- The area carries the two columns it tests (`latitudeColumn` / `longitudeColumn`), because the user can pick another pair than the names say, for example `x` and `y`. Resolve the pair with `selectionColumns` (`geo/spatial-selection.ts`), never with `detectCoordinateColumns` alone: the names on the area win while the query still selects them, and detection is only the fallback for an older record. The draw tools rebuild the area on every shape change and drop the two names, so stamp them back with `withColumns` at the point of apply.
- Terra Draw (`terra-draw` + `terra-draw-maplibre-gl-adapter`) draws the shape. After a shape is complete `MapDrawTools.svelte` clears Terra Draw and renders the ring in its own MapLibre source, so a loaded area and a new area look the same.

## Layer Rule (Important)
Imports point one way only:

`beacon-api` → `query` / `geo` → `stores` → `components` → `routes`

- `src/lib/query/*` and `src/lib/geo/*` must never import from `src/lib/components/*`, and must never
  import a type out of a `.svelte` file. A type that both a component and the domain need belongs in
  the domain layer. `query/filter-types.ts` exists for that reason: `ParameterFilter.svelte` and
  `AddFilterDropdown.svelte` declared those types, and `utils.ts` plus `query/draft.ts` had to reach
  up into a component to get them.
- `src/lib/stores/*` must never import from `src/lib/components/*`. The persisted shape of a query
  (`QueryDraft`) is domain, not view.
- `src/lib/components/*` holds `.svelte` files, plus the `.svelte.ts` runes classes and the barrel
  `index.ts` files that belong to one component folder. Anything with no Svelte dependency and more
  than one consumer belongs below, in `query/` or `geo/`.
- New non-component files under `src/lib/query/*` and `src/lib/geo/*` use kebab-case, matching
  `stores/` and `beacon-api/`. Components keep PascalCase.

## Frontend Conventions
- Prefer existing UI primitives from `src/lib/components/ui/*`.
- Prefer PascalCase naming for components, types, and other applicable identifiers.
- Keep route pages orchestration-focused; move reusable logic/components under `src/lib/components/*`.
- Use SCSS for all styling; do not introduce plain CSS stylesheets or plain CSS blocks.
- Structure styles with SCSS hierarchy (nested rules) where it improves readability and maintainability.
- Do not override heading text styles (`h1`-`h6`) defined in `app.scss` (font family, font size, font weight). Only adjust layout/spacing properties (e.g., margins, padding, positioning) in component- or screen-specific styles.
- Prefer native CSS custom properties (`--var` syntax) for design tokens and runtime theming.
- Tailwind is enabled, but SCSS is the default and preferred approach.
- Use `@/` alias for `src/lib/*` imports where already adopted.
- Reuse toast patterns for user-facing errors; avoid silent failures.
- Prefer `if`/`else` over the ternary `?:` operator — it reads better. This is about
  branching, not null-handling: `??` and `?.` are fine and preferred where they fit.
  Inline expressions in Svelte markup, where a statement is not possible, are exempt.

## Performance and Safety Patterns
- Transform a cached result through the `queryStore` methods (`sort`, `minMax`, `countInRing`, `dedup`, `findSimilar`, `mapTable`), not through `getArrowWorker()` directly. They key the worker's loaded tables by the dataset cache key, which is what makes the load-once transfer correct, and `mapTable` is memoized and purged on eviction. Reach for `getArrowWorker()` only for a table that is not a `DatasetEntry`.
- One shared worker keeps tables loaded by key across navigations. Don't `new ArrowProcessingWorkerManager()` per page or `terminate()` the shared instance.
- Avoid blocking the main thread with large Arrow transforms.
- Preserve guards like `isLoading` / `firstLoad` around query execution.
- `QueryWorkspace.blocks` gets a new array, with new block objects, on every write to the block collection — including `markBlockRun`/`markBlockRunning` and any draft update. Do not read `workspace.activeBlock` (or a query object derived from it) directly inside an `$effect`. That makes the effect re-fire after its own write, in a loop that never stops. Track primitive values instead (block id, a stringified compiled query) and read the live block/query with `untrack`. See `src/routes/visualisations/table-explorer/+page.svelte` for the pattern.

## Editing Guidance for Agents
- Make minimal, localized changes; avoid broad refactors unless requested.
- Preserve public behavior for query compile/execute and visualization URL handoff.
- When touching query types, verify compatibility across:
  - builders (`query-builder/*`)
  - editor (`query-editor/*`)
  - visualizers (`visualisations/*`)
  - API client (`@beacon/client`; legacy `beacon-api/client.ts` where still used)
- Prefer fixing root causes over adding one-off patches in page components.
- Prefer creating own components with clear explicit code instead of relying on libraries/packages for components.

## Validation Checklist Before Finishing
- Run: `npm run check`
- Run: `npm run lint`
- If behavior changed, smoke-test relevant route(s):
  - `/queries/query-workbench`
  - `/queries/query-editor`
  - `/visualisations/map-viewer`
  - `/visualisations/table-explorer`
  - `/visualisations/chart-explorer`
- Confirm no regressions in query JSON -> visualization navigation path.

## Known Repo Facts
- Static adapter outputs to `build/` and uses `fallback: 'index.html'`.
- Monaco editor is included and loaded client-side.
- Project currently contains generated `build/` artifacts in repo; avoid editing generated files directly unless explicitly asked.

## Comment Rules
- Write short comments.
- Comment complex logic only. Skip comments on clear code.
- Use one line per comment. Avoid comment blocks.
- Describe what the code does now.
- Do not describe old code or old bugs.
- Do not use phrases like "used to," "previously," or "before this fix."
- Do not write user stories or issue lists in comments.
- Do not repeat the code in words. State only new information.