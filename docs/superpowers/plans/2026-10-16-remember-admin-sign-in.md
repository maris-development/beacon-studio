# Remember the admin sign-in: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can tick "Remember on this device", and the admin session then survives a closed tab and a browser restart.

**Architecture:** A new plain module `services/admin-vault.ts` owns IndexedDB and Web Crypto. It encrypts one secret per node with one non-extractable AES-GCM key. The secret is the password now, and a session token later (see "Temporary: server session tokens"). `admin-session.ts` keeps its synchronous session store. It writes to the vault on a remembered sign-in, removes from the vault on every sign-out, and fills the store from the vault one time at app start. `requireAdminClient` awaits that restore before it asks for a sign-in.

**Tech Stack:** SvelteKit 2, Svelte 5, Web Crypto (`crypto.subtle`, AES-GCM), IndexedDB, svelte-i18n, Vitest with jsdom, `fake-indexeddb` 6 (new dev dependency).

**Spec:** GitHub issue #153, text in the chat of 2026-10-16. No spec file. The decisions below add to it.

## Depends on

Issue #152 (node picker, admin box in `AddBeaconModal`). Another agent finishes it now. Start this plan only after #152 is in the working tree. Read `AddBeaconModal.svelte`, `node-form.ts` and `NodePicker.svelte` again before Task 3. #152 still changes them (for example `sessionSurvives(node, url)` in `AddBeaconModal.svelte`).

## Temporary: server session tokens

