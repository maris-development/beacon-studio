# Admin mode foundation (step 1)

Date: 2026-10-05
Status: draft for review

## Goal

Add admin features to Beacon Studio for each Beacon node. Normal users see no change.
Step 1 adds the setting, the sign-in for each node, the menu rules and the shared node picker.
Step 1 adds no new admin screen.

## Context

- `beacon-web` (`beacon/beacon-clients/beacon-web`) is the admin UI that Studio replaces.
- `@maris-development/beacon-client` 2.0.0 has every admin endpoint (`client.admin.*`).
  Studio adds UI only. Studio adds no API code.
- The server uses HTTP Basic auth for admin. `GET /api/admin/check` returns 200 for an admin and 401 otherwise.
- The server also serves `/admin/api/...`. That path is an alias (`beacon-server/src/axum/router.rs`).
  Studio uses the default prefix `/api`.
- `CreateTableModal` calls `/api/admin/create-table`. `UploadDatasetsModal` calls `/api/admin/upload-file`.
  The current server has neither endpoint.

## Sub-projects

Each sub-project gets its own spec, plan and build. Sub-projects 2 to 7 depend only on step 1.

| # | Sub-project | Menu | Admin |
|---|---|---|---|
| 1 | Admin mode foundation (this spec) | none | - |
| 2 | SQL editor with table and field catalogue | Data Access > SQL Editor, always | No |
| 3 | Tables: list, preview, schema; create, refresh, drop | Data Browser > Data Tables | In-page actions |
| 4 | Datasets: list, preview, chunked upload, delete | Data Browser > Datasets | In-page actions |
| 5 | Crawlers | Node Management > Crawlers, admin only | Whole page |
| 6 | Users and roles | Node Management > Users & Roles, admin only | Whole page |
| 7 | System info: CPU, memory, health | Node Management > System Info | No |

Sub-projects 3 and 4 replace the current data-tables and datasets pages.
Sub-project 7 extends the current `/system-info` page.

The `beacon-web` pages set the minimum feature list for sub-projects 3 and 4.
Each spec of those sub-projects lists these features. A feature in this list is not optional.

| Page | Features for everyone | Admin features |
|---|---|---|
| Tables (`beacon-web/src/pages/tables.tsx`) | List from `catalogs()`. Schema per table (`tableSchema`). Preview of the first rows (`SELECT * ... LIMIT n`). | Table definition (`admin.tableDefinition`). Refresh (`REFRESH`). Drop. Create external table (`admin.createExternalTable`). Create view. |
| Datasets (`beacon-web/src/pages/datasets.tsx`) | List with pattern search and total (`datasets`, `totalDatasets`). Schema per file (`datasetSchema`). Preview of the first rows. | Chunked upload with progress (`admin.uploadDataset`). Download. Delete. Storage use (`admin.datasetStorage`). |

## Behaviour

### Setting

- Add `adminFeatures: boolean` to `stores/settings.ts`. Default: `false`.
- Label: "Show admin features". Group: `System`.
- The value is a preference. It needs no migration. `normalize` fills the default.
- `watchSettings` reports a change. Step 1 adds no telemetry event.

### Admin states

| State | Admin menu item | In-page admin action |
|---|---|---|
| Setting off | Hidden | Greyed out. Tooltip: "Turn on Show admin features in Settings". |
| Setting on, no session for the node | Visible | Enabled. A click opens the sign-in dialog. |
| Setting on, session for the node | Visible | Runs at once. |

An admin-only page opened by URL with the setting off shows a short message and a link to Settings.
Sub-project 5 adds this notice, because it adds the first admin-only page.

### Sign-in for each node

