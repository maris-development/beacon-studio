# Admin session required card: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only page with no admin session on the selected node shows one card that offers a sign-in. The page never opens the sign-in dialog by itself.

**Architecture:** `admin-session.ts` gets three small parts: a store that is true while the remembered sessions restore, a runner that uses only an existing session and never asks, and a pure function that picks the page state. A new `AdminSessionRequired.svelte` shows the card. The crawlers page reads `$signedInNodeIds` and loads only with a session.

**Tech Stack:** SvelteKit 2, Svelte 5, svelte/store, `@lucide/svelte`, svelte-i18n, Vitest with jsdom, SCSS.

**Spec:** GitHub issue #154 (text in the chat of 2026-10-16, plus one mockup). No spec file. The decisions below fill the gaps of the issue.

## Decisions made in this plan

- **Builds on #153** (committed in `1ef3a86`, `271cc0f`): `restoreRememberedSessions`, `adminSessionsReady`, `admin-vault.ts`. Do not change `admin-vault.ts`.
- **No card flash at start.** The layout starts the restore of remembered sessions before the page mounts, but the restore is async. While it runs, the page shows the loading text, not the card. A new store `restoringSessions` gives this state.
- **The load never asks.** `withAdmin` opens the dialog after a 401. A stale remembered password would then open the dialog at arrival. The load therefore uses a new `withAdminSession`: it runs only with an existing session, and a 401 removes the session, so the card shows. The actions (run, delete, save) keep `withAdmin`, as the issue says.
- **The card button does not load.** It calls `askSignIn(node)` only. The page effect reacts to `$signedInNodeIds`, so a sign-in from the card and a sign-in from the picker take the same path.
- **Bold node name.** The text is two keys, `textBefore` and `textAfter`, with `<strong>{node}</strong>` between them in markup. This follows `admin.onlyNotice.beforeLink` / `afterLink`. No `{@html}`.
- **Four locales.** The repo has `en`, `nl`, `it` and `es`. The issue names three. Add every key to all four.
- **Component location.** `src/lib/components/AdminSessionRequired.svelte`, beside `AdminBadge.svelte` and `AdminAction.svelte`.

## Global Constraints

- Translate every user-visible string. Add each key to `en.json`, `nl.json`, `it.json`, `es.json` under `src/lib/i18n/locales/`. ESLint rejects literal words in markup and in `aria-label`.
- Use `$t` in components, `translate` in plain code at the point of use.
- SCSS only. `font-size` only through `--font-size-*` tokens. Body text: `xs`, `sm`, `md`. Do not change `h1`-`h6` text styles.
- The icon tile uses the token `--admin-badge-background` (`src/tailwind.css`). Do not copy the gradient.
- Tabs for indent in Svelte and in `admin-session.ts`.
- Prefer `if`/`else` over `?:` in script code.
- Comments: one short line, intent only, current behaviour only.
- Put tests in `src/lib/services/tests/`.
- Do not commit. The user commits. Never create a branch.
- Edit files with the Edit or Write tool. Never with `sed`, `perl` or `echo`.

## Review Focus

1. **Remembered session at a cold start:** the page shows the loading text during the restore, then the crawlers. It never shows the card in between. Task 1 tests `restoringSessions` and `adminPageState(…, restoring = true)`.
2. **Stale remembered password (401 on load):** the session goes away, the card shows, no dialog opens. Task 1 tests `withAdminSession` on a 401.
3. **"Close admin session" while the load runs:** the late result is dropped, and the card stays. Task 3 guards the result. Task 3 Step 4 checks it by hand with a slow node.
4. **Sign-in dialog from the picker for the same node while the card shows:** a click on the card joins the open question (`askSignIn` shares one promise per node). No second dialog. Task 3 Step 4 checks it by hand.
5. **"Show admin features" off:** the page still shows `AdminOnlyNotice`, not the card. Task 1 tests nothing here, because the page tests `admin` before it calls `adminPageState`. Task 3 Step 4 checks it by hand.

---

### Task 1: Session state helpers in `admin-session.ts`

**Files:**
- Modify: `src/lib/services/admin-session.ts`
- Modify: `src/lib/services/tests/admin-session-request.test.ts` (`withAdminSession`)
- Modify: `src/lib/services/tests/admin-session.test.ts` (`restoringSessions`, `adminPageState`)