The storage of the password is temporary. Beacon PR [#590](https://github.com/maris-development/beacon/pull/590) ("Add session token authentication", open on 2026-10-16) adds server sessions:

- `POST /api/auth/session`, no auth, body `{ username, password, remember? }`. Returns 201 with `{ token, username, is_super_user, remember, expires_at }`. The token starts with `bst_`.
- `GET /api/auth/session` with `Authorization: Bearer bst_…` returns the session. `DELETE /api/auth/session` ends it (204).
- Idle lifetime 8 hours (`BEACON_AUTH_SESSION_TTL_SECS`). With `remember: true`, 30 days (`BEACON_AUTH_SESSION_REMEMBER_TTL_SECS`, `0` turns it off). Each request extends the expiry.
- A changed `BEACON_ADMIN_USERNAME` or `BEACON_ADMIN_PASSWORD` ends the super-user sessions. A failed sign-in waits 500 to 1500 ms, then returns 401.
- The PR does not change the TypeScript SDK (`beacon-ts`).

When #590 is released and the SDK supports it, Studio stores the token, not the password. The vault of this plan then stores the token. This plan builds the vault for that switch:

- The vault stores an opaque secret with a `kind`, not a field named `password`. Kind `'password'` now. The switch adds kind `'session-token'`, with no change to the vault code.
- The switch bumps `VAULT_VERSION`. That discards every saved password, as the cache rule says. The user signs in one more time.
- The "Remember on this device" checkbox then also sends `remember: true` to `POST /api/auth/session`. Without it, the token lives in `sessionStorage`, as the password does now.
- A sign-out then also calls `DELETE /api/auth/session`, so the server ends the token.

The switch itself is **not** part of this plan. It is a follow-up issue after #590 lands. That issue must also decide how Studio talks to a node without #590 (an older server): keep Basic auth for it, or require the new server.

## Facts checked for this plan

- In Vitest with jsdom, `crypto.subtle` exists, and `fake-indexeddb` 6.2.5 stores and returns a non-extractable `CryptoKey`. The returned key decrypts, and `exportKey` throws. (Probe run on 2026-10-16, Node 22.13.1.)
- jsdom has no `indexedDB`. Test files that do not stub it therefore see "vault not available".
- `crypto.subtle` is `undefined` outside a secure context (plain `http://` on a host that is not `localhost`). The availability check covers that case.
- The layout script runs before any page `onMount` (`setLanguage` relies on this already). A restore that starts there is in progress before any admin action can start.

## Decisions made in this plan

- **Module split.** `admin-vault.ts` has no Svelte and no store. It knows nothing about sessions. `admin-session.ts` decides when to save, restore and forget.
- **Storage layout.** Database `beacon-studio.admin-vault`. Two object stores: `keys` (one record, key `device`, value the `CryptoKey`) and `entries` (key path `nodeId`).
- **Format version.** The IndexedDB version is the format version: `VAULT_VERSION = 1`. `onupgradeneeded` deletes every existing object store and creates the two stores again. A version bump therefore discards old entries, as the issue asks for a cache.
- **Entry shape.** `{ nodeId: string, nodeUrl: string, username: string, kind: SecretKind, iv: Uint8Array, ciphertext: ArrayBuffer }`. `nodeUrl` is `normalizeUrl(node.url)`. The IV is 12 random bytes per save. The ciphertext holds the secret string only.
- **Secret kind.** `type SecretKind = 'password'`. The vault does not read the kind. It only stores it and binds it. `admin-session.ts` reads it, and drops an entry with a kind it does not know.
- **Bound ciphertext.** Encrypt with `additionalData = UTF-8 of "<nodeId>\n<nodeUrl>\n<kind>"`. An entry copied to another node id, URL or kind then fails to decrypt, and the restore discards it.
- **One key per browser profile.** Generate the key on the first save. Reuse it for every entry. "Forget all" deletes the whole database, the key included.
- **URL check.** The restore takes a lookup `(nodeId) => string | null` that gives the current URL of a node. An entry whose node is missing, or whose `normalizeUrl` differs from `nodeUrl`, is removed from the vault. `admin-session.ts` cannot import `beacon-node.ts` (that file imports `signOut` from it), so the layout passes the lookup.
- **Ready promise.** `adminSessionsReady` starts as a resolved promise. `restoreRememberedSessions` replaces it with the running restore. A missing restore call therefore never blocks an admin action.
- **No overwrite during the restore.** A `signIn` or `signOut` on a node while the restore runs wins. The restore skips that node.
- **Failed save.** `signIn` keeps the tab session when the vault save fails, and returns `false`. The caller shows a warning toast. It never throws for a vault error.
- **Remove is best effort.** `signOut` stays synchronous. It removes the store entry at once and starts the vault delete without await. A failed delete is logged with `console.warn`.
- **Help text.** Two keys. `admin.signIn.help` (today's text) shows when the vault is not available. `admin.signIn.helpRemember` shows next to the checkbox. A third key, `admin.signIn.rememberNote`, states the XSS limit under the checkbox.
- **Settings button.** "Forget all admin sign-ins" goes in the actions row of `/settings`. It shows only when `$settings.adminFeatures` is on and the vault is available. It asks for a confirmation.
- **No telemetry.** No event, and no prop, says whether a sign-in is remembered.

## Global Constraints

- Never save credentials in `localStorage`, on the node record, in a share link, or in telemetry.
- IndexedDB holds no password in plain text.
- The checkbox is off by default. Hide it when IndexedDB or `crypto.subtle` is not available.
- Without "Remember", the behaviour stays as today: `sessionStorage` only.
- Never migrate a vault entry. A format change bumps `VAULT_VERSION`.
- Translate every user-visible string. Add each key to `en.json`, `nl.json`, `it.json` and `es.json`. Use `{app}`, never "Studio". A literal `'` or `{` in a catalog string is ICU syntax: use `\"Remember\"`, not `'Remember'`.
- `$t` in components, `translate` in plain code at the point of use.
- SCSS only. `font-size` only through `--font-size-*` tokens.
- Tabs for indent in `.ts` and `.svelte` files of `services/` and `components/`.
- Prefer `if`/`else` over `?:` in script code.
- Comments: one short line, intent only, current behaviour only.
- Tests go in `src/lib/services/tests/`.
- Do not commit. The user commits. Never create a branch.
- Edit files with the Edit or Write tool. Never with `sed`, `perl` or `echo`.

## Review Focus

1. **Admin action at startup, before the restore ends:** a crawler run or a SQL fallback that starts on the first paint must wait for the restore, and then run with no prompt. Task 2 tests `withAdmin` with a slow restore.
2. **Sign-out while the restore runs:** a "Close admin session" or a 401 during the restore must not come back when the restore ends. Task 2 tests it.
3. **Vault not available** (insecure `http://` host, private mode that blocks IndexedDB, Tauri webview with no IndexedDB): the checkbox hides, the help shows today's text, and sign-in works as today. Task 1 tests `vaultAvailable()` with no `indexedDB`. Task 3 checks the dialog by hand.
4. **Key lost, entry kept** (the user cleared one store in devtools, or a broken record): the restore drops that entry and starts with no session for that node. It does not throw, and it does not block the other entries. Task 1 tests a broken ciphertext.
5. **Same node in two tabs:** tab A forgets the node, tab B still has the session in its own `sessionStorage`. That is accepted: tab B keeps its session until its tab closes or a 401. A restart then gives no session. No test. State it in the roadmap decision.

---

### Task 1: The vault

**Files:**
- Create: `src/lib/services/admin-vault.ts`
- Create: `src/lib/services/tests/admin-vault.test.ts`
- Modify: `package.json` (dev dependency `fake-indexeddb` `^6.2.5`)

**Interfaces:**
- Produces:
  - `type SecretKind = 'password'`
  - `type RememberedSecret = { nodeId: string; nodeUrl: string; username: string; kind: SecretKind; secret: string }`
  - `vaultAvailable(): boolean`: `typeof indexedDB !== 'undefined'` and `globalThis.crypto?.subtle` is set.
  - `saveRemembered(entry: RememberedSecret): Promise<void>`: encrypts and writes one entry, replaces an entry with the same `nodeId`. Rejects on any failure.
  - `loadRemembered(): Promise<RememberedSecret[]>`: decrypts every entry. Deletes each entry that fails to decrypt, and leaves it out. Resolves `[]` when the vault is not available or empty. Never rejects.
  - `forgetRemembered(nodeId: string): Promise<void>`
  - `forgetAllRemembered(): Promise<void>`: deletes the database.
  - `const VAULT_VERSION = 1` (exported for the test).

- [ ] **Step 1: Install the fake**

Run: `npm install --save-dev fake-indexeddb@^6.2.5`
Expected: `package.json` lists it under `devDependencies`.

- [ ] **Step 2: Write the failing tests**

Each test stubs a fresh database: `vi.stubGlobal('indexedDB', new IDBFactory())` in `beforeEach` (import `IDBFactory` from `fake-indexeddb`), and `vi.unstubAllGlobals()` in `afterEach`. Load the module with `vi.resetModules()` and a dynamic import, as `admin-session.test.ts` does.

Tests:
- `round-trips an entry`: save `{ nodeId: 'a', nodeUrl: 'https://a.example.org', username: 'alice', kind: 'password', secret: 'pw' }`, then `loadRemembered()` equals `[that entry]`.
- `replaces the entry of the same node`: save twice for `a` with secrets `pw1`, `pw2`. Load gives one entry with `pw2`.
- `stores no plain secret`: save with secret `s3cret-pw`. Open the database directly, read every record of `entries` and `keys`. `JSON.stringify` of each record, and the decoded `ciphertext` bytes as UTF-8, do not contain `s3cret-pw`.
- `keeps the key non-extractable`: read the `device` record of `keys`. `key.extractable` is `false`, and `crypto.subtle.exportKey('raw', key)` rejects.
- `drops an entry that does not decrypt`: save `a` and `b`. Change one byte of the `ciphertext` of `a` directly in the database. Load gives only `b`, and the `entries` store no longer has `a`.
- `drops an entry moved to another node`: save `a`. Rewrite the record with `nodeId: 'b'` (ciphertext unchanged). Load gives `[]`.
- `drops an entry with a changed kind`: save `a`. Rewrite the record with `kind: 'session-token'` (cast in the test). Load gives `[]`.
- `forgets one node`, `forgets all`: after `forgetAllRemembered()`, a load gives `[]`, and a new save creates a new key.
- `reports no vault without IndexedDB`: `vi.stubGlobal('indexedDB', undefined)`. `vaultAvailable()` is `false` and `loadRemembered()` resolves `[]`.
No upgrade test for version 1: IndexedDB has no version below 1. The reviewer reads `onupgradeneeded`. The first bump to version 2 adds the test: a version-1 database with an entry, then a load gives `[]`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/services/tests/admin-vault.test.ts`
Expected: FAIL, module `../admin-vault` not found.

- [ ] **Step 4: Implement `admin-vault.ts`**

Promise wrappers around `IDBRequest` and `IDBTransaction` live in this file. No library. `onupgradeneeded` deletes every name in `db.objectStoreNames`, then creates `keys` (out-of-line keys) and `entries` (`keyPath: 'nodeId'`). Get the key with `generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])` when the `device` record is missing. Close the database after each call.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/services/tests/admin-vault.test.ts`
Expected: PASS.