- A session belongs to one node. A session on node A gives no rights on node B.
- Studio asks for sign-in only when the user starts an admin action. Studio never asks in advance.
- The dialog title is "Sign in to Beacon node <name>". The dialog shows the node URL.
- After a sign-in, the action continues. Cancel stops the action and shows no error.
- A 401 on an admin call removes the session, opens the dialog again and runs the action one more time.
- `NodePicker` shows "Signed in" and a "Sign out" link under the picker.
  The line shows only when a session exists for the selected node. It does not show the username.

### Menu

- The group names stay the same.
- Add `adminOnly?: boolean` to `MenuItem` and `SubItem` in `AppSidebar.svelte`.
- The sidebar hides `adminOnly` items while the setting is off.
- Step 1 adds no menu item. Each sub-project adds its own item.

### Node picker

- Add `components/NodePicker.svelte`. It holds the `Select` and status dot that each data-browser list page copies now.
- The picker reads `$currentNode`. The picker writes only through `selectNode()`.
- Delete `stores/data-browser-node.ts`. It is UI state, so no migration. The pages use the global node.
- Query blocks keep their own node. The picker does not change them.

## Units

### `services/admin-session.ts`

Owns the admin sessions. No Svelte component imports, so unit tests can run it.

- Keeps `{ username, password }` for each node id in `sessionStorage`, key `beacon-studio.admin-sessions`.
- Exposes the readable store `adminSessions`.
- `signIn(node, username, password)`: calls `client.admin.check()`. On 200, saves the session. On 401, throws an auth error.
- `signOut(nodeId)`: removes the session.
- Removes a session when its node is removed, or when the node URL changes.
- `requireAdminClient(node)`: returns an SDK client with `username` and `password`.
  With no session, it asks the dialog and waits. On cancel, it returns `null`.
- `withAdmin(node, fn)`: runs `fn(client)`. On a 401, it removes the session, asks again and runs `fn` one more time.
  On cancel, it returns `null`.
- Sends a sign-in request to the dialog through a store that holds one pending request.
  A second request for the same node waits for the first.

The admin client sends Basic auth only. It does not send the bearer `token` of the node,
because both use the `Authorization` header.

### `components/modals/AdminSignInDialog.svelte`

- `+layout.svelte` mounts it one time.
- It reads the pending request from `admin-session.ts` and resolves it.
- It shows "Wrong username or password" on an auth error, and keeps the dialog open.
- It shows a network error or a 5xx in the dialog.

### `components/AdminAction.svelte`

- Wraps one in-page admin control.
- With the setting off, it renders the control as disabled with the tooltip.
- With the setting on, it renders the control as normal.

### Changes to current code

- `AppSidebar.svelte`: `adminOnly` filter.
- `routes/data-browser/datasets/+page.svelte` and `data-tables/+page.svelte`: use `NodePicker`.
  Wrap the "Upload Datasets" and "Create Table" buttons in `AdminAction`.
- `UploadDatasetsModal.svelte`: remove the username and password fields.
  Upload each file with `withAdmin(node, c => c.admin.uploadDataset(file.name, file))`.
- `CreateTableModal.svelte`: remove the username and password fields. Use `withAdmin`.
  Its endpoint does not exist on the server. Sub-project 3 moves it to `admin.createExternalTable`.
  Until then, the button stays, and the modal shows the server error.

## Errors

- A network error or a 5xx on an admin action shows a toast, as now.
- A 403 means the user has no right for that action. Show a toast. Keep the session.

## Testing

- Unit tests for `admin-session.ts`:
  - A session belongs to one node.
  - A URL change and a node removal remove the session.
  - `withAdmin` retries one time after a 401.
  - Cancel returns `null` and does not call `fn`.
  - Two requests for one node open one dialog.
- Manual test against a local node: upload with the setting off, on with no session, and on with a session.
- Run `npm run check` and `npm run lint`.

## Out of scope

- The admin screens (sub-projects 2 to 7).
- New telemetry events.

## Future work

- Keep the credentials across browser restarts with the security of `sessionStorage`.
  One option: a non-extractable `CryptoKey` in IndexedDB that encrypts the saved password.
