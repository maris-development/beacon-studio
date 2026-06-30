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
  - `@beacon/client` — preferred SDK (query builder, execution, result decoding)
  - `src/lib/beacon-api/client.ts` — legacy local client (being phased out)
  - `src/lib/beacon-api/query.ts`
  - `src/lib/beacon-api/types.ts`
- Shared state:
  - `src/lib/stores/config.ts` (persisted Beacon instance selection)
  - `src/lib/stores/toasts.ts` (global toasts)
- Heavy data operations (off-main-thread):
  - `src/lib/workers/ArrowProcessingWorker.ts`
  - `src/lib/workers/ArrowProcessingWorkerManager.ts`

## Data Flow (Important)
1. User configures a query via easy/advanced builder or raw editor.
2. Query is compiled to `CompiledQuery` (`QueryBuilder` in `beacon-api/query.ts`).
3. Query may be passed between pages via gzipped URL payload (`Utils.objectToGzipString` / URL param).
4. Visualizer pages decode query and execute through `BeaconClient.query()`.
5. Response is read as Parquet/GeoParquet -> Arrow table.
6. Table is rendered in map/table/chart views, often with worker-assisted transforms.

## Query and Output Rules
- `BeaconClient.query()` enforces/normalizes output to parquet-like paths and returns Arrow tables.
- Map viewer rewrites output to GeoParquet and requires latitude/longitude query columns.
- `BeaconClient.QUERY_LIMIT` protects browser stability; warnings are surfaced with toasts.

## Frontend Conventions
- Prefer existing UI primitives from `src/lib/components/ui/*`.
- Keep route pages orchestration-focused; move reusable logic/components under `src/lib/components/*`.
- Use `@/` alias for `src/lib/*` imports where already adopted.
- Reuse toast patterns for user-facing errors; avoid silent failures.

## Performance and Safety Patterns
- Use `ArrowProcessingWorkerManager` for sorting/dedup/min-max and other heavy Arrow operations.
- Avoid blocking the main thread with large Arrow/parquet transforms.
- Preserve guards like `isLoading` / `firstLoad` around query execution.

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
  - `/queries/query-builder`
  - `/queries/query-editor`
  - `/visualisations/map-viewer`
  - `/visualisations/table-explorer`
  - `/visualisations/chart-explorer`
- Confirm no regressions in query JSON -> visualization navigation path.

## Known Repo Facts
- Static adapter outputs to `build/` and uses `fallback: 'index.html'`.
- Monaco editor and Perspective viewer are included and loaded client-side.
- Project currently contains generated `build/` artifacts in repo; avoid editing generated files directly unless explicitly asked.