---

### Task 2: Remembered sessions in `admin-session.ts`

**Files:**
- Modify: `src/lib/services/admin-session.ts`
- Modify: `src/lib/services/tests/admin-session.test.ts`
- Modify: `src/lib/services/tests/admin-session-request.test.ts`

**Interfaces:**
- Consumes: Task 1, all of it.
- Produces:
  - `signIn(node: BeaconNode, username: string, password: string, remember = false): Promise<boolean>`. Resolves `false` only when `remember` is true and the vault save failed. The tab session exists in both cases. Throws `AdminAuthError` as today.
  - `signOut(nodeId: string): void`: also starts `forgetRemembered(nodeId)`.
  - `restoreRememberedSessions(nodeUrlOf: (nodeId: string) => string | null): Promise<void>`. Sets `adminSessionsReady` to the same promise. Never rejects.
  - `forgetAllAdminSignIns(): Promise<void>`: `forgetAllRemembered()`. The open tab sessions stay.
  - `canRememberSignIn(): boolean`: re-export of `vaultAvailable()` for components.
  - `requireAdminClient` awaits the current `adminSessionsReady` before it reads `credentialsOf`.
  - The save uses `kind: 'password'` and `secret: password`. The restore maps `secret` back to `password`, and drops an entry whose `kind` is not `'password'`. This mapping is the one place that the token switch changes.

