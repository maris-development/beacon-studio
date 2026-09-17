# Telemetry

Studio sends pseudonymous usage events to `beacon-datalake.org`. The events answer
which datasets people query, which filters they set, which formats they take, and
where the app fails.

Two rules hold in every file here:

1. Nothing throws. A telemetry fault stays invisible to the user.
2. Nothing raises a toast. A toast is itself an event, so it would loop.

## How to send an event

```ts
import { describeQuery, track } from '@/telemetry';

track('query.execute', {
	nodeHost: node.url,
	queryId: entry.queryId,
	rowCount: entry.rowCount,
	durationMs: entry.duration,
	props: { ...describeQuery(query), tier: 'network' }
});
```

`track` returns at once. The queue sends the event later, in a batch.

### The rules for a call

- **Use a name from `ActionName` in `types.ts`.** The server holds the same closed
  list in `TelemetryValidator::NAMES`. It drops an unknown name without an error.
  **Add the name on the server first, then in Studio.**
- **Put everything new in `props`.** The database columns are fixed. A new field
  needs no migration while it lives in `props`.
- **Add `describeQuery(query)` to every query event.** It gives the table, the
  columns, the filters with their values, the format and the drawn area.
- **Name a content prop with a key from `CONTENT_KEYS`.** `track` drops those keys
  when the user switches `telemetryQueryDetails` off. A new prop that names a
  table, a column, a file or a search term needs its key in that list.
- **Keep `message` short.** The server cuts it at 500 characters.
- **Do not call `track` from `stores/settings.ts`.** That store sits below this
  module. `watchSettings` in `index.ts` reports a settings change instead.

## The files

| File | What it does |
|---|---|
| `index.ts` | The public face. `track`, `initTelemetry`, `diagnostics`, the session totals and the settings watcher. |
| `types.ts` | The event names, the levels and the wire shape. The closed list lives here and on the server. |
| `queue.ts` | The buffer and the transport. It batches by event count and by byte budget, and it flushes on a timer and on `pagehide`. |
| `session.ts` | The endpoints, and the short-lived session token. |
| `identity.ts` | `installId` (localStorage), `sessionId` (sessionStorage), the platform and the build. |
| `props.ts` | `fitProps` keeps one props object inside the server cap. It cuts the object in steps, because the server drops a whole object that is too large. |
| `query-shape.ts` | `describeQuery` turns a `CompiledQuery` into a compact payload. |
| `context.ts` | The client facts that the server cannot read from the request: viewport, locale, timezone, cores, memory. |
| `console.ts` | Reports `console.warn` and `console.error`. `console.log` needs the `telemetryConsoleLog` setting. It reports one message once per minute, with a `repeat` count. |
| `errors.ts` | Reports an uncaught error and a rejected promise. The console patch sees neither. |

## The metrics

One row of `studio_telemetry` is one event. `name` says which event. The columns
below hold the same meaning for every event. `props` holds the rest, as JSON.

### Columns

| metric_key | description |
|---|---|
| `event_id` | The id of this event. It stops a double count of a replayed batch. |
| `install_id` | The browser. It survives a reload and a restart. |
| `session_id` | The tab. It dies when the tab closes. |
| `studio_version` | The short git commit of the Studio build. |
| `platform` | `web` or `desktop`. `desktop` is the Tauri app. |
| `occurred_at` | The client clock. Report on `input_date`, which is the server clock. |
| `input_date` | The server clock. Use it for every time series. |
| `category` | `action`, `console` or `toast`. |
| `name` | The event. See the table below. |
| `level` | `log`, `info`, `success`, `warn`, `warning` or `error`. |
| `route` | The SvelteKit route id of the open page. It carries no query string. |
| `node_host` | The host of the Beacon node, with no path. |
| `query_id` | The `x-beacon-query-id` of the run. It joins to the node log. |
| `message` | Free text, up to 500 characters. |
| `duration_ms` | The time of the event. Its meaning depends on the name. |
| `row_count` | The rows of a result. |
| `props` | The fields of this event, as JSON. |
| `ip_hash` | The hashed IP. The server writes it. |
| `user_agent` | The browser and the operating system. The server writes it. |
| `origin` | The host that Studio runs on. The server writes it. |

### Events

