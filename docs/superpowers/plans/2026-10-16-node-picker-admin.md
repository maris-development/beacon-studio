# Node picker with admin actions: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shared `NodePicker` shows the state of each node and gives three actions: admin sign-in or sign-out, add a node, manage nodes. The add-node modal and the sign-in dialog follow the mockups.

**Architecture:** The rules with no DOM go into plain TypeScript with tests. `admin-session.ts` gets `checkAdminCredentials`. A new `services/node-form.ts` saves a node and then signs in. `beacon-node-url.ts` gets `nodeHost`. The components use these functions and hold markup only. The picker moves from `ui/select` to `ui/dropdown-menu` (bits-ui), which keeps the keyboard navigation.

**Tech Stack:** SvelteKit 2, Svelte 5, bits-ui 2, `@lucide/svelte`, svelte-i18n, Vitest with jsdom, SCSS.

**Spec:** the GitHub issue text in the chat of 2026-10-16 (picker, sign-in dialog, add-node modal), plus four mockups. No spec file. The decisions below replace a spec.

## Decisions made in this plan

- The "Remember on this device" checkbox is not built (issue #153). The help text therefore leaves out the "Without 'Remember'" part: "Use BEACON_ADMIN_USERNAME and BEACON_ADMIN_PASSWORD of the node. {app} keeps the credentials for this browser tab only." Issue #153 adds the sentence back.
- The variable names are correct. `beacon-server/beacon-server-config/src/lib.rs:301-303` reads `BEACON_ADMIN_USERNAME` (default `beacon-admin`) and `BEACON_ADMIN_PASSWORD`.
- The Admin badge uses the beacon-datalake.org header gradient as its **background**, with white bold text. The middle of the gradient is light grey, so the text gets a soft dark `text-shadow`. The gradient is a token `--admin-badge-background` in `src/tailwind.css` `:root`, so a brand can change it.
- The strings say `{app}`, not "Studio" (AGENTS.md, Translations).
- The repo has four locales now: `en`, `nl`, `it` and `es`. The issue names three. Add every key to all four.
- `AddBeaconModal` now collects admin credentials. The user removed the AGENTS.md rule "Never ask for admin credentials in a page or a modal" (2026-10-16). The modal never stores them: it gives them to `signIn` in `admin-session.ts`. Task 7 updates AGENTS.md and the roadmap.
- `onSave` of `AddBeaconModal` gets the saved node (`null` after a delete). The three other callers ignore the argument, so they need no change.
- The modal submit button becomes `type="submit" form="node-form"`. The current button sits outside the form and calls `submitForm` by `onclick`, so the browser skips the `required` and `type="url"` checks. The admin fields need those checks.
- Edit mode: with a session on the node, the admin box shows "Signed in as admin." and a "Close admin session" button, and no fields. Without a session, the box shows the empty fields.

## Global Constraints

- Translate every user-visible string. Add each key to `en.json`, `nl.json`, `it.json`, `es.json` under `src/lib/i18n/locales/`. ESLint rejects literal words in markup, `placeholder`, `title` and `aria-label`.
- Use `$t` in components, `translate` in plain code at the point of use.
- SCSS only. `font-size` only through `--font-size-*` tokens. Body text: `xs`, `sm`, `md`.
- Keep the indent style of each file. Svelte and most TS files use tabs. `beacon-node-url.ts` uses 4 spaces.
- Prefer `if`/`else` over `?:` in script code.
- Comments: one short line, intent only, current behaviour only.
- Put tests in `src/lib/services/tests/`.
- Admin controls and badges show only when `$settings.adminFeatures` is on.
- Never save admin credentials on the node record.
- Do not commit. The user commits. Never create a branch.
- Edit files with the Edit or Write tool. Never with `sed`, `perl` or `echo`.

## Review Focus

1. **Sign-in fails during an add** (wrong password, or the admin route is unreachable): the node stays in the list, the modal closes, and a warning toast names the node and gives the error. Task 2 tests the 401 case.
2. **No nodes at all**: the trigger shows the placeholder, the dropdown shows "Add node" and "Manage nodes", and no sign-in row. Task 6 Step 3 checks this by hand.
3. **Offline node or no latency yet** (`latencyMs === null`): the trigger shows the host only, never "null ms". Task 1 tests `nodeHost` with a URL that does not parse. Task 6 Step 3 checks the offline line.
4. **Edit with a changed URL and new admin credentials**: `updateNode` signs out the old session, and then `saveNodeForm` signs in on the new URL. Task 2 tests this.
5. **Only one admin field filled in**: the form blocks the submit and asks for the other field. `hasAdminInput` drives `required`. Task 2 tests `hasAdminInput`. Task 5 Step 4 checks the form by hand.

---

### Task 1: `nodeHost` and `checkAdminCredentials`

**Files:**
- Modify: `src/lib/services/beacon-node-url.ts` (append)
- Modify: `src/lib/services/admin-session.ts` (`makeAdminClient`, `signIn`)
- Create: `src/lib/services/tests/beacon-node-url.test.ts`
- Modify: `src/lib/services/tests/admin-session.test.ts`

**Interfaces:**
- Produces: `nodeHost(url: string): string`
- Produces: `checkAdminCredentials(url: string, credentials: AdminCredentials): Promise<void>`. It throws `AdminAuthError` on 401 and passes other errors through. It saves nothing.
- Changes: `makeAdminClient(node: Pick<BeaconNode, 'url'>, credentials)`. A `BeaconNode` still fits.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/tests/beacon-node-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nodeHost } from '../beacon-node-url';