- [ ] **Step 1: Write the failing tests**

In `admin-session.test.ts`, stub a fresh `IDBFactory` in `beforeEach` and unstub in `afterEach`. A "restart" is `sessionStorage.clear()` followed by `load()` again with the same stubbed factory.

```ts
it('remembers a sign-in across a restart', async () => {
	let { session, sdk } = await load();
	vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
	await expect(session.signIn(node('a'), 'alice', 'pw', true)).resolves.toBe(true);

	sessionStorage.clear();
	({ session } = await load());
	expect(session.hasAdminSession('a')).toBe(false);

	await session.restoreRememberedSessions(() => 'https://a.example.org');
	expect(session.credentialsOf('a')).toEqual({ username: 'alice', password: 'pw' });
});
```

More tests, same pattern:
- `saves nothing without remember`: `signIn(..., false)`, restart, restore: no session.
- `signOut forgets the remembered entry`: sign in with remember, `signOut('a')`, wait with `vi.waitFor` until `loadRemembered()` of the vault gives `[]`. Restart and restore: no session.
- `discards an entry for another URL`: remember on `https://a.example.org`, restore with lookup `() => 'https://other.example.org'`: no session, and the vault is empty after.
- `discards an entry for a removed node`: lookup returns `null`: no session, vault empty.
- `compares URLs after normalizeUrl`: remember on `https://a.example.org`, lookup returns `https://A.example.org/`: session restored.
- `keeps a sign-in made during the restore`: remember `a` as `alice`. Restart. Start the restore without await, call `signIn(node('a'), 'bob', 'pw2')`, then await the restore: `credentialsOf('a').username` is `bob`.
- `keeps a sign-out made during the restore`: remember `a`. Restart. Start the restore, call `signOut('a')`, await the restore: no session.
- `keeps the tab session when the save fails`: `vi.spyOn(vault, 'saveRemembered').mockRejectedValue(new Error('quota'))` (import the vault module after `load()`). `signIn(..., true)` resolves `false`, and `hasAdminSession('a')` is `true`.

In `admin-session-request.test.ts`, add:
- `waits for the restore before it asks`: stub `IDBFactory`. Remember `a` in a first module copy, then reload. Start `restoreRememberedSessions(() => 'https://a.example.org')` without await, and call `withAdmin(node('a'), fn)` at once. `fn` runs one time, and `get(session.signInRequest)` stays `null` the whole time.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/services/tests/admin-session.test.ts src/lib/services/tests/admin-session-request.test.ts`
Expected: FAIL. `restoreRememberedSessions` is not a function, and `signIn` resolves `undefined`.

- [ ] **Step 3: Implement**

Track the nodes touched during a restore in a module `Set<string>`: `signIn` and `signOut` add the id while a restore runs. The restore merges only entries whose id is not in that set and not in the store already. Update the module comment at the top: a session lives in `sessionStorage`, and a remembered one also in the vault.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/services/tests`
Expected: PASS, the old tests of both files included. `beacon-node.test.ts` mocks `admin-session` and needs no change.