| metric_key | description |
|---|---|
| `app.start` | The app started. It carries the session context in `props`. One per tab. |
| `session.end` | The tab closed. `duration_ms` is the session length. `props` holds the totals. |
| `app.error` | An uncaught error or a rejected promise. |
| `page.view` | A navigation. `route` is the new page. |
| `query.execute` | A query ran, or a cache tier answered it. `duration_ms` is the total time. |
| `query.error` | A query failed. An abort does not come here. |
| `query.cancel` | A user or a newer run stopped a query. `duration_ms` is the time before the stop. |
| `query.visualise` | A result reached the map, the chart or the table. |
| `query.download` | A user downloaded a result from the node. |
| `query.save` | A user saved a query. |
| `query.share` | A user built a share link. |
| `query.open` | A share link opened. It counts the receivers of a share. |
| `node.select` | A user selected a node. |
| `node.add` | A user added a node. |
| `node.update` | A user changed a node. |
| `node.remove` | A user removed a node. |
| `node.health` | The reachability of a node changed. `duration_ms` is the latency. |
| `browser.table.open` | A user opened a table in the data browser. |
| `browser.dataset.open` | A user opened a dataset file in the data browser. |
| `browser.search` | A user searched in the data browser. |
| `builder.table.select` | A user picked a table in the query builder. The funnel starts here. |
| `builder.column.add` | A user added a column to the draft. |
| `builder.filter.add` | A user added a filter to a column. |
| `workbench.block.add` | A workbench block opened. |
| `settings.change` | A user changed one setting. An opt-out never reports itself. |
| `example.start` | A user opened a quick start example on the home page. |
| `console.log` | A `console.log` call. It needs the `telemetryConsoleLog` setting. |
| `console.warn` | A `console.warn` call. |
| `console.error` | A `console.error` call. |
| `toast.info` | An info toast. |
| `toast.success` | A success toast. |
| `toast.warning` | A warning toast. |
| `toast.error` | An error toast. |

### The query shape

`describeQuery` adds these keys to the props of `query.execute`, `query.error`,
`query.cancel`, `query.visualise`, `query.download`, `query.save`, `query.share`
and `query.open`.

| metric_key | description |
|---|---|
| `props.table` | The table name, or `<format>:<path>` for a file source. |
| `props.columns` | The selected column names. It holds 25 names at most. |
| `props.columnCount` | The number of selected columns. It is always complete. |
| `props.filters` | One object per filter. It holds 20 filters at most. |
| `props.filters[].column` | The column of the filter. |
| `props.filters[].kind` | `min_max`, `eq`, `neq`, `gt`, `gt_eq`, `lt`, `lt_eq`, `is_null`, `is_not_null`, `geojson`, `or`, `and`. |
| `props.filters[].min` | The low bound of a `min_max` filter. A time range lands here. |
| `props.filters[].max` | The high bound of a `min_max` filter. |
| `props.filters[].value` | The value of a one-value filter. |
| `props.filterCount` | The number of filters. It is always complete. |
| `props.filterKinds` | How many filters of each kind. It is always complete. |
| `props.format` | The output format: `csv`, `parquet`, `netcdf`, `zarr`, `arrow`, `ipc`, `geoparquet`. |
| `props.limit` | The row limit of the query, or null. |
| `props.offset` | The row offset of the query, or null. |
| `props.bbox` | The drawn area, as `[west, south, east, north]`. |

### Props per event