**Interfaces:**
- Consumes: `restore`, `restoresRunning`, `sessions`, `credentialsOf`, `makeAdminClient`, `signOut`, `adminSessionsReady` (all in the same file).
- Produces: `restoringSessions: Readable<boolean>`. True while at least one restore runs.
- Produces: `withAdminSession<T>(node: BeaconNode, fn: (client: BeaconClient) => Promise<T>): Promise<T | null>`. Waits for `adminSessionsReady`. Null with no session. Never calls `askSignIn`. A 401 calls `signOut(node.id)` (only when the credentials did not change during the call, same rule as `withAdmin`) and returns null. Other errors pass through.
- Produces: `type AdminPageState = 'pick-node' | 'restoring' | 'sign-in' | 'ready'` and `adminPageState(node: BeaconNode | null, signedIn: ReadonlySet<string>, restoring: boolean): AdminPageState`. Order: no node → `'pick-node'`; session → `'ready'`; restoring → `'restoring'`; else `'sign-in'`.

- [ ] **Step 1: Write the failing tests**

In `admin-session-request.test.ts`, a `describe('withAdminSession')` that reuses the file's existing mocks and helpers:
- `runs at once with a session`: result equals the value of `fn`.
- `returns null with no session and opens no dialog`: `fn` not called, `get(signInRequest)` is `null`.
- `signs out on a 401 and opens no dialog`: `fn` rejects with the file's `unauthorized()` helper; result `null`, `hasAdminSession(node.id)` false, `get(signInRequest)` null, `fn` called one time.
- `passes a non-401 error through and keeps the session`: 500 rejects; session stays.
- `waits for the restore`: same shape as the existing `waits for the restore before it asks` test; a remembered session becomes available, `fn` runs with it.

In `admin-session.test.ts`:
Put these two in the `admin-session remembered sign-ins` describe, which already uses `fake-indexeddb`:
- `restoringSessions is true during a restore and false after`: `false` before the call; `true` right after `restoreRememberedSessions(...)` returns (the counter goes up before the first `await`); `false` after `await` of the returned promise.
- `restoringSessions goes false when the restore fails`: `vi.doMock('../admin-vault', …)` with a `loadRemembered` that rejects, before the module load; after `await`, `false`.
- `adminPageState`: table test with these rows (node `n1`):
  - `(null, {}, false)` → `'pick-node'`
  - `(null, {}, true)` → `'pick-node'`
  - `(n1, {n1}, true)` → `'ready'`
  - `(n1, {}, true)` → `'restoring'`
  - `(n1, {}, false)` → `'sign-in'`
  - `(n1, {n2}, false)` → `'sign-in'`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/services/tests/admin-session.test.ts src/lib/services/tests/admin-session-request.test.ts`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 3: Implement the three exports**

`restoringSessions`: a private `writable(false)`, exposed with `readonly`. Set it from `restoresRunning` at the increment and in the `finally` of `restore`. Put `withAdminSession` directly under `withAdmin`. Put `adminPageState` at the end of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/services/tests/`
Expected: PASS, including the #153 tests.

---

### Task 2: `AdminSessionRequired` component and its strings

**Files:**
- Create: `src/lib/components/AdminSessionRequired.svelte`
- Modify: `src/lib/i18n/locales/en.json`, `nl.json`, `it.json`, `es.json` (under `admin`)

**Interfaces:**
- Consumes: `askSignIn(node: BeaconNode): Promise<boolean>` from `@/services/admin-session`.
- Produces: `<AdminSessionRequired node={node} />` with prop `node: BeaconNode`. No events. The button calls `void askSignIn(node)`.

- [ ] **Step 1: Add the keys to `admin.sessionRequired` in all four locales**

| Key | en | nl | it | es |
|---|---|---|---|---|
| `title` | Admin session required | Beheerderssessie vereist | Sessione da amministratore richiesta | Sesión de administrador requerida |
| `textBefore` | Sign in on | Meld u aan op | Accedi su | Inicia sesión en |
| `textAfter` | with the admin credentials of the node. | met de beheerdersgegevens van de node. | con le credenziali da amministratore del nodo. | con las credenciales de administrador del nodo. |
| `button` | Sign in as admin | Aanmelden als beheerder | Accedi come amministratore | Iniciar sesión como administrador |

The terms match `admin.signIn` of each locale: nl "beheerder" and "u", it "amministratore", es "administrador". The button text equals `admin.nodePicker.signIn`.