---

### Task 3: The checkbox, the restore call and the strings

**Files:**
- Modify: `src/routes/+layout.svelte` (top of the script, after `setLanguage`)
- Modify: `src/lib/services/node-form.ts`
- Modify: `src/lib/services/tests/node-form.test.ts`
- Modify: `src/lib/components/modals/AdminSignInDialog.svelte`
- Modify: `src/lib/components/modals/AddBeaconModal.svelte`
- Modify: `src/lib/i18n/locales/en.json`, `nl.json`, `it.json`, `es.json`

**Interfaces:**
- Consumes: `signIn(..., remember): Promise<boolean>`, `restoreRememberedSessions`, `canRememberSignIn` (Task 2).
- Produces:
  - `type AdminInput = AdminCredentials & { remember: boolean }` in `node-form.ts`. `saveNodeForm(values, admin: AdminInput | null, editingId)` and `testAdminInput(url, admin: AdminInput | null)` take it. `hasAdminInput` checks `username` and `password` only.
  - `NodeSaveResult` gets `rememberFailed: boolean`.

- [ ] **Step 1: Write the failing test**

In `node-form.test.ts`:
- `passes remember to signIn`: spy on `session.signIn`. `saveNodeForm(values, { username: 'alice', password: 'pw', remember: true })` calls it with `(node, 'alice', 'pw', true)`.
- `reports a failed remember`: `signIn` resolves `false`. The result has `rememberFailed: true` and `adminError: null`.

Update the existing calls of `saveNodeForm` in the file with `remember: false`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/services/tests/node-form.test.ts`
Expected: FAIL on both new tests.

- [ ] **Step 3: Implement `node-form.ts`**

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/services/tests/node-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the strings**

`en.json`, under `admin.signIn`:

| Key | English text |
|---|---|
| `remember` | `Remember on this device` |
| `helpRemember` | `Use BEACON_ADMIN_USERNAME and BEACON_ADMIN_PASSWORD of the node. Without \"Remember\", {app} keeps the credentials for this browser tab only.` |
| `rememberNote` | `{app} encrypts the saved password. A script that runs in {app} can still read it. Use this only on a device that you trust.` |
| `rememberFailed` | `{app} could not save the sign-in on this device. It lasts until you close this tab.` |

Keep `admin.signIn.help` as it is.

Under `settings`:

| Key | English text |
|---|---|
| `forgetAdminSignIns` | `Forget all admin sign-ins` |
| `forgetAdminSignInsMessage` | `{app} removes every admin sign-in that it saved on this device. The sign-ins in open tabs stay until the tab closes.` |
| `forgetAdminSignInsDone` | `{app} forgot the saved admin sign-ins.` |

Translate each key into `nl.json`, `it.json` and `es.json`. Keep the env variable names and `{app}` as they are.

- [ ] **Step 6: Wire the layout**

In `+layout.svelte`, right after `setLanguage(getSettings().language);`, call `void restoreRememberedSessions((id) => findById(id)?.url ?? null);` (`findById` from `@/services/beacon-node`). Add a one-line comment: the restore must start before a page `onMount`.

- [ ] **Step 7: Add the checkbox to `AdminSignInDialog.svelte`**

- `let remember = $state(false)`, reset to `false` in the effect that resets the form.
- When `canRememberSignIn()`: a row with `Checkbox` (`$lib/components/ui/checkbox/index.js`, as `SettingField.svelte` uses it) and a `<label for>` with `admin.signIn.remember`, then `helpRemember`, then `rememberNote` in the `.help` style. Otherwise: `admin.signIn.help` only, as today.
- `submit` passes `remember` to `signIn`. When it resolves `false`, call `addToast({ type: 'warning', key: 'admin.signIn.rememberFailed' })`, and still answer `true`.

- [ ] **Step 8: Add the checkbox to `AddBeaconModal.svelte`**

In the admin fields of the "Admin access (optional)" box, below the two inputs: the same checkbox row and `rememberNote`, only when `canRememberSignIn()`. Use the id `admin-remember`. Add `remember` to `adminInput`. After the save, when `result.rememberFailed`, show the same warning toast. Follow the #152 state of the file; do not undo its changes.