| metric_key | description |
|---|---|
| `props._v` | The payload version. `app.start` only. |
| `props.version` | The Studio build. `app.start` only. |
| `props.viewport` | The window size, as `WxH`. `app.start` only. |
| `props.screen` | The screen size, as `WxH`. `app.start` only. |
| `props.dpr` | The device pixel ratio. `app.start` only. |
| `props.locale` | The browser language. `app.start` only. |
| `props.timezone` | The IANA time zone. It gives the region. `app.start` only. |
| `props.cores` | The CPU cores of the machine. `app.start` only. |
| `props.memoryGb` | The memory of the machine, in GB. `app.start` only. |
| `props.network` | The connection class: `4g`, `3g`, `2g`, `slow-2g`. `app.start` only. |
| `props.saveData` | True when the browser asks for less data. `app.start` only. |
| `props.standalone` | True when the app runs with no browser chrome. `app.start` only. |
| `props.colorScheme` | `dark` or `light`, as the system asks. `app.start` only. |
| `props.pages` | The page views of the session. `session.end` only. |
| `props.queries` | The query runs of the session. `session.end` only. |
| `props.downloads` | The downloads of the session. `session.end` only. |
| `props.visualises` | The map, chart and table views of the session. `session.end` only. |
| `props.errors` | The errors of the session. `session.end` only. |
| `props.cancels` | The cancelled queries of the session. `session.end` only. |
| `props.kind` | `app.error`: `uncaught`, `rejection`, `resource`. `query.visualise`: `map`, `chart`, `table`. `builder.filter.add`: the filter type. |
| `props.source` | `app.error`: the bundle file. `query.save`: the role of the source record. `example.start`: the data source. |
| `props.line` | The line of an uncaught error. `app.error` only. |
| `props.stack` | The first 300 characters of the stack. `app.error` only. |
| `props.from` | `page.view`: the previous route id. `node.health`: the previous status. |
| `props.to` | The new status. `node.health` only. |
| `props.tier` | Where the result came from: `memory`, `opfs` or `network`. |
| `props.serverMs` | The wait for the answer of the node. `query.execute` only. |
| `props.transferMs` | The read of the body. `query.execute` only. |
| `props.decodeMs` | The decode of the Arrow stream. `query.execute` only. |
| `props.bytes` | The size of the body, in bytes. `query.execute` only. |
| `props.renderMs` | The render after the result arrived. `query.visualise` only. |
| `props.errorKind` | The name of the error class. `query.error` only. |
| `props.status` | `query.error`: the HTTP status. `node.select`: the health of the node. |
| `props.copy` | True when the save copied an existing record. `query.save` only. |
| `props.hasDraft` | True when the saved query holds builder state. `query.save` only. |
| `props.linkChars` | The length of the share payload. `query.share` only. |
| `props.legacy` | True for a link of an older app version. `query.open` only. |
| `props.hasToken` | True when the new node needs a token. `node.add` only. |
| `props.urlChanged` | True when the edit changed the URL. `node.update` only. |
| `props.tokenChanged` | True when the edit changed the token. `node.update` only. |
| `props.wasSelected` | True when the removed node was the selected one. `node.remove` only. |
| `props.file` | The dataset file. `browser.dataset.open` only. |
| `props.scope` | `datasets`, `dataset-fields` or `table-fields`. `browser.search` only. |
| `props.term` | The search text, up to 60 characters. `browser.search` only. |
| `props.results` | The rows that the search matched. `browser.search` only. |
| `props.tables` | The tables that the node offers. `builder.table.select` only. |
| `props.column` | The added column. `builder.column.add` only. |
| `props.dataType` | The Arrow type of the column. `builder.column.add` and `builder.filter.add`. |
| `props.origin` | How the block started: `empty`, `query`, `duplicate`, `saved`, `history`. `workbench.block.add` only. |
| `props.blocks` | The open blocks. `workbench.block.add` only. |
| `props.key` | The setting that changed. `settings.change` only. |
| `props.value` | The new value of the setting. `settings.change` only. |
| `props.title` | The example that the user opened. `example.start` only. |
| `props.repeat` | The calls that the dedupe hid in the last minute. `console.*` only. |

Note: `props.columns` is the column list in a query shape, and the column total in
`builder.column.add`. `props.table` is the table in a query shape, in
`browser.table.open`, in `builder.table.select` and in `example.start`.

### Truncation markers

A large props object loses fields. These flags say which.

| metric_key | description |
|---|---|
| `props.columnsTruncated` | The column list is cut, or absent. `columnCount` stays correct. |
| `props.filtersTruncated` | The filter list is cut, or absent. `filterCount` stays correct. |
| `props.filterValuesTruncated` | The filters hold no values. |
| `props.propsTruncated` | Only the scalar fields survived. |
| `props.queryDetails` | Always `false` when present. The user switched the query content off. |

## Limits

| Limit | Value | Where |
|---|---|---|
| Props, encoded | 7000 bytes client, 8000 server | `props.ts`, `TelemetryValidator` |
| Request body | 200000 bytes client, 262144 server | `queue.ts`, `TelemetryValidator` |
| Events per batch | 50 | both sides |
| Message | 500 characters | server |
| Requests per IP | 120 per minute | `TelemetryController` |

## Off by default in development

`isDisabled()` in `index.ts` stops everything in a dev session. Set `DEV_OVERRIDE`
to `true` to send events from a dev build, and to patch the console there.

## The two opt-outs

`telemetryEnabled` is on by default. An opt-out drops the buffer and deletes both
ids, from any write path. `watchSettings` in `index.ts` does that, because the
settings store cannot import this module.

`telemetryQueryDetails` is on by default. An opt-out keeps the events, and removes
the keys in `CONTENT_KEYS` from every props object: `table`, `columns`, `filters`,
`column`, `file`, `term` and `bbox`. The counts beside them stay, because
`columnCount`, `filterCount` and `filterKinds` name nothing. `applyContentRule` in
`index.ts` does that, on every event.

Each stripped event carries `props.queryDetails: false`. A reader then knows that
a field is absent by choice, and not because an old client wrote the row.

`message` stays as it is. A node error can name a table inside its text, and a
report needs that text.

## The server

The receiver is `beacon-datalake.org`:

- `src/Controller/Api/TelemetryController.php` holds the endpoints and the rate limit.
- `src/Service/TelemetryValidator.php` holds the closed name list and the caps.
- `scripts/sql/studio_telemetry.sql` holds the table. **It takes no new columns.**