describe('nodeHost', () => {
	it('returns the host of a node URL', () => {
		expect(nodeHost('https://beacon-era5.maris.nl')).toBe('beacon-era5.maris.nl');
		expect(nodeHost('https://beacon.maris.nl/beacon-api')).toBe('beacon.maris.nl');
	});

	it('keeps the port', () => {
		expect(nodeHost('http://localhost:5001')).toBe('localhost:5001');
	});

	it('returns the input when it does not parse', () => {
		expect(nodeHost('not a url')).toBe('not a url');
	});
});
```

Append to the `describe('admin-session', ...)` block of `src/lib/services/tests/admin-session.test.ts`:

```ts
	it('checks credentials without a session', async () => {
		const { session, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		await session.checkAdminCredentials('https://a.example.org', { username: 'alice', password: 'pw' });

		expect(check).toHaveBeenCalledOnce();
		expect(session.hasAdminSession('a')).toBe(false);
		expect(sessionStorage.getItem(STORAGE_KEY)).toBe('{}');
	});

	it('throws AdminAuthError from checkAdminCredentials on a 401', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockRejectedValue(
			new sdk.ApiError(401, 'unauthorized', 'https://a.example.org/api/admin/check')
		);

		await expect(
			session.checkAdminCredentials('https://a.example.org', { username: 'alice', password: 'bad' })
		).rejects.toBeInstanceOf(session.AdminAuthError);
	});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/services/tests/beacon-node-url.test.ts src/lib/services/tests/admin-session.test.ts`
Expected: FAIL. `nodeHost` and `checkAdminCredentials` are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/services/beacon-node-url.ts` (4-space indent):

```ts
/** The host of a node URL, for a short label. Returns the input when it does not parse. */
export function nodeHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
```

In `src/lib/services/admin-session.ts`, replace `makeAdminClient` and `signIn` with:

```ts
/** An SDK client with Basic auth. The bearer token of the node shares the header, so it stays out. */
export function makeAdminClient(
	node: Pick<BeaconNode, 'url'>,
	credentials: AdminCredentials
): BeaconClient {
	return new BeaconClient({
		url: normalizeUrl(node.url),
		username: credentials.username,
		password: credentials.password,
		timeoutMs: 0
	});
}

/** Checks the credentials with the node at this URL. Saves nothing. */
export async function checkAdminCredentials(
	url: string,
	credentials: AdminCredentials
): Promise<void> {
	const client = makeAdminClient({ url }, credentials);

	try {
		await client.admin.check();
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) throw new AdminAuthError();
		throw error;
	}
}

/** Checks the credentials with the node, and saves them on success. */
export async function signIn(node: BeaconNode, username: string, password: string): Promise<void> {
	await checkAdminCredentials(node.url, { username, password });

	sessions.update((value) => ({ ...value, [node.id]: { username, password } }));
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/services/tests/beacon-node-url.test.ts src/lib/services/tests/admin-session.test.ts src/lib/services/tests/admin-session-request.test.ts`
Expected: PASS, the old tests too.

---

### Task 2: `services/node-form.ts`

**Files:**
- Create: `src/lib/services/node-form.ts`
- Create: `src/lib/services/tests/node-form.test.ts`

**Interfaces:**
- Consumes: `addNode`, `updateNode`, `BeaconNodeInput` (`services/beacon-node.ts`); `signIn`, `checkAdminCredentials`, `adminErrorMessage`, `AdminCredentials` (`services/admin-session.ts`, Task 1).
- Produces:
  - `type NodeSaveResult = { node: BeaconNode; adminError: string | null }`
  - `hasAdminInput(admin: AdminCredentials | null): admin is AdminCredentials`
  - `saveNodeForm(values: BeaconNodeInput, admin: AdminCredentials | null, editingId?: string | null): Promise<NodeSaveResult | null>`
  - `testAdminInput(url: string, admin: AdminCredentials | null): Promise<string | null>`. `null` means valid, or no admin input.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/tests/node-form.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = { name: 'ERA5', url: 'https://beacon-era5.example.org', description: '', token: '' };

// The services read storage at load, so each test loads fresh copies.
async function load() {
	vi.resetModules();
	const form = await import('../node-form');
	const session = await import('../admin-session');
	const nodes = await import('../beacon-node');
	const sdk = await import('@maris-development/beacon-client');
	return { form, session, nodes, sdk };
}

function unauthorized(sdk: typeof import('@maris-development/beacon-client')) {
	return new sdk.ApiError(401, 'unauthorized', 'https://beacon-era5.example.org/api/admin/check');
}