- [ ] **Step 2: Build the component**

Markup, centered card (`--border`, `--card` background, radius `0.75rem`, max width about `28rem`, margin top `1.5rem`):
1. Icon tile: about 3rem square, radius `0.75rem`, `background: var(--admin-badge-background)`, white `LockIcon` (`@lucide/svelte/icons/lock`) with the same soft `drop-shadow` as the badge text shadow.
2. `<h2>` with `admin.sessionRequired.title`. Change only margins.
3. `<p>`: `{$t('admin.sessionRequired.textBefore')} <strong>{node.name}</strong> {$t('admin.sessionRequired.textAfter')}`, muted colour, `--font-size-sm`.
4. `Button` (`@/components/buttons/Button.svelte`) with `KeyRoundIcon` (`@lucide/svelte/icons/key-round`) and `admin.sessionRequired.button`.

- [ ] **Step 3: Verify**

Run: `npm run check` and `npx eslint src/lib/components/AdminSessionRequired.svelte`
Expected: 0 errors. A wrong key fails `check` through `MessageKey`.

---

### Task 3: Crawlers page uses the card

**Files:**
- Modify: `src/routes/data-browser/crawlers/+page.svelte`
- Modify: `src/lib/i18n/locales/*.json` (remove two keys)
- Modify: `AGENTS.md`, `docs/superpowers/admin-mode-roadmap.md`

**Interfaces:**
- Consumes: `signedInNodeIds`, `restoringSessions`, `withAdminSession`, `adminPageState` (Task 1); `AdminSessionRequired` (Task 2).

- [ ] **Step 1: Change the page script**

- `Phase` becomes `'idle' | 'loading' | 'ready' | 'error'`.
- Add `let gate = $derived(adminPageState(node, $signedInNodeIds, $restoringSessions))`.
- The load effect tracks `admin`, `nodeUrl` and `gate === 'ready'` (primitives only). Not ready: set `phase = 'idle'` and `crawlers = []` in `untrack`, and return. Ready: `untrack(() => load())`. Replace the comment "Opening this page counts as an admin action" with one that says the page loads only with a session.
- `load()` calls `withAdminSession` in place of `withAdmin`. On `null`, return (the store change shows the card). After the `await`, drop the result unless `current.url === nodeUrl` and `$signedInNodeIds.has(current.id)` (use `get(signedInNodeIds)` from `svelte/store`).
- `run`, `remove` and `CrawlerDialog` keep `withAdmin`.

- [ ] **Step 2: Change the page markup**

Inside `{:else}` after `NodePicker`, branch on `gate` first:
- `'pick-node'` → the existing `pickNode` text.
- `'restoring'` → the existing `loading` text.
- `'sign-in'` → `<AdminSessionRequired node={node} />` (`node` is non-null here; narrow with `{#if node}` if `check` asks).
- `'ready'` → the existing `phase` branches, without `needs-sign-in`.

- [ ] **Step 3: Remove the old keys and update the docs**

- Remove `dataBrowser.crawlers.needsSignIn` and `dataBrowser.crawlers.signIn` from all four locales. Grep `src` first: Task 3 Step 2 removes the only users.
- `AGENTS.md`, "Admin features" line in Frontend Conventions: add one sentence. "An admin-only page with no session shows `AdminSessionRequired`, loads through `withAdminSession`, and never opens the sign-in dialog by itself."
- Roadmap, "Sign-in" decisions: replace the crawlers behaviour with the card rule, and link this plan. Keep ASD-STE100 style.

- [ ] **Step 4: Verify**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: all pass, or only lint errors that exist on `feature/admin-mode` before this plan.

Smoke test on `npm run dev`, `/data-browser/crawlers`, "Show admin features" on:
1. New tab, no session: the card shows, no dialog.
2. Card button: dialog opens for the selected node. Cancel: card stays. Good sign-in: crawlers show.
3. Picker "Close admin session": card shows at once.
4. Switch to a node without a session: card. Switch back: crawlers.
5. Sign in from the picker while the card shows: crawlers show with no click on the card.
6. Remembered session, reload: loading text, then crawlers. No card flash.
7. Remembered session, change the password on the node, reload: card, no dialog.
8. "Show admin features" off: `AdminOnlyNotice`, no card.
9. Run a crawler, then "Close admin session" during the run: card shows; no error toast for the dropped report.