- [ ] **Step 9: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors in the touched files. A wrong i18n key fails `npm run check`.

---

### Task 4: "Forget all admin sign-ins" in the settings

**Files:**
- Modify: `src/routes/settings/+page.svelte`

**Interfaces:**
- Consumes: `forgetAllAdminSignIns`, `canRememberSignIn` (Task 2), the `settings.forgetAdminSignIns*` keys (Task 3).

- [ ] **Step 1: Add the button**

In the `.actions` row, before "Reset all": an outline `Button` with `settings.forgetAdminSignIns`, shown when `$settings.adminFeatures && canRememberSignIn()`. The click calls `askConfirm` (`destructive: true`, title `settings.forgetAdminSignIns`, message `settings.forgetAdminSignInsMessage`), then `forgetAllAdminSignIns()`, then a success toast `settings.forgetAdminSignInsDone`. On a rejection, an error toast with key `settings.forgetAdminSignIns` and `message: String(error)`.

- [ ] **Step 2: Check**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

---

### Task 5: Docs, full check and manual test

**Files:**
- Modify: `docs/superpowers/admin-mode-roadmap.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the roadmap**

In "Decisions > Sign-in", replace the two lines "Credentials go in `sessionStorage` (option A)…" and "Future work (user goal)…" with:
- Credentials go in `sessionStorage` by default. They go away when the tab closes. Reason: Basic auth sends the real super-user password.
- "Remember on this device" (issue #153, off by default) also saves them in IndexedDB (`services/admin-vault.ts`). A non-extractable AES-GCM key encrypts the password. No script can read the key bytes, and devtools shows no password. A script in the Studio origin can still decrypt it. A full copy of the browser profile holds the key too. Plan: [remember sign-in](plans/2026-10-16-remember-admin-sign-in.md).
- Every sign-out removes the saved entry: "Close admin session", a 401, a removed node, a URL change. A second open tab keeps its own tab session until it closes.
- Temporary: the saved password goes away when Studio uses the session tokens of beacon PR [#590](https://github.com/maris-development/beacon/pull/590). The vault then stores the `bst_` token (kind `'session-token'`), and `VAULT_VERSION` goes up. The checkbox then also sends `remember: true` to `POST /api/auth/session`. A follow-up issue does that switch after #590 lands and the SDK supports it.

Add the build state to that plan line when the build is done.

- [ ] **Step 2: Update AGENTS.md**

- In "Shared state", the `admin-session.ts` line: add "A remembered sign-in is also saved in `services/admin-vault.ts` (IndexedDB, encrypted). `restoreRememberedSessions` runs at the top of the `+layout.svelte` script. `requireAdminClient` awaits it. The vault stores a secret with a `kind`: the password now, the session token of beacon PR #590 later."
- In "Persisted Data and Migrations", the Cache row: add "remembered admin sign-ins (`admin-vault.ts`, bump `VAULT_VERSION`)".

- [ ] **Step 3: Run the full check**

Run: `npm test`, then `npm run check`, then `npm run lint`
Expected: all tests pass, `check` has 0 errors, `lint` has no new errors in touched paths.

- [ ] **Step 4: Manual test in the browser** (`npm run dev`)

1. Turn on "Show admin features". Sign in from the node picker with "Remember" on. Close the browser, open it again. The node picker shows the Admin badge. Open `/data-browser/crawlers` and run a crawler: no prompt.
2. In devtools > Application > IndexedDB > `beacon-studio.admin-vault` > `entries`: the record has `username`, `iv`, `ciphertext`, and no password.
3. "Close admin session": the record is gone. Restart: no badge.
4. Sign in without "Remember". Close the tab, open a new tab: no badge.
5. Remember a sign-in, then change the URL of the node in "Manage nodes": the record is gone.
6. Remember a sign-in, then "Forget all admin sign-ins" in Settings. Restart: no badge.
7. Open Studio over plain `http://` on a LAN host name (not `localhost`), if one is at hand: no checkbox, today's help text.

- [ ] **Step 5: Manual test in Tauri** (`npm run tauri:dev`)

Repeat items 1 to 3. If the checkbox does not show, record that `vaultAvailable()` is false in the webview, and that sign-in works as today.