describe('node-form', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it('sees admin input when either field holds text', async () => {
		const { form } = await load();

		expect(form.hasAdminInput(null)).toBe(false);
		expect(form.hasAdminInput({ username: '', password: '' })).toBe(false);
		expect(form.hasAdminInput({ username: 'admin', password: '' })).toBe(true);
		expect(form.hasAdminInput({ username: '', password: 'pw' })).toBe(true);
	});

	it('adds a node with no sign-in when the admin fields are empty', async () => {
		const { form, session, nodes, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(values, { username: '', password: '' });

		expect(result?.adminError).toBeNull();
		expect(nodes.getNodes().map((node) => node.name)).toEqual(['ERA5']);
		expect(check).not.toHaveBeenCalled();
		expect(session.hasAdminSession(result!.node.id)).toBe(false);
	});

	it('adds a node and signs in with good credentials', async () => {
		const { form, session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(values, { username: 'admin', password: 'pw' });

		expect(result?.adminError).toBeNull();
		expect(session.hasAdminSession(result!.node.id)).toBe(true);
	});

	it('keeps the node when the sign-in fails', async () => {
		const { form, session, nodes, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockRejectedValue(unauthorized(sdk));

		const result = await form.saveNodeForm(values, { username: 'admin', password: 'bad' });

		expect(result?.adminError).toBe(new session.AdminAuthError().message);
		expect(nodes.getNodes()).toHaveLength(1);
		expect(session.hasAdminSession(result!.node.id)).toBe(false);
	});

	it('signs in on the new URL after an edit that changes the URL', async () => {
		const { form, session, nodes, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
		const added = nodes.addNode(values);
		await session.signIn(added, 'admin', 'old');

		const result = await form.saveNodeForm(
			{ ...values, url: 'https://other.example.org' },
			{ username: 'admin', password: 'new' },
			added.id
		);

		expect(result?.node.url).toBe('https://other.example.org');
		expect(session.credentialsOf(added.id)).toEqual({ username: 'admin', password: 'new' });
	});

	it('returns null for an unknown id and signs in nowhere', async () => {
		const { form, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(values, { username: 'admin', password: 'pw' }, 'missing');

		expect(result).toBeNull();
		expect(check).not.toHaveBeenCalled();
	});

	it('tests admin input without a session', async () => {
		const { form, session, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check');

		expect(await form.testAdminInput(values.url, null)).toBeNull();
		expect(check).not.toHaveBeenCalled();

		check.mockRejectedValue(unauthorized(sdk));
		expect(await form.testAdminInput(values.url, { username: 'admin', password: 'bad' })).toBe(
			new session.AdminAuthError().message
		);
	});
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run src/lib/services/tests/node-form.test.ts`
Expected: FAIL. The module `../node-form` does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/services/node-form.ts`:

```ts
/**
 * The save of the add and edit form of a Beacon node.
 *
 * The form can hold admin credentials. They go to `admin-session.ts` only, never on the node record.
 */

import type { BeaconNode } from '@/beacon-api/types';
import {
	adminErrorMessage,
	checkAdminCredentials,
	signIn,
	type AdminCredentials
} from './admin-session';
import { addNode, updateNode, type BeaconNodeInput } from './beacon-node';

/** The saved node, and the error of the sign-in that followed, if any. */
export type NodeSaveResult = { node: BeaconNode; adminError: string | null };

/** True when the user typed into the admin fields. The form then needs both fields. */
export function hasAdminInput(admin: AdminCredentials | null): admin is AdminCredentials {
	return admin !== null && (admin.username !== '' || admin.password !== '');
}

/** Saves the node first, then signs in. A failed sign-in keeps the node. Null for an unknown id. */
export async function saveNodeForm(
	values: BeaconNodeInput,
	admin: AdminCredentials | null,
	editingId: string | null = null
): Promise<NodeSaveResult | null> {
	let node: BeaconNode | null;

	if (editingId) {
		node = updateNode(editingId, values);
	} else {
		node = addNode(values);
	}

	if (!node) return null;
	if (!hasAdminInput(admin)) return { node, adminError: null };

	try {
		await signIn(node, admin.username, admin.password);
		return { node, adminError: null };
	} catch (error) {
		return { node, adminError: adminErrorMessage(error) };
	}
}

/** Checks the admin fields against the URL. Null means valid, or no admin input. */
export async function testAdminInput(
	url: string,
	admin: AdminCredentials | null
): Promise<string | null> {
	if (!hasAdminInput(admin)) return null;

	try {
		await checkAdminCredentials(url, admin);
		return null;
	} catch (error) {
		return adminErrorMessage(error);
	}
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run src/lib/services/tests/node-form.test.ts`
Expected: PASS. If `addNode` fails on telemetry or storage in jsdom, read `src/lib/services/tests/beacon-node.test.ts` and copy its setup.

---

### Task 3: Admin badge, badge token, Modal subtitle

**Files:**
- Create: `src/lib/components/AdminBadge.svelte`
- Modify: `src/tailwind.css` (`:root`)
- Modify: `src/lib/components/modals/Modal.svelte` (prop and header)
- Modify: the four locale files (key `admin.badge`)

**Interfaces:**
- Produces: `<AdminBadge />`, no props.
- Produces: `Modal` prop `subtitle: string = ''`. An empty value shows nothing, so the other modals do not change.

- [ ] **Step 1: Add the token**

In `src/tailwind.css` `:root`, after `--highlight: #087cdf;`, add:

```css
  /* The beacon-datalake.org header gradient. */
  --admin-badge-background: linear-gradient(120deg,#08306b 0 3.3333333333%,#0c3976 3.3333333333% 6.6666666667%,#114381 6.6666666667% 10%,#154c8d 10% 13.3333333333%,#195598 13.3333333333% 16.6666666667%,#1e5fa3 16.6666666667% 20%,#2569ae 20% 23.3333333333%,#387ab6 23.3333333333% 26.6666666667%,#4c8abf 26.6666666667% 30%,#5f9ac8 30% 33.3333333333%,#73abd0 33.3333333333% 36.6666666667%,#86bbd9 36.6666666667% 40%,#99c3d8 40% 43.3333333333%,#aabdc8 43.3333333333% 46.6666666667%,#bbb8b8 46.6666666667% 50%,#cbb2a8 50% 53.3333333333%,#dcad98 53.3333333333% 56.6666666667%,#eda788 56.6666666667% 60%,#f19e7d 60% 63.3333333333%,#ec9273 63.3333333333% 66.6666666667%,#e7866a 66.6666666667% 70%,#e17a61 70% 73.3333333333%,#dc6e58 73.3333333333% 76.6666666667%,#d7624f 76.6666666667% 80%,#c75347 80% 83.3333333333%,#b4423f 83.3333333333% 86.6666666667%,#a03237 86.6666666667% 90%,#8d212f 90% 93.3333333333%,#7a1127 93.3333333333% 96.6666666667%,#67001f 96.6666666667% 100%);
```

- [ ] **Step 2: Create the badge**

Create `src/lib/components/AdminBadge.svelte`:

```svelte
<!-- Marks a Beacon node with an admin session. -->
<script lang="ts">
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { t } from '@/i18n';
</script>

<span class="admin-badge">
	<ShieldCheckIcon size={14} />
	{$t('admin.badge')}
</span>

<style lang="scss">
	.admin-badge {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.25rem;
		padding: 0.125rem 0.625rem;
		border-radius: 99px;
		background: var(--admin-badge-background);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 700;
		line-height: 1.4;
		// The middle of the gradient is light, so white text needs a shadow.
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
	}
</style>
```

- [ ] **Step 3: Add the subtitle to Modal**

In `src/lib/components/modals/Modal.svelte`, after `export let width: string = '500px';`, add:

```ts
	export let subtitle: string = '';
```

Replace `<h2>{title}</h2>` with:

```svelte
			<h2>{title}</h2>
			{#if subtitle}
				<p class="subtitle">{subtitle}</p>
			{/if}
```

Inside the `header { ... }` SCSS block, after `margin-bottom: 1rem;`, add:

```scss
				.subtitle {
					margin: 0.25rem 0 0;
					font-size: var(--font-size-sm);
					color: var(--muted-foreground);
					word-break: break-all;
				}
```

- [ ] **Step 4: Add the key**

In each locale file, in the `admin` object, add `"badge"` before `"signIn"`:

| Locale | Value |
|---|---|
| en | `"Admin"` |
| nl | `"Admin"` |
| it | `"Admin"` |
| es | `"Admin"` |

- [ ] **Step 5: Check**

Run: `npm run check`
Expected: no new errors.

---

### Task 4: Sign-in dialog

**Files:**
- Modify: `src/lib/components/modals/AdminSignInDialog.svelte`
- Modify: the four locale files (`admin.signIn`)

**Interfaces:**
- Consumes: `Modal` prop `subtitle` (Task 3).

- [ ] **Step 1: Change the locale keys**

In `admin.signIn` of each file: change `title`, and add `subtitle`, `usernamePlaceholder` and `help`.

| Key | en | nl | it | es |
|---|---|---|---|---|
| `title` | `Sign in as admin` | `Aanmelden als beheerder` | `Accedi come amministratore` | `Iniciar sesión como administrador` |
| `subtitle` | `{name} · {url}` | `{name} · {url}` | `{name} · {url}` | `{name} · {url}` |
| `usernamePlaceholder` | `beacon-admin` | `beacon-admin` | `beacon-admin` | `beacon-admin` |
| `help` | `Use BEACON_ADMIN_USERNAME and BEACON_ADMIN_PASSWORD of the node. {app} keeps the credentials for this browser tab only.` | `Gebruik BEACON_ADMIN_USERNAME en BEACON_ADMIN_PASSWORD van de node. {app} bewaart de gegevens alleen voor dit browsertabblad.` | `Usa BEACON_ADMIN_USERNAME e BEACON_ADMIN_PASSWORD del nodo. {app} conserva le credenziali solo per questa scheda del browser.` | `Usa BEACON_ADMIN_USERNAME y BEACON_ADMIN_PASSWORD del nodo. {app} guarda las credenciales solo para esta pestaña del navegador.` |

Keep the Dutch, Italian and Spanish words that the files already use for "admin", "node" and "sign in" if they differ. Read the nearby keys first.

- [ ] **Step 2: Change the markup**

In `AdminSignInDialog.svelte`, add the import:

```ts
	import LogInIcon from '@lucide/svelte/icons/log-in';
```

Replace the `<Modal ...>` opening tag with:

```svelte
		<Modal
			title={$t('admin.signIn.title')}
			subtitle={$t('admin.signIn.subtitle', {
				name: $signInRequest.node.name,
				url: $signInRequest.node.url
			})}
			onClose={() => answerSignIn(false)}
			width="440px"
		>
```

Delete `<p class="node-url">{$signInRequest.node.url}</p>` and the `.node-url` SCSS rule.

Give the username `Input` the placeholder:

```svelte
					<Input
						id="admin-username"
						autocomplete="username"
						placeholder={$t('admin.signIn.usernamePlaceholder')}
						bind:value={username}
						required
					/>
```

After the password field `div`, add:

```svelte
				<p class="help">{$t('admin.signIn.help')}</p>
```

Replace the submit button content with:

```svelte
				<Button type="submit" form="admin-sign-in" disabled={busy}>
					<LogInIcon />
					{#if busy}
						{$t('admin.signIn.busy')}
					{:else}
						{$t('admin.signIn.submit')}
					{/if}
				</Button>
```

Add the SCSS rule:

```scss
	.help {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
	}
```

- [ ] **Step 3: Check**

Run: `npm run check` and `npx eslint src/lib/components/modals/AdminSignInDialog.svelte src/lib/components/modals/Modal.svelte src/lib/components/AdminBadge.svelte`
Expected: no new errors.

---

### Task 5: Add-node modal

**Files:**
- Modify: `src/lib/components/modals/AddBeaconModal.svelte` (full rewrite of script and markup)
- Modify: the four locale files (`node.form`)

**Interfaces:**
- Consumes: `saveNodeForm`, `testAdminInput`, `hasAdminInput` (Task 2); `signedInNodeIds`, `signOut` (`admin-session.ts`).
- Produces: `onSave: (node: BeaconNode | null) => void`. A save passes the node. A delete passes `null`.

- [ ] **Step 1: Add the locale keys**

Add to `node.form` in each file:

| Key | en | nl | it | es |
|---|---|---|---|---|
| `intro` | `Connect {app} to a Beacon node.` | `Verbind {app} met een Beacon-node.` | `Collega {app} a un nodo Beacon.` | `Conecta {app} a un nodo Beacon.` |
| `namePlaceholder` | `My Beacon` | `Mijn Beacon` | `Il mio Beacon` | `Mi Beacon` |
| `urlPlaceholder` | `https://beacon.example.org` | `https://beacon.example.org` | `https://beacon.example.org` | `https://beacon.example.org` |
| `urlHint` | `The root URL of the node. {app} adds /api itself.` | `De basis-URL van de node. {app} voegt zelf /api toe.` | `L'URL radice del nodo. {app} aggiunge /api da solo.` | `La URL raíz del nodo. {app} añade /api por sí mismo.` |
| `tokenPlaceholder` | `Optional` | `Optioneel` | `Facoltativo` | `Opcional` |
| `tokenHint` | `{app} sends it as a bearer token on viewer requests.` | `{app} stuurt het als bearer-token mee bij kijkverzoeken.` | `{app} lo invia come bearer token nelle richieste di visualizzazione.` | `{app} lo envía como bearer token en las solicitudes de visualización.` |
| `adminTitle` | `Admin access (optional)` | `Beheerderstoegang (optioneel)` | `Accesso amministratore (facoltativo)` | `Acceso de administrador (opcional)` |
| `adminUsername` | `Admin username` | `Gebruikersnaam beheerder` | `Nome utente amministratore` | `Usuario administrador` |
| `adminPassword` | `Admin password` | `Wachtwoord beheerder` | `Password amministratore` | `Contraseña de administrador` |
| `adminSignedIn` | `Signed in as admin.` | `Aangemeld als beheerder.` | `Accesso effettuato come amministratore.` | `Sesión iniciada como administrador.` |
| `adminSignOut` | `Close admin session` | `Beheerderssessie sluiten` | `Chiudi sessione amministratore` | `Cerrar sesión de administrador` |
| `adminValid` | `The admin credentials are valid.` | `De beheerdersgegevens zijn geldig.` | `Le credenziali di amministratore sono valide.` | `Las credenciales de administrador son válidas.` |
| `adminFailed` | `The node "{name}" exists, but without admin access.` | `De node "{name}" bestaat, maar zonder beheerderstoegang.` | `Il nodo "{name}" esiste, ma senza accesso amministratore.` | `El nodo "{name}" existe, pero sin acceso de administrador.` |
| `submitAdd` | `Add node` | `Node toevoegen` | `Aggiungi nodo` | `Añadir nodo` |

Watch for ICU: a single `'` before a `{` starts a quote in ICU. The Italian `L'URL radice del nodo. {app}` has its `'` far from a `{`, so it is safe. Do not put `'` right before `{`.

- [ ] **Step 2: Rewrite the script**

Replace the whole `<script>` of `AddBeaconModal.svelte` with:

```svelte
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { onMount } from 'svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { removeNode } from '@/services/beacon-node';
	import { checkNode, testNode } from '@/services/beacon-node-connect';
	import { signedInNodeIds, signOut } from '@/services/admin-session';
	import { hasAdminInput, saveNodeForm, testAdminInput } from '@/services/node-form';
	import { settings } from '@/stores/settings';
	import Button from '$lib/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import { Utils } from '@/utils';
	import SaveIcon from '@lucide/svelte/icons/save';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { t, translate } from '@/i18n';

	/**
	 * The modal writes to the node service itself. `onSave` gets the saved node,
	 * or `null` after a delete. `node` switches the form to edit mode.
	 */
	export let onSave: (node: BeaconNode | null) => void;
	export let onClose: () => void;
	export let node: BeaconNode | null = null;
	/**
	 * The URL to put in the form of a new node. A share link names a node that the
	 * app does not have. The user then adds it, and needs no copy and paste.
	 * `node` wins over this, because an edit keeps the URL of the record.
	 */
	export let presetUrl: string | null = null;

	let name = '';
	let url = '';
	let description = '';
	let token = '';
	let adminUsername = '';
	let adminPassword = '';
	let input: boolean = false;
	let saving = false;

	$: signedIn = node !== null && $signedInNodeIds.has(node.id);
	$: showAdminFields = $settings.adminFeatures && !signedIn;
	$: adminInput = showAdminFields ? { username: adminUsername, password: adminPassword } : null;
	$: adminRequired = hasAdminInput(adminInput);

	onMount(() => {
		document.addEventListener('keydown', handleKeydown);

		if (node) {
			name = node.name;
			url = node.url;
			description = node.description ?? '';
			token = node.token ?? '';
		} else if (presetUrl) {
			url = presetUrl;

			// A name is required. Take the host, which the user can change.
			try {
				name = new URL(presetUrl).hostname;
			} catch {
				name = '';
			}
		}

		return () => document.removeEventListener('keydown', handleKeydown);
	});

	async function closeModal() {
		if (input) {
			const goAhead = await askConfirm({
				title: translate('node.form.closeTitle'),
				message: translate('node.form.closeMessage'),
				note: translate('node.form.closeNote'),
				confirmLabel: translate('common.close'),
				destructive: true
			});

			if (!goAhead) return;
		}

		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
			return;
		}

		input = true;
	}

	async function submitForm() {
		if (saving) return;
		saving = true;

		try {
			if (!(await testConnection())) return;

			const result = await saveNodeForm({ name, url, description, token }, adminInput, node?.id ?? null);
			if (!result) return;

			// The table shows this node right away. Without this, its status stays
			// "unknown" until the next sweep or page reload.
			void checkNode({ url, token });

			if (result.adminError) {
				addToast({
					key: 'node.form.adminFailed',
					values: { name: result.node.name },
					message: result.adminError,
					type: 'warning'
				});
			}

			onSave(result.node);
		} finally {
			saving = false;
		}
	}

	async function confirmRemove() {
		if (!node) return;

		const goAhead = await askConfirm({
			title: translate('node.delete.title'),
			message: translate('node.delete.message', { name: node.name }),
			note: translate('node.delete.note'),
			confirmLabel: translate('common.delete'),
			destructive: true
		});

		if (!goAhead) return;

		removeNode(node.id);

		addToast({
			key: 'node.toast.deleted',
			values: { name: node.name },
			type: 'info'
		});

		onSave(null);
	}

	type CheckConnectionState = 'untested' | 'testing' | 'valid' | 'invalid';

	let connectionCheckState: CheckConnectionState = 'untested';
	let adminCheckState: 'untested' | 'valid' | 'invalid' = 'untested';
	let adminError = '';

	async function testConnection() {
		if (connectionCheckState === 'testing') return false; // prevent multiple tests at once

		connectionCheckState = 'testing';

		await Utils.sleep(330);

		const couldConnect = await testNode({ url, token });

		if (couldConnect) {
			connectionCheckState = 'valid';
		} else {
			connectionCheckState = 'invalid';

			return false;
		}

		return true;
	}

	// The submit signs in itself, so only this button tests the admin fields.
	async function testAll() {
		adminCheckState = 'untested';
		adminError = '';

		if (!(await testConnection()) || !hasAdminInput(adminInput)) return;

		const error = await testAdminInput(url, adminInput);

		if (error) {
			adminCheckState = 'invalid';
			adminError = error;
		} else {
			adminCheckState = 'valid';
		}
	}

	function resetAdminCheck() {
		adminCheckState = 'untested';
		adminError = '';
	}
</script>
```

- [ ] **Step 3: Rewrite the markup and the styles**

Replace everything after `</script>` with:

```svelte
<Modal title={node ? $t('node.form.editTitle') : $t('node.form.addTitle')} onClose={closeModal}>
	<form id="node-form" on:submit|preventDefault={submitForm}>
		<p class="intro">{$t('node.form.intro')}</p>

		<div class="form-row">
			<Label for="name" class="required">{$t('common.name')}</Label>
			<Input id="name" placeholder={$t('node.form.namePlaceholder')} bind:value={name} required />
		</div>

		<div class="form-row">
			<Label for="url" class="required">{$t('node.field.url')}</Label>
			<Input
				type="url"
				id="url"
				placeholder={$t('node.form.urlPlaceholder')}
				bind:value={url}
				required
			/>
			<p class="hint">{$t('node.form.urlHint')}</p>
		</div>

		<div class="form-row">
			<Label for="description">{$t('node.field.description')}</Label>
			<textarea id="description" rows="3" bind:value={description}></textarea>
		</div>

		<div class="form-row">
			<Label for="token">{$t('node.field.token')}</Label>
			<Input id="token" placeholder={$t('node.form.tokenPlaceholder')} bind:value={token} />
			<p class="hint">{$t('node.form.tokenHint')}</p>
		</div>

		{#if $settings.adminFeatures}
			<fieldset class="admin-box">
				<legend><ShieldCheckIcon size={18} />{$t('node.form.adminTitle')}</legend>

				{#if signedIn && node}
					<div class="admin-session">
						<span>{$t('node.form.adminSignedIn')}</span>
						<Button type="button" variant="outline" onclick={() => node && signOut(node.id)}>
							<LogOutIcon />
							{$t('node.form.adminSignOut')}
						</Button>
					</div>
				{:else}
					<div class="admin-fields">
						<div class="form-row">
							<Label for="admin-username">{$t('node.form.adminUsername')}</Label>
							<Input
								id="admin-username"
								autocomplete="username"
								placeholder={$t('admin.signIn.usernamePlaceholder')}
								bind:value={adminUsername}
								oninput={resetAdminCheck}
								required={adminRequired}
							/>
						</div>
						<div class="form-row">
							<Label for="admin-password">{$t('node.form.adminPassword')}</Label>
							<Input
								id="admin-password"
								type="password"
								autocomplete="new-password"
								bind:value={adminPassword}
								oninput={resetAdminCheck}
								required={adminRequired}
							/>
						</div>
					</div>

					{#if adminCheckState === 'valid'}
						<p class="admin-result valid">{$t('node.form.adminValid')}</p>
					{:else if adminCheckState === 'invalid'}
						<p class="admin-result invalid" role="alert">{adminError}</p>
					{/if}
				{/if}
			</fieldset>
		{/if}
	</form>

	<div slot="footer" class="footer">
		<div class="buttons-left">
			<Button type="button" variant="outline" onclick={testAll}>
				{#if connectionCheckState === 'untested'}
					<span class="connection-{connectionCheckState}"><ActivityIcon /></span>
					{$t('node.connection.test')}
				{:else if connectionCheckState === 'valid'}
					<span class="connection-{connectionCheckState}"><CheckIcon /></span>
					{$t('node.connection.valid')}
				{:else if connectionCheckState === 'invalid'}
					<span class="connection-{connectionCheckState}"><TriangleAlertIcon /></span>
					{$t('node.connection.invalid')}
				{:else if connectionCheckState === 'testing'}
					<span class="connection-{connectionCheckState}"><LoaderCircle /></span>
					{$t('node.connection.testing')}
				{/if}
			</Button>

			{#if node}
				<Button type="button" variant="destructive" onclick={confirmRemove}>
					<Trash2Icon />
					{$t('common.delete')}
				</Button>
			{/if}
		</div>

		<div class="buttons-right">
			<Button type="button" variant="outline" onclick={closeModal}>
				{$t('common.cancel')}
			</Button>
			<Button type="submit" form="node-form" disabled={saving}>
				{#if node}
					<SaveIcon />
					{$t('common.save')}
				{:else}
					<PlusIcon />
					{$t('node.form.submitAdd')}
				{/if}
			</Button>
		</div>
	</div>
</Modal>

<style lang="scss">
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: left;

		:global(label.required)::after {
			content: '*';
			color: var(--destructive);
			margin-left: 0.25rem;
		}

		.form-row {
			display: flex;
			flex-direction: column;
			gap: 0.375rem;
		}

		textarea {
			padding: 0.5rem 0.75rem;
			border: 1px solid var(--input);
			border-radius: var(--radius);
			background: transparent;
			font-size: var(--font-size-sm);
			resize: vertical;
		}
	}

	.intro,
	.hint {
		margin: 0;
		color: var(--muted-foreground);
	}

	.hint {
		font-size: var(--font-size-sm);
	}

	.admin-box {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);

		legend {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0 0.25rem;
			font-weight: 600;
		}

		.admin-fields {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1rem;

			@media (max-width: 480px) {
				grid-template-columns: 1fr;
			}
		}

		.admin-session {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
		}

		.admin-result {
			margin: 0;
			font-size: var(--font-size-sm);

			&.valid {
				color: MediumSeaGreen;
			}

			&.invalid {
				color: var(--destructive);
			}
		}
	}

	.footer {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;

		.buttons-left,
		.buttons-right {
			display: flex;
			gap: 0.5rem;
		}
	}

	.connection-invalid {
		color: var(--destructive);
	}

	.connection-valid {
		color: MediumSeaGreen;
	}

	.connection-testing {
		display: inline-flex;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
```

Notes for the implementer:
- `Label` passes `class` to the `<label>` element. If it does not, check `src/lib/components/ui/label/label.svelte` and put the asterisk on a `<span class="required-mark">` in the label instead.
- If `--input` is not a defined token, use `--border` for the textarea border.
- Remove the old first line `<!-- src/lib/components/AddBeaconModal.svelte -->`. The path is wrong.

- [ ] **Step 4: Check and smoke-test**

Run: `npm run check` and `npx eslint src/lib/components/modals/AddBeaconModal.svelte src/lib/services/node-form.ts`
Expected: no new errors.

Run `npm run dev`. On `/beacon-nodes`, open "Add node":
1. Submit with an empty name. Expected: the browser blocks the submit.
2. Turn on "Show admin features". Fill the admin username only and submit. Expected: the browser asks for the password.
3. Fill a good URL and wrong admin credentials. Click "Test connection". Expected: "Connection valid", and the admin error under the box.
4. Click "Add node" with the wrong credentials. Expected: the modal closes, the node is in the list, and a warning toast names the node.
5. Edit that node. Expected: the empty admin fields, the Delete button, the title "Edit Beacon node".
6. Edit a node with a session. Expected: "Signed in as admin." and "Close admin session". No password shows.
7. Turn off "Show admin features". Expected: no admin box.

---

### Task 6: Node picker

**Files:**
- Modify: `src/lib/components/NodePicker.svelte` (full rewrite)
- Modify: the four locale files (`admin.nodePicker`)

**Interfaces:**
- Consumes: `AdminBadge` (Task 3), `nodeHost` (Task 1), `AddBeaconModal` with `onSave(node)` (Task 5), `askSignIn`, `signOut`, `signedInNodeIds` (`admin-session.ts`), `selectNode`, `nodes`, `currentNode` (`beacon-node.ts`).
- Keeps: the `actions` snippet prop. The pages need no change.

- [ ] **Step 1: Change the locale keys**

In `admin.nodePicker` of each file: remove `signedIn` and `signOut` (only `NodePicker.svelte` uses them). Change `group`. Add the other keys.

| Key | en | nl | it | es |
|---|---|---|---|---|
| `group` | `Beacon nodes` | `Beacon-nodes` | `Nodi Beacon` | `Nodos Beacon` |
| `hostLatency` | `{host} · {latency} ms` | `{host} · {latency} ms` | `{host} · {latency} ms` | `{host} · {latency} ms` |
| `signIn` | `Sign in as admin` | `Aanmelden als beheerder` | `Accedi come amministratore` | `Iniciar sesión como administrador` |
| `signInHint` | `Unlock the admin features of {name}` | `Ontgrendel de beheerfuncties van {name}` | `Sblocca le funzioni di amministrazione di {name}` | `Desbloquea las funciones de administración de {name}` |
| `closeSession` | `Close admin session` | `Beheerderssessie sluiten` | `Chiudi sessione amministratore` | `Cerrar sesión de administrador` |
| `closeSessionHint` | `Signed in as admin` | `Aangemeld als beheerder` | `Accesso effettuato come amministratore` | `Sesión iniciada como administrador` |
| `addNode` | `Add node` | `Node toevoegen` | `Aggiungi nodo` | `Añadir nodo` |
| `manageNodes` | `Manage nodes` | `Nodes beheren` | `Gestisci nodi` | `Gestionar nodos` |

After Step 2, run: `grep -rn "nodePicker.signedIn\|nodePicker.signOut" src`. Expected: no hits.

- [ ] **Step 2: Rewrite the component**

Replace `src/lib/components/NodePicker.svelte` with:

```svelte
<!--
	The picker of the global Beacon node, for pages that browse or manage one node.
	Query blocks keep their own node, so this picker does not change them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Label } from '@/components/ui/label';
	import AdminBadge from '@/components/AdminBadge.svelte';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import AddBeaconModal from '@/components/modals/AddBeaconModal.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { currentNode, nodes, selectNode } from '@/services/beacon-node';
	import { nodeHost } from '@/services/beacon-node-url';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { askSignIn, signedInNodeIds, signOut } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { t } from '@/i18n';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import LinkIcon from '@lucide/svelte/icons/link';

	let { actions }: { actions?: Snippet } = $props();

	let adding = $state(false);

	// `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const node of $nodes) void ensureFresh(node);
	});

	function isAdmin(id: string): boolean {
		return $settings.adminFeatures && $signedInNodeIds.has(id);
	}

	let currentIsAdmin = $derived($currentNode !== null && isAdmin($currentNode.id));

	function onAdded(node: BeaconNode | null) {
		adding = false;
		if (node) selectNode(node.id);
	}
</script>

<div class="node-picker">
	<Label size="sm" for="beacon-node-select">{$t('admin.nodePicker.label')}</Label>

	<div class="picker-row">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger id="beacon-node-select" class="node-trigger">
				{#if $currentNode}
					<BeaconNodeStatus health={$currentNode} variant="dot" />
					<span class="node-text">
						<span class="node-name">{$currentNode.name}</span>
						<span class="node-host">
							{#if $currentNode.latencyMs === null}
								{nodeHost($currentNode.url)}
							{:else}
								{$t('admin.nodePicker.hostLatency', {
									host: nodeHost($currentNode.url),
									latency: $currentNode.latencyMs
								})}
							{/if}
						</span>
					</span>
					{#if currentIsAdmin}
						<AdminBadge />
					{/if}
				{:else}
					<span class="node-text placeholder">{$t('admin.nodePicker.placeholder')}</span>
				{/if}
				<ChevronsUpDownIcon size={16} class="chevron" />
			</DropdownMenu.Trigger>

			<DropdownMenu.Content align="start" class="node-menu">
				<DropdownMenu.Group>
					<DropdownMenu.GroupHeading class="node-menu-heading">
						{$t('admin.nodePicker.group')}
					</DropdownMenu.GroupHeading>
					{#each $nodes as node (node.id)}
						<DropdownMenu.Item class="node-item" onSelect={() => selectNode(node.id)}>
							<BeaconNodeStatus health={node} variant="dot" />
							<span class="node-text">
								<span class="node-name">{node.name}</span>
								<span class="node-host">{nodeHost(node.url)}</span>
							</span>
							{#if isAdmin(node.id)}
								<AdminBadge />
							{/if}
							<span class="check">
								{#if node.id === $currentNode?.id}
									<CheckIcon />
								{/if}
							</span>
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Group>

				<DropdownMenu.Separator />

				{#if $settings.adminFeatures && $currentNode}
					{@const current = $currentNode}
					{#if currentIsAdmin}
						<DropdownMenu.Item class="action-item" onSelect={() => signOut(current.id)}>
							<LogOutIcon />
							<span class="node-text">
								<span>{$t('admin.nodePicker.closeSession')}</span>
								<span class="node-host">{$t('admin.nodePicker.closeSessionHint')}</span>
							</span>
						</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item class="action-item" onSelect={() => void askSignIn(current)}>
							<KeyRoundIcon />
							<span class="node-text">
								<span>{$t('admin.nodePicker.signIn')}</span>
								<span class="node-host">
									{$t('admin.nodePicker.signInHint', { name: current.name })}
								</span>
							</span>
						</DropdownMenu.Item>
					{/if}
				{/if}

				<DropdownMenu.Item class="action-item" onSelect={() => (adding = true)}>
					<PlusIcon />
					{$t('admin.nodePicker.addNode')}
				</DropdownMenu.Item>
				<DropdownMenu.Item class="action-item" onSelect={() => goto(resolve('/beacon-nodes'))}>
					<LinkIcon />
					{$t('admin.nodePicker.manageNodes')}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</div>
</div>

<!-- A sibling of the menu: the menu closes on select, and a modal box is transformed. -->
{#if adding}
	<AddBeaconModal onSave={onAdded} onClose={() => (adding = false)} />
{/if}

<style lang="scss">
	.node-picker {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	.picker-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-left: auto;
	}

	.picker-row :global(.node-trigger) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(26rem, 100%);
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--background);
		text-align: left;
		cursor: pointer;

		&:focus-visible,
		&[data-state='open'] {
			border-color: var(--primary);
			outline: none;
		}

		:global(.chevron) {
			flex: 0 0 auto;
			color: var(--muted-foreground);
		}
	}

	.node-text {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		min-width: 0;

		&.placeholder {
			color: var(--muted-foreground);
		}
	}

	.node-name {
		font-weight: 600;
	}

	.node-name,
	.node-host {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-host {
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
	}

	// The menu renders in a portal, so these rules are global.
	:global(.node-menu) {
		min-width: var(--bits-dropdown-menu-anchor-width);
		padding: 0.5rem;
	}

	:global(.node-menu-heading) {
		padding: 0.5rem 0.5rem 0.25rem;
		font-size: var(--font-size-xs);
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	:global(.node-menu .node-item),
	:global(.node-menu .action-item) {
		gap: 0.75rem;
		padding: 0.5rem;
	}

	.check {
		display: inline-flex;
		flex: 0 0 auto;
		width: 1rem;
	}
</style>
```

Notes for the implementer:
- bits-ui 2 `DropdownMenu.Item` has `onSelect`. If the type check rejects it, use `onclick`, as `VisualiseDataButton.svelte` does.
- `--bits-dropdown-menu-anchor-width` is a bits-ui CSS variable on the content. If the menu does not take the trigger width, read the bits-ui docs for the variable name.
- The `Label` `for` points at the trigger button. Keep it, so a click on the label focuses the trigger.

- [ ] **Step 3: Check and smoke-test**

Run: `npm run check` and `npx eslint src/lib/components/NodePicker.svelte`
Expected: no new errors.

Run `npm run dev`. Open `/system-info`:
1. Expected trigger: dot, name, "host · N ms", chevron. No badge.
2. Open the menu with the keyboard (Tab to the trigger, Enter). Arrow keys move through the rows. Enter on a node selects it, and the check mark moves.
3. With "Show admin features" on: "Sign in as admin" shows the node name. Select it. Expected: the dialog "Sign in as admin" with "name · url" under the title. Sign in. Expected: the Admin badge on the trigger and on the row, and the row "Close admin session". Select it. Expected: the badge goes away.
4. "Add node" opens the modal. Add a node. Expected: the picker selects the new node.
5. "Manage nodes" opens `/beacon-nodes`.
6. Turn off "Show admin features". Expected: no badge and no sign-in row, also with a session.
7. Stop a node, or add a node with a URL that does not answer. Expected: the trigger shows the host only, no "null ms".
8. Delete all nodes on `/beacon-nodes`, then open `/system-info`. Expected: the placeholder, and the menu shows only "Add node" and "Manage nodes".
9. Open `/sql-editor`, `/data-browser/data-tables`, `/data-browser/datasets`, `/data-browser/crawlers`. Expected: the picker works, and the page actions stay on the right of the picker.

---

### Task 7: Docs and full check

**Files:**
- Modify: `docs/superpowers/admin-mode-roadmap.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the roadmap**

In `docs/superpowers/admin-mode-roadmap.md`, section "Sign-in":
- Replace `Studio asks for a sign-in only when the user starts an admin action. The dialog title is "Sign in to Beacon node <name>".` with: `Studio asks for a sign-in when the user starts an admin action, or picks "Sign in as admin" in the node picker. The dialog title is "Sign in as admin", with "<name> · <url>" under it.`
- Replace `"Signed in" and a "Sign out" link show under the node picker. No username shows. The sidebar shows no sign-in state.` with: `The node picker shows an "Admin" badge on each node with a session, and a "Close admin session" action. No username shows. The sidebar shows no sign-in state. Plan: [node picker](plans/2026-10-16-node-picker-admin.md).`
- Replace `Every admin call goes through withAdmin(node, fn) in services/admin-session.ts. No page or modal asks for credentials itself.` with: `Every admin call goes through withAdmin(node, fn) in services/admin-session.ts.`

- [ ] **Step 2: Update AGENTS.md**

In the `admin-session.ts` line under "Shared state", delete the sentence `Never ask for admin credentials in a page or a modal.` (user decision 2026-10-16).

- [ ] **Step 3: Run the full checks**

Run: `npm test`
Expected: PASS, with the new tests of Tasks 1 and 2.

Run: `npm run check`
Expected: 0 errors.

Run: `npm run lint`
Expected: no new errors in the touched files. Compare with `git stash; npm run lint; git stash pop` if the count is unclear.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Report**

Tell the user what passed, what failed, and which smoke tests ran. Do not commit.
