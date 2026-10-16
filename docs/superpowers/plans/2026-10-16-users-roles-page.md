# Users & Roles Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the admin page `/node-management/users-roles`. On it an admin manages the users, the roles and the read rules of a Beacon node (GitHub issue #160).

**Architecture:** Pure domain code in a new folder `src/lib/access/` holds the rules: name check, password, access summary, totals, filters, and the two multi-step creates. The route page owns the load, the gate and the actions, as the Crawlers page does. Components in `src/lib/components/users-roles/` render the cards, the two tabs, the menus and the three dialogs.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, Vitest, svelte-i18n, bits-ui dropdown menu, lucide icons, `@maris-development/beacon-client` 2.0.0.

**Spec:** GitHub issue #160 (parent #165), and the seven mockups of 2026-10-16 (copies in the session scratchpad; the issue holds the originals).

## Global Constraints

- Admin mode follows the sub-issues of #165. Where `docs/superpowers/admin-mode-roadmap.md` disagrees, the issue wins.
- #152 (node picker) and #154 (`AdminSessionRequired`, `withAdminSession`, `adminPageState`) are done. Reuse them.
- The SDK exports `AuthUser`, `AuthRole`, `AuthRule`, `PrivilegeTarget` from the package root. Import them; do not copy them.
- `grantPrivilege` and `revokePrivilege` take no privilege. The SDK always sends `SELECT`.
- Load through `withAdminSession(node, fn)`. Run every change through `withAdmin(node, fn)`. A `null` result means "cancelled" or "no session". After each change, reload the users and the roles.
- `src/lib/access/*` is domain code: no Svelte, no `services`, no `stores`, no `components`. It may import types from `@maris-development/beacon-client` and `message` from `@/i18n`.
- Domain code returns a `Message` (`message(key, values)`). The component translates it.
- Never log, store, toast or send the password to telemetry. Clear it when a dialog closes.
- Render the dialogs as siblings of the page content, never inside another `Modal`. Use `Modal` (`@/components/modals/Modal.svelte`) with `title` and `subtitle`.
- Confirm a delete with `askConfirm({ …, destructive: true })` from `@/stores/confirm`.
- Every visible string comes from the catalog, placeholders too (ESLint `no-restricted-syntax`). ICU plurals for every count.
- Update all four catalogs: `en`, `es`, `it`, `nl`. The issue names three, but `SUPPORTED_LOCALES` also holds `es`. New keys go under a new top-level `usersRoles` object, plus `nav.item.usersRoles`.
- SCSS only. `font-size` only through `--font-size-*` tokens. Use the existing `--admin-badge-background` for the super-user avatar.
- Prefer `if`/`else` over `?:` in script code. Match the indentation of each file (tabs in `.svelte` and `.ts` files of this repo).
- Out of scope: Check access (toolbar button and row icon in the mockups), password change, anonymous on/off, write rules.
- Run `git commit` only when the user writes "commit". Commit on `feature/admin-mode`. Messages: imperative, about 50 characters, no prefix.
- With no admin session, hide refresh, New role and New user. The Crawlers page (#159, commit `ab5b293`) does the same, by decision of the user. This replaces "disabled with a lock icon" in the #160 text.
- `npm run lint` fails today with 8 errors in `PlotConfigPanel.svelte` and `services/beacon-node-health.ts`. They are not part of this work. "Lint passes" means no new errors.
- Do the smoke tests in a browser with the Playwright MCP (`mcp__playwright__*`) against `npm run dev`. If it is not available, tell the user (see `AGENTS.md`, "Validation Checklist").
- **Plan call:** the Public access card shows a short value (`None`, `All data`, `Limited`, `Full`), as the mockup shows "None". With no anonymous user the value is `Off`, and the line stays "Requests with no credentials".
- **Plan call:** the Add rule table select lists the tables of the default schema by bare name. `targetClause` in the SDK quotes the value as one identifier, so a `schema.table` name cannot work.
- **Plan call:** removing a role chip or a member has no confirmation. Only the deletes of a user and a role ask.

## Review Focus

1. A user lists a role that `listAuthRoles()` does not return (another admin dropped it between the two calls). Expect the summary to count that role as no rules, and no crash. Test in Task 1.
2. A role holds a grant on all data and also a deny. Expect amber "Limited access", not green. Test in Task 1.
3. The anonymous user has a role with a grant on all data. Expect the card value "All data". With no anonymous user in the list, expect "Off". Test in Task 1.
4. A role grant fails after `createUser` succeeds (or a rule copy after `createRole`). Expect the user (role) to stay, the remaining steps to run, and the failures to come back for one error toast. Test in Task 2.
5. A rule with `target_value: null` and `target_type: 'table'` (bad server data). Expect `targetOf` to give `{ type: 'table', value: '' }`, so revoke sends the same target, and the label shows `TABLE` with no name. Test in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/access/names.ts` | Name check for users and roles |
| `src/lib/access/password.ts` | Random password from an injected random source |
| `src/lib/access/summary.ts` | Access summary, totals, members, filters, sort, initials, rule targets |
| `src/lib/access/actions.ts` | `createUserWithRoles`, `createRoleFrom`: multi-step creates that keep going after a failure |
| `src/lib/access/tests/*.test.ts` | Tests of the four files above |
| `src/routes/node-management/users-roles/+page.svelte` | Load, gate, toolbar, tab state in the URL, actions, dialogs |
| `src/lib/components/users-roles/SummaryCards.svelte` | The four joined cards |
| `src/lib/components/users-roles/UserAvatar.svelte` | Shield, globe or initials avatar |
| `src/lib/components/users-roles/AccessCell.svelte` | Dot, label and line of an `AccessSummary` |
| `src/lib/components/users-roles/UsersTable.svelte` | Users tab table, role chips, Add role menu |
| `src/lib/components/users-roles/RolesPanel.svelte` | Roles tab: list, detail, rules, members, Add member menu |
| `src/lib/components/users-roles/NewUserDialog.svelte` | New user dialog |
| `src/lib/components/users-roles/NewRoleDialog.svelte` | New role dialog |
| `src/lib/components/users-roles/AddRuleDialog.svelte` | Add rule dialog |
| `src/lib/components/sidebar/AppSidebar.svelte` | Menu item |
| `eslint.config.js` | Add `src/lib/access/**` to the layer rule |
| `src/lib/i18n/locales/{en,es,it,nl}.json` | Strings |

---

### Task 1: Access domain rules

**Files:**
- Create: `src/lib/access/names.ts`, `src/lib/access/password.ts`, `src/lib/access/summary.ts`
- Create: `src/lib/access/tests/names.test.ts`, `src/lib/access/tests/password.test.ts`, `src/lib/access/tests/summary.test.ts`
- Modify: `eslint.config.js` (add `'src/lib/access/**'` to the `files` list of the layer rule)
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json` (the `usersRoles.access.*` keys below, so `MessageKey` type-checks)

**Interfaces:**
- Produces:
  - `isValidName(name: string): boolean`: `/^[A-Za-z_][A-Za-z0-9_]*$/`.
  - `generatePassword(random?: (bytes: Uint8Array) => Uint8Array, length = 20): string`. Default `random` is `(b) => crypto.getRandomValues(b)`. Alphabet: `A-Z a-z 0-9` without `0 O 1 l I`. Pick with rejection sampling (drop a byte `>= 256 - (256 % alphabet.length)`), so there is no modulo bias.
  - `type AccessTone = 'full' | 'none' | 'all' | 'limited'` (dot colours: red, grey, green, amber).
  - `type AccessSummary = { tone: AccessTone; label: Message; line: Message; short: Message }`
  - `accessSummary(user: AuthUser, roles: AuthRole[]): AccessSummary`. Rows of the issue, section 5, in order. A role name with no match in `roles` counts as a role with no rules. "All data" needs a grant with `target_type === 'all'` and zero denies over all roles of the user. `{roles}` is the user's role names joined with `, `.
  - `publicAccess(users: AuthUser[], roles: AuthRole[]): Message`: the `short` of the anonymous user, or `usersRoles.cards.publicOff` with no anonymous user.
  - `type Totals = { users: number; localUsers: number; roles: number; usersWithRole: number; grants: number; denies: number }`
  - `totals(users: AuthUser[], roles: AuthRole[]): Totals`. A local user is neither super-user nor anonymous. `usersWithRole` counts users with at least one role.
  - `ruleCount(role: AuthRole): number` = grants + denies.
  - `membersOf(role: string, users: AuthUser[]): AuthUser[]`
  - `rolesToAdd(user: AuthUser, roles: AuthRole[]): AuthRole[]`: roles the user lacks, sorted by name.
  - `usersToAdd(role: string, users: AuthUser[]): AuthUser[]`: users without the role, super-user left out.
  - `sortUsers(users: AuthUser[]): AuthUser[]`: super-user, then anonymous, then by name.
  - `filterUsers(users: AuthUser[], needle: string): AuthUser[]`: case-insensitive match on the name or on a role name. Empty needle gives all.
  - `filterRoles(roles: AuthRole[], needle: string): AuthRole[]`: case-insensitive match on the name.
  - `initials(name: string): string`: split on `_`, `-`, `.` and spaces; two parts or more give the first letter of the first two, one part gives its first two letters; upper case.
  - `targetOf(rule: AuthRule): PrivilegeTarget`: `null` value becomes `''`.
  - `describeTarget(target: PrivilegeTarget): Message`: `usersRoles.target.all`, `.table` (`{name}`), `.path` (`{glob}`).

Catalog keys for this task (`en`):

| Key | en |
|---|---|
| `usersRoles.access.full.label` | Full access |
| `usersRoles.access.full.line` | The super-user skips the rules |
| `usersRoles.access.full.short` | Full |
| `usersRoles.access.none.label` | No access |
| `usersRoles.access.none.noRoles` | The user has no role |
| `usersRoles.access.none.noGrants` | The roles have no grant rules |
| `usersRoles.access.none.short` | None |
| `usersRoles.access.all.label` | All data |
| `usersRoles.access.all.line` | Through {roles} |
| `usersRoles.access.all.short` | All data |
| `usersRoles.access.limited.label` | Limited access |
| `usersRoles.access.limited.line` | {grants, plural, one {# grant} other {# grant}} · {denies, plural, one {# deny} other {# deny}} |
| `usersRoles.access.limited.short` | Limited |
| `usersRoles.cards.publicOff` | Off |
| `usersRoles.target.all` | all data |
| `usersRoles.target.table` | TABLE {name} |
| `usersRoles.target.path` | PATH {glob} |

- [ ] **Step 1: Write the failing tests**

`names.test.ts`:

```ts
it.each(['jane_doe', 'Jane', '_x', 'a1'])('accepts %s', (name) => expect(isValidName(name)).toBe(true));
it.each(['', '1abc', 'jane-doe', 'jane doe', 'jöhn', 'a;b'])('rejects %s', (name) =>
	expect(isValidName(name)).toBe(false)
);
```

`password.test.ts`:

```ts
it('gives 20 characters from the alphabet', () => {
	expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
});

it('drops bytes above the last full alphabet cycle', () => {
	// 255 is above the cutoff, so the next byte (0) gives the first letter.
	let calls = 0;
	const random = (bytes: Uint8Array) => {
		bytes.fill(calls++ === 0 ? 255 : 0);
		return bytes;
	};
	expect(generatePassword(random, 1)).toBe('A');
});
```

`summary.test.ts`: build `user(name, roles, flags?)` and `role(name, grants, denies)` helpers, with `all = { privilege: 'SELECT', target_type: 'all', target_value: null }`. Assert with `translate(...)`.

```ts
it('gives full access to the super-user', () => {
	expect(translate(accessSummary(user('admin', [], { is_super_user: true }), []).label)).toBe('Full access');
});
it('gives no access without roles', () => {
	const s = accessSummary(user('jane', []), []);
	expect([s.tone, translate(s.line)]).toEqual(['none', 'The user has no role']);
});
it('gives no access with roles but no grant', () => {
	expect(translate(accessSummary(user('jane', ['r']), [role('r', [], [all])]).line)).toBe('The roles have no grant rules');
});
it('counts a missing role as a role with no rules', () => {                      // Review Focus 1
	expect(accessSummary(user('jane', ['gone']), []).tone).toBe('none');
});
it('gives all data through a grant on all and no deny', () => {
	const s = accessSummary(user('jane', ['a', 'b']), [role('a', [all], []), role('b', [], [])]);
	expect([s.tone, translate(s.line)]).toEqual(['all', 'Through a, b']);
});
it('gives limited access to a grant on all plus a deny', () => {                 // Review Focus 2
	const deny = { privilege: 'SELECT', target_type: 'table', target_value: 'secret' } as const;
	const s = accessSummary(user('jane', ['a']), [role('a', [all], [deny])]);
	expect([s.tone, translate(s.line)]).toEqual(['limited', '1 grant · 1 deny']);
});
it('reads the public access from the anonymous user', () => {                    // Review Focus 3
	const roles = [role('pub', [all], [])];
	expect(translate(publicAccess([user('anonymous', ['pub'], { is_anonymous: true })], roles))).toBe('All data');
	expect(translate(publicAccess([user('admin', [], { is_super_user: true })], roles))).toBe('Off');
});
it('counts the totals', () => {
	expect(totals(
		[user('admin', [], { is_super_user: true }), user('anonymous', [], { is_anonymous: true }), user('jane', ['a'])],
		[role('a', [all], []), role('b', [], [all])]
	)).toEqual({ users: 3, localUsers: 1, roles: 2, usersWithRole: 1, grants: 1, denies: 1 });
});
it('leaves the super-user out of usersToAdd', () => {
	const users = [user('admin', [], { is_super_user: true }), user('anonymous', [], { is_anonymous: true }), user('jane', ['a'])];
	expect(usersToAdd('a', users).map((u) => u.username)).toEqual(['anonymous']);
});
it('sorts the super-user, then anonymous, then by name', () => { /* zed, anonymous, admin(super), amy → admin, anonymous, amy, zed */ });
it('filters users on the name or a role name', () => { /* 'ANA' matches role 'analysts' and user 'banana' */ });
it.each([['jane_doe', 'JD'], ['admin', 'AD'], ['a.b-c', 'AB']])('initials of %s', (name, out) => expect(initials(name)).toBe(out));
it('reads a null target value as empty', () => {                                 // Review Focus 5
	expect(targetOf({ privilege: 'SELECT', target_type: 'table', target_value: null })).toEqual({ type: 'table', value: '' });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/access`
Expected: FAIL, the modules do not exist.

- [ ] **Step 3: Implement the interfaces above, the catalog keys (all four languages) and the ESLint line**

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest run src/lib/access`, `npm run check`, `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Add access rules for users and roles"`

### Task 2: Multi-step creates

**Files:**
- Create: `src/lib/access/actions.ts`
- Create: `src/lib/access/tests/actions.test.ts`

**Interfaces:**
- Consumes: `targetOf` (Task 1).
- Produces:
  - `type AuthAdmin = Pick<AdminClient, 'createUser' | 'grantRoleToUser' | 'createRole' | 'grantPrivilege'>` (`AdminClient` from the SDK).
  - `type StepFailure = { step: string; error: unknown }`
  - `createUserWithRoles(admin: AuthAdmin, username: string, password: string, roles: string[]): Promise<StepFailure[]>`. `createUser` first; if it throws, the error propagates (nothing was made). Then `grantRoleToUser` for each role, in order; a throw is recorded with `step` = the role name, and the loop goes on.
  - `createRoleFrom(admin: AuthAdmin, name: string, source: AuthRole | null): Promise<StepFailure[]>`. `createRole` first, it propagates. Then `grantPrivilege(name, targetOf(rule), false)` for each grant, and `(…, true)` for each deny. A throw is recorded with `step` = `` `${deny ? 'deny' : 'grant'} ${target_type} ${target_value ?? ''}`.trim() ``, and the loop goes on.

- [ ] **Step 1: Write the failing tests**

A fake admin that records calls and throws on a named argument.

```ts
it('creates the user, then grants each role, and goes on after a failure', async () => {   // Review Focus 4
	const admin = fake({ failGrantRole: 'b' });
	expect((await createUserWithRoles(admin, 'jane', 'pw', ['a', 'b', 'c'])).map((f) => f.step)).toEqual(['b']);
	expect(admin.calls).toEqual([['createUser', 'jane', 'pw'], ['grantRoleToUser', 'jane', 'a'], ['grantRoleToUser', 'jane', 'b'], ['grantRoleToUser', 'jane', 'c']]);
});
it('stops when createUser fails', async () => {
	await expect(createUserWithRoles(fake({ failCreate: true }), 'jane', 'pw', ['a'])).rejects.toThrow();
});
it('copies the grants and the denies of the source role', async () => {
	const admin = fake({});
	await createRoleFrom(admin, 'copy', { name: 'src', grants: [all], denies: [tablePriv('secret')] });
	expect(admin.calls).toEqual([
		['createRole', 'copy'],
		['grantPrivilege', 'copy', { type: 'all' }, false],
		['grantPrivilege', 'copy', { type: 'table', value: 'secret' }, true]
	]);
});
it('creates an empty role from null', async () => { /* calls === [['createRole', 'x']] */ });
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/access/tests/actions.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `actions.ts`**

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/access`
Expected: PASS.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Add user and role create steps"`

### Task 3: Route, menu item, toolbar, cards and tabs

**Files:**
- Create: `src/routes/node-management/users-roles/+page.svelte`
- Create: `src/lib/components/users-roles/SummaryCards.svelte`
- Modify: `src/lib/components/sidebar/AppSidebar.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `totals`, `publicAccess` (Task 1). `adminPageState`, `withAdminSession`, `withAdmin`, `signedInNodeIds`, `adminErrorMessage` (`@/services/admin-session`). `NodePicker`, `AdminOnlyNotice`, `AdminSessionRequired`, `Cookiecrumb`, `Button`.
- Produces (page state that Tasks 4-6 use):
  - `users: AuthUser[]`, `roles: AuthRole[]`, `phase: 'idle' | 'loading' | 'ready' | 'error'`, `load(): Promise<void>`.
  - `tab: 'users' | 'roles'`, `needle: string`, `selectedRole: string | null`.
  - `change(fn: (admin: BeaconClient['admin']) => Promise<unknown>, failKey: MessageKey): Promise<boolean>`: runs `withAdmin(node, (c) => fn(c.admin))`, toasts `failKey` with `adminErrorMessage` as `message` on a throw, reloads in every case except a cancel, and returns `true` on success. Tasks 4-6 route each single-call action through it.
  - `SummaryCards` props: `{ users: AuthUser[]; roles: AuthRole[] }`.

- [ ] **Step 1: Add the menu item**

In `AppSidebar.svelte`, group `nav.group.nodeManagement`, after System Info: `{ title: 'nav.item.usersRoles', url: resolve('/node-management/users-roles'), icon: UsersIcon, adminOnly: true }`. `UsersIcon` from `@lucide/svelte/icons/users`.

- [ ] **Step 2: Build the page shell**

Copy the Crawlers page pattern (`src/routes/data-browser/crawlers/+page.svelte`): `admin`, `gate`, the `$effect` with `untrack` that calls `load()` only when `admin && nodeUrl !== null && gate === 'ready'`, and the stale check after the await (`current.url !== nodeUrl || !get(signedInNodeIds).has(current.id)`). `load()` fetches `Promise.all([admin.listAuthUsers(), admin.listAuthRoles()])` in one `withAdminSession`. Sort `roles` by name.

Markup, top to bottom:
- `<svelte:head>` title `app.pageTitle` with `nav.item.usersRoles`. `Cookiecrumb`: Node Management (no link) is not a route, so one crumb: `nav.item.usersRoles`.
- `page-wrapper` > `page-container` > `h1` `nav.item.usersRoles`, `p` `usersRoles.intro`.
- `{#if !admin}<AdminOnlyNotice />`.
- `.toolbar` row: copy the markup and the `.toolbar` / `.toolbar-actions` styles of `src/routes/data-browser/crawlers/+page.svelte`. `<NodePicker />` left; `.toolbar-actions` right, under `{#if node && gate === 'ready'}`: refresh (`variant="outline" size="icon"`, `RefreshCwIcon`, `aria-label` and `title` `usersRoles.refresh`, `disabled={phase === 'loading'}`), New role (outline, `ShieldPlusIcon`), New user (primary, `UserPlusIcon`). Both new buttons `disabled={phase !== 'ready'}`. Task 6 wires them.
- Branches: pick-node (`usersRoles.pickNode`), `sign-in` → `<AdminSessionRequired {node} />`, loading, error with retry, ready.
- Ready: `<SummaryCards {users} {roles} />`, then a `.tabs-row`: a tab bar left (`role="tablist"`, two buttons "Users" / "Roles", each with a count pill; the active tab has a light primary background and a filled pill, as in the mockup), a search `Input` right with `SearchIcon` and placeholder `usersRoles.filter.users` or `usersRoles.filter.roles`. Under it: the Users tab or the Roles tab (placeholders until Tasks 4-5).

Tab in the URL: read `page.url.searchParams.get('tab') === 'roles'`. On a switch, `replaceState` a copy of `page.url` with `tab=roles`, or without `tab` for users (pattern of `src/routes/sql-editor/+page.svelte`, including its dev guard). Clear `needle` on a switch.

`SummaryCards`: one bordered strip, four equal columns with a vertical divider; two columns below 900px, one below 480px. Each cell: label, value (`--font-size-xl`, bold), line (muted, `--font-size-sm`). Values and lines from `totals()` and `publicAccess()`; `Public access` line is always `usersRoles.cards.publicLine`.

- [ ] **Step 3: Catalogs (all four)**

| Key | en |
|---|---|
| `nav.item.usersRoles` | Users & Roles |
| `usersRoles.intro` | Control who reads the data of the node. A role holds grant and deny rules on all data, on a table or on a path. A user gets the rules of its roles. |
| `usersRoles.pickNode` | Pick a Beacon node. |
| `usersRoles.loading` | Loading users and roles… |
| `usersRoles.tryAgain` | Try again |
| `usersRoles.refresh` | Refresh |
| `usersRoles.newUser` | New user |
| `usersRoles.newRole` | New role |
| `usersRoles.cards.users` | Users |
| `usersRoles.cards.usersLine` | {count, plural, one {# local user} other {# local users}} |
| `usersRoles.cards.roles` | Roles |
| `usersRoles.cards.rolesEmpty` | Create a role to give access |
| `usersRoles.cards.rolesLine` | Given to {count, plural, one {# user} other {# users}} |
| `usersRoles.cards.rules` | Rules |
| `usersRoles.cards.rulesLine` | {grants, plural, one {# grant} other {# grant}} · {denies, plural, one {# deny} other {# deny}} |
| `usersRoles.cards.public` | Public access |
| `usersRoles.cards.publicLine` | Requests with no credentials |
| `usersRoles.tab.users` | Users |
| `usersRoles.tab.roles` | Roles |
| `usersRoles.filter.users` | Filter users or roles |
| `usersRoles.filter.roles` | Filter roles |
| `usersRoles.loadFailed` | The users and roles could not be loaded. |

- [ ] **Step 4: Verify**

Run: `npm run check`, `npm run lint`
Expected: no errors. On `npm run dev`: the item shows in Node Management only with "Show admin features" on; with no session the card from #154 shows and the toolbar right side is empty; with a session the cards show the counts; `?tab=roles` opens the Roles tab and survives a reload.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Add Users & Roles page with summary cards"`

### Task 4: Users tab

**Files:**
- Create: `src/lib/components/users-roles/UserAvatar.svelte`, `AccessCell.svelte`, `UsersTable.svelte`
- Modify: `src/routes/node-management/users-roles/+page.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `accessSummary`, `sortUsers`, `filterUsers`, `rolesToAdd`, `ruleCount`, `initials` (Task 1). `change` (Task 3).
- Produces:
  - `UserAvatar` props `{ user: AuthUser }`: super-user = `ShieldIcon` on `--admin-badge-background`, white icon; anonymous = `GlobeIcon` on `--muted`; local = `initials(user.username)` on a light purple tint. Round, 2.25rem.
  - `AccessCell` props `{ summary: AccessSummary }`. Dot colours: `full` `--destructive`, `none` `--muted-foreground`, `all` `--access-all`, `limited` `--access-limited`. `tailwind.css` `:root` has no green or amber token, so add these two there (`#16a34a`, `#d97706`), so a brand can change them. The Grant and Deny badges of Task 5 use `--access-all` and `--destructive`.
  - `UsersTable` props `{ users: AuthUser[]; roles: AuthRole[]; needle: string; onAddRole: (user: string, role: string) => void; onRemoveRole: (user: string, role: string) => void; onNewRoleFor: (user: string) => void; onDelete: (user: AuthUser) => void }`.

- [ ] **Step 1: Build the table**

A plain `<table>` in a bordered card. Header row: `usersRoles.users.col.user`, `.roles`, `.access`, and an empty actions column. Rows: `sortUsers(filterUsers(users, needle))`.

- User cell: `UserAvatar`, name (bold), badge (`usersRoles.users.badge.superUser` with the admin gradient, or `.anonymous` as an outline badge), line under it: super-user `usersRoles.users.line.superUser`, anonymous `.anonymous`, local with no role `.noRole`, else nothing.
- Roles cell: super-user shows `usersRoles.users.noRoleNeeded` (muted). Else one chip per role (name + `XIcon` button, `aria-label` `usersRoles.users.removeRole` with `{role}`), then the **+ Add role** button (dashed border, primary text). It is a `DropdownMenu.Trigger` (pattern of `src/lib/components/NodePicker.svelte`). Menu content: a `DropdownMenu.Label` in capitals `usersRoles.users.addRoleTo` (`{user}`); one item per `rolesToAdd(user, roles)` with `ShieldIcon`, the name and `usersRoles.ruleCount` (`{count}`); a separator; `ShieldPlusIcon` `usersRoles.users.newRoleItem`.
- Access cell: `AccessCell` with `accessSummary(user, roles)`.
- Actions cell: local users only, a red `Trash2Icon` icon button, `aria-label` `usersRoles.users.delete` with `{user}`.
- Footer row inside the card: `InfoIcon` + `usersRoles.users.footer`.
- With a needle and no match: one row `usersRoles.users.noMatch`.

- [ ] **Step 2: Wire the actions in the page**

- `onAddRole` → `change((a) => a.grantRoleToUser(user, role), 'usersRoles.users.addRoleFailed')`.
- `onRemoveRole` → `change((a) => a.revokeRoleFromUser(user, role), 'usersRoles.users.removeRoleFailed')`.
- `onDelete` → `askConfirm({ title: usersRoles.users.deleteTitle {user}, message: usersRoles.users.deleteMessage {user, node}, confirmLabel: common.delete, destructive: true })`, then `change((a) => a.dropUser(user), 'usersRoles.users.deleteFailed')`, and a success toast `usersRoles.users.deleted`.
- `onNewRoleFor` → set `newRoleFor = user` and open the New role dialog (Task 6).

- [ ] **Step 3: Catalogs (all four)**

| Key | en |
|---|---|
| `usersRoles.users.col.user` | User |
| `usersRoles.users.col.roles` | Roles |
| `usersRoles.users.col.access` | Access |
| `usersRoles.users.badge.superUser` | Super-user |
| `usersRoles.users.badge.anonymous` | Anonymous |
| `usersRoles.users.line.superUser` | Set in the node configuration |
| `usersRoles.users.line.anonymous` | Every request with no credentials |
| `usersRoles.users.line.noRole` | No role yet |
| `usersRoles.users.noRoleNeeded` | No role needed |
| `usersRoles.users.addRole` | Add role |
| `usersRoles.users.addRoleTo` | Add a role to {user} |
| `usersRoles.users.newRoleItem` | New role… |
| `usersRoles.users.removeRole` | Remove {role} |
| `usersRoles.users.delete` | Delete {user} |
| `usersRoles.users.deleteTitle` | Delete {user}? |
| `usersRoles.users.deleteMessage` | {user} can no longer sign in on {node}. |
| `usersRoles.users.deleted` | {user} is deleted. |
| `usersRoles.users.deleteFailed` | The user could not be deleted. |
| `usersRoles.users.addRoleFailed` | The role could not be given. |
| `usersRoles.users.removeRoleFailed` | The role could not be removed. |
| `usersRoles.users.footer` | A user reads data through the rules of its roles. Deny rules win over grant rules. |
| `usersRoles.users.noMatch` | No user matches the filter. |
| `usersRoles.ruleCount` | {count, plural, =0 {No rules} one {# rule} other {# rules}} |

The menu label shows in capitals through CSS (`text-transform: uppercase`), not in the catalog.

- [ ] **Step 4: Verify**

Run: `npm run check`, `npm run lint`
Expected: no errors. On a node: add a role from the menu, remove it with the chip button, delete a local user after the confirmation. The super-user and anonymous rows have no trash button.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Add the users tab"`

### Task 5: Roles tab

**Files:**
- Create: `src/lib/components/users-roles/RolesPanel.svelte`
- Modify: `src/routes/node-management/users-roles/+page.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `filterRoles`, `membersOf`, `usersToAdd`, `ruleCount`, `targetOf`, `describeTarget` (Task 1). `UserAvatar` (Task 4). `change` (Task 3).
- Produces: `RolesPanel` props `{ roles: AuthRole[]; users: AuthUser[]; needle: string; selected: string | null; onSelect: (role: string) => void; onNewRole: () => void; onAddRule: (role: string) => void; onRemoveRule: (role: string, target: PrivilegeTarget, deny: boolean) => void; onAddMember: (role: string, user: string) => void; onRemoveMember: (role: string, user: string) => void; onDelete: (role: AuthRole) => void }`.

- [ ] **Step 1: Build the panel**

Two columns (`grid-template-columns: 18rem 1fr`; one column below 768px).

- Left card: one button per `filterRoles(roles, needle)`: `ShieldIcon` in a primary tile, name, `usersRoles.roles.counts` (`{rules}`, `{members}`). The selected one has a light primary background. Last: **+ New role** (`onNewRole`). With no roles: only the New role button.
- Right card, for the selected role (the page falls back to the first role when `selected` is `null` or no longer exists):
  - Header: `ShieldIcon` tile, name, counts; primary **+ Add rule** (`onAddRule`); red `Trash2Icon` icon button (`onDelete`).
  - **Access rules** heading with `usersRoles.roles.rulesHint` beside it. Each rule row: a Grant badge (green) or Deny badge (red), `SELECT` in mono, the target `describeTarget(targetOf(rule))` in mono, and an `XIcon` remove button. Grants first, then denies. Empty: a dashed box with `ShieldOffIcon`, `usersRoles.roles.noRules` and an outline **+ Add the first rule**.
  - **Members** heading with an outline **Add member** (`UserPlusIcon`) as `DropdownMenu.Trigger`. Menu: label `usersRoles.roles.giveTo` (`{role}`, capitals through CSS), one item per `usersToAdd(role, users)`: `UserAvatar`, name, the user's roles joined with `, ` or `usersRoles.roles.noRole`. With nobody to add: one disabled item `usersRoles.roles.nobodyToAdd`. List: `UserAvatar`, name, `XIcon` remove button. Empty: `usersRoles.roles.noMembers`.

- [ ] **Step 2: Wire the actions in the page**

- `onRemoveRule` → `change((a) => a.revokePrivilege(role, target, deny), 'usersRoles.roles.removeRuleFailed')`.
- `onAddMember` → `grantRoleToUser(user, role)`. `onRemoveMember` → `revokeRoleFromUser(user, role)`. Same fail keys as Task 4.
- `onDelete` → `askConfirm({ title: usersRoles.roles.deleteTitle {role}, message: usersRoles.roles.deleteMessage {role, count, members}, destructive: true, confirmLabel: common.delete })`. `members` is `membersOf(...)` names joined with `, `. Then `change((a) => a.dropRole(role), 'usersRoles.roles.deleteFailed')`, a success toast, and `selectedRole = null`.
- `onAddRule` → open the Add rule dialog (Task 6).

- [ ] **Step 3: Catalogs (all four)**

| Key | en |
|---|---|
| `usersRoles.roles.counts` | {rules, plural, one {# rule} other {# rules}} · {members, plural, one {# member} other {# members}} |
| `usersRoles.roles.addRule` | Add rule |
| `usersRoles.roles.addFirstRule` | Add the first rule |
| `usersRoles.roles.rules` | Access rules |
| `usersRoles.roles.rulesHint` | Deny rules win over grant rules. With no matching grant, Beacon refuses the read. |
| `usersRoles.roles.grant` | Grant |
| `usersRoles.roles.deny` | Deny |
| `usersRoles.roles.noRules` | This role has no rules. Its members read nothing. |
| `usersRoles.roles.removeRule` | Remove rule |
| `usersRoles.roles.members` | Members |
| `usersRoles.roles.addMember` | Add member |
| `usersRoles.roles.giveTo` | Give {role} to |
| `usersRoles.roles.noRole` | No role |
| `usersRoles.roles.nobodyToAdd` | Every user has this role. |
| `usersRoles.roles.noMembers` | No user has this role. |
| `usersRoles.roles.removeMember` | Remove {user} |
| `usersRoles.roles.delete` | Delete {role} |
| `usersRoles.roles.deleteTitle` | Delete {role}? |
| `usersRoles.roles.deleteMessage` | {count, plural, =0 {No user has {role}.} one {# user loses {role}: {members}.} other {# users lose {role}: {members}.}} |
| `usersRoles.roles.deleted` | {role} is deleted. |
| `usersRoles.roles.deleteFailed` | The role could not be deleted. |
| `usersRoles.roles.removeRuleFailed` | The rule could not be removed. |

- [ ] **Step 4: Verify**

Run: `npm run check`, `npm run lint`
Expected: no errors. On a node: select a role, remove a rule, add and remove a member, delete a role. The confirmation names the members.

- [ ] **Step 5: Commit (only on the word "commit")**

`git commit -m "Add the roles tab"`

### Task 6: Dialogs

**Files:**
- Create: `src/lib/components/users-roles/NewUserDialog.svelte`, `NewRoleDialog.svelte`, `AddRuleDialog.svelte`
- Modify: `src/routes/node-management/users-roles/+page.svelte`
- Modify: `src/lib/i18n/locales/{en,es,it,nl}.json`

**Interfaces:**
- Consumes: `isValidName`, `generatePassword`, `ruleCount`, `describeTarget` (Task 1). `createUserWithRoles`, `createRoleFrom`, `StepFailure` (Task 2). `withAdmin`, `adminErrorMessage`. `makeBeaconClient` (`@/beacon-api/client`), `buildTree` (`@/sql/catalog`), `splitTree` (`@/data-browser/tables`).
- Produces:
  - `NewUserDialog` props `{ node: BeaconNode; roles: AuthRole[]; onClose: () => void; onSaved: () => void }`.
  - `NewRoleDialog` props `{ node: BeaconNode; roles: AuthRole[]; giveTo: string | null; onClose: () => void; onSaved: (role: string) => void }`.
  - `AddRuleDialog` props `{ node: BeaconNode; role: string; onClose: () => void; onSaved: () => void }`.

Shared behaviour: follow `src/lib/components/data-browser/CrawlerDialog.svelte` (its `.field`, `.required`, `.hint`, `.error`, `select` styles, `busy`, `failure`, `canCloseModal={!busy}`, footer slot). Save runs in `withAdmin(node, (c) => …)`. `null` (cancelled sign-in) keeps the dialog open. A throw from the first step shows the error inside the dialog: an `ApiError` with status 409 gives `usersRoles.error.exists`, any other throw gives `adminErrorMessage(caught)`. Step failures close the dialog, call `onSaved`, and show one error toast `usersRoles.partialFailed` with the failed steps and the first error as `message`. Field errors show only after the first Save click.

- [ ] **Step 1: New user dialog**

Per the issue, section 6, and mockups 2 and 6. Title `usersRoles.newUserDialog.title`, subtitle with `{node}` = node name. Username `Input` (`required`, red `*`, `autocomplete="off"`), placeholder `jane_doe` from the catalog, hint. Password `Input` (`type` password or text through the eye button, `autocomplete="new-password"`), outline `KeyRoundIcon` **Generate** that sets `generatePassword()` and shows it. Roles: a bordered list with a `Checkbox` per role and the rule count right-aligned (`usersRoles.ruleCount`), or the "no roles yet" text. Footer: Cancel, primary `UserPlusIcon` Create user. Save calls `createUserWithRoles`. `onDestroy` sets the password to `''`. Never pass the password to a toast, a `console` call or `track`.

- [ ] **Step 2: New role dialog**

Per the issue, section 7, and mockup 3. Role name `Input`, placeholder `analysts`, same hint. "Start from" only when `roles.length > 0`: a `<select>` with "An empty role" and one option per role (`usersRoles.newRoleDialog.copyOf` with `{role}` and `{count}`). Save calls `createRoleFrom(admin, name, source)`. With `giveTo` set, it then calls `grantRoleToUser(giveTo, name)` in the same `withAdmin`, and a throw there joins the step failures. `onSaved(name)`.

In the page: `onSaved(name)` sets `selectedRole = name`. When the dialog came from the toolbar or the Roles tab, switch to the Roles tab; when it came from a user's "New role…", stay on the Users tab.

- [ ] **Step 3: Add rule dialog**

Title `usersRoles.addRuleDialog.title` (`{role}`). Two radio groups as segmented buttons: Grant / Deny, and All data / Table / Path. Table: a `<select>` of the default-schema table names, loaded on open with `makeBeaconClient(node).catalogs()` → `buildTree` → `splitTree(...)`; while it loads, a disabled select; on a load error, a plain text `Input` instead. Path: `Input`, placeholder `argo/**/*.nc`. Under the form, a mono preview line: `SELECT on {target}` with `describeTarget` of the current target, prefixed by Grant or Deny. Save is disabled until a table or a non-empty path is set. Save: `withAdmin(node, (c) => c.admin.grantPrivilege(role, target, deny))`, then `onSaved`.

- [ ] **Step 4: Wire the dialogs in the page**

Render the three dialogs after `page-wrapper`, each under its own `{#if}`. Toolbar New user / New role, the Users tab "New role…", the Roles tab "+ New role", "+ Add rule" and "+ Add the first rule" open them. `onSaved` closes the dialog and calls `load()`.

- [ ] **Step 5: Catalogs (all four)**

| Key | en |
|---|---|
| `usersRoles.newUserDialog.title` | New user |
| `usersRoles.newUserDialog.subtitle` | The user signs in on {node} with this name and password. |
| `usersRoles.newUserDialog.username` | Username |
| `usersRoles.newUserDialog.usernamePlaceholder` | jane_doe |
| `usersRoles.nameHint` | Letters, digits and underscores. Do not start with a digit. |
| `usersRoles.newUserDialog.password` | Password |
| `usersRoles.newUserDialog.showPassword` | Show password |
| `usersRoles.newUserDialog.hidePassword` | Hide password |
| `usersRoles.newUserDialog.generate` | Generate |
| `usersRoles.newUserDialog.passwordHint` | {app} does not keep the password. Give it to the user now. |
| `usersRoles.newUserDialog.roles` | Roles |
| `usersRoles.newUserDialog.noRoles` | The node has no roles yet. With no role, the user reads nothing. |
| `usersRoles.newUserDialog.create` | Create user |
| `usersRoles.newUserDialog.created` | {user} is created. |
| `usersRoles.newRoleDialog.title` | New role |
| `usersRoles.newRoleDialog.subtitle` | A role holds the rules. Add the rules, then give the role to users. |
| `usersRoles.newRoleDialog.name` | Role name |
| `usersRoles.newRoleDialog.namePlaceholder` | analysts |
| `usersRoles.newRoleDialog.startFrom` | Start from |
| `usersRoles.newRoleDialog.empty` | An empty role |
| `usersRoles.newRoleDialog.copyOf` | The rules of {role} ({count, plural, =0 {No rules} one {# rule} other {# rules}}) |
| `usersRoles.newRoleDialog.create` | Create role |
| `usersRoles.newRoleDialog.created` | {role} is created. |
| `usersRoles.addRuleDialog.title` | Add a rule to {role} |
| `usersRoles.addRuleDialog.effect` | Effect |
| `usersRoles.addRuleDialog.target` | Target |
| `usersRoles.addRuleDialog.all` | All data |
| `usersRoles.addRuleDialog.table` | Table |
| `usersRoles.addRuleDialog.path` | Path |
| `usersRoles.addRuleDialog.pathPlaceholder` | argo/**/*.nc |
| `usersRoles.addRuleDialog.tableLoading` | Loading tables… |
| `usersRoles.addRuleDialog.preview` | {effect} SELECT on {target} |
| `usersRoles.addRuleDialog.add` | Add rule |
| `usersRoles.error.nameRequired` | Enter a name. |
| `usersRoles.error.nameInvalid` | Use letters, digits and underscores. Do not start with a digit. |
| `usersRoles.error.passwordRequired` | Enter a password. |
| `usersRoles.error.exists` | This name exists already on the node. |
| `usersRoles.partialFailed` | {count, plural, one {One step failed: {steps}.} other {# steps failed: {steps}.}} Check the result and try again. |

`argo/**/*.nc` and `{target}` contain no `{`/`'` that ICU would parse; keep it that way.

- [ ] **Step 6: Verify**

Run: `npm run check`, `npm run lint`
Expected: no errors. Escape and the X close each dialog; reopen New user and the password field is empty.

- [ ] **Step 7: Commit (only on the word "commit")**

`git commit -m "Add user, role and rule dialogs"`

### Task 7: Docs and full verification

**Files:**
- Modify: `docs/superpowers/admin-mode-roadmap.md` (status row 6: built, with the plan path; add "Users & Roles: #160, [plan](plans/2026-10-16-users-roles-page.md)." to the "Change of course" line)
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the docs**

`AGENTS.md`, section "High-Level Architecture", domain modules: add `src/lib/access/*` (users and roles: name check, password, access summary, multi-step creates; no Svelte, no services). Section "Layer Rule": add `access` beside `query / geo / sql / data-browser` in the chain line. Keep to the existing style.

- [ ] **Step 2: Full verification**

Run: `npm test`, `npm run check`, `npm run lint`
Expected: tests and check pass; lint shows only the 8 known errors.

Smoke test with the Playwright MCP on `npm run dev`, `/node-management/users-roles`, on a node with anonymous access on. Take a screenshot of the Users tab and the Roles tab, and compare them with the mockups:
1. "Show admin features" off: no menu item; the URL shows `AdminOnlyNotice`.
2. No session: the #154 card; no toolbar buttons on the right.
3. Sign in. Users: the super-user and anonymous rows; no trash on either. Public access shows "None".
4. New role `analysts` from the toolbar: the Roles tab opens with `analysts` selected. Add a grant on all data, a deny on a table from the select, and a grant on `argo/**/*.nc`. Remove the path rule.
5. New role `copy` with "Start from" = analysts: it has the same two rules.
6. New user `jane_doe` with Generate and the `analysts` role. The Access column shows amber "Limited access, 1 grant · 1 deny".
7. Give `copy` to anonymous through Add member: Public access shows "Limited". Remove the deny rule of `copy`: Public access shows "All data".
8. On `jane_doe`: Add role → New role… `viewers`: the role is created and given to her; the tab stays Users.
9. Delete `viewers` (the confirmation names `jane_doe`), `copy` (it names `anonymous`) and `analysts`. Then delete `jane_doe`.
10. Switch the node during a load: no rows of the old node show.

- [ ] **Step 3: Commit (only on the word "commit")**

`git commit -m "Document the access domain module"`
