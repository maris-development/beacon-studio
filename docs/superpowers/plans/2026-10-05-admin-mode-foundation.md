# Admin Mode Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Show admin features" setting, a lazy admin sign-in for each Beacon node, admin-only menu items, and one shared node picker.

**Architecture:** A plain TypeScript service (`services/admin-session.ts`) owns the admin credentials for each node in `sessionStorage`. It builds SDK clients with Basic auth, and asks one global dialog for a sign-in through a store, the same pattern as `stores/confirm.ts`. Pages call `withAdmin(node, fn)` for every admin action. `AdminAction` greys out an in-page control while the setting is off.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, SCSS, `@maris-development/beacon-client` 2.0.0, Vitest 3 with jsdom (new).

**Spec:** `docs/superpowers/specs/2026-10-05-admin-mode-foundation-design.md`

## Global Constraints

- Do not run `git commit` unless the user writes "commit" as an instruction. Never create a branch.
- Formatting: the repo uses Prettier with tabs. Run `npx prettier --write <file>` on each changed file.
- Styles: SCSS only (`<style lang="scss">`). No plain CSS, no new Tailwind classes.
- Comments: one short line, only for logic that is not clear. ASD-STE100. No `-ing` verbs, no em-dashes.
- Branching: prefer `if`/`else` over `?:` in script code. `??` and `?.` are fine.
- Layer rule: `src/lib/services/*` and `src/lib/stores/*` never import from `src/lib/components/*`.
- The admin client sends Basic auth only. It never sends the node bearer `token`.
- The admin client uses the default API prefix (`/api`), not `/admin`.
- Setting key `adminFeatures`, label "Show admin features", group `System`, default `false`.
- `sessionStorage` key: `beacon-studio.admin-sessions`.
- Off hint text: `Turn on "Show admin features" in Settings`.
- Dialog title: `Sign in to Beacon node <name>`. Auth error text: `Wrong username or password.`
- Session line under the node picker: `Signed in` plus a `Sign out` link. No username.

## Review Focus

- `sessionStorage` blocked or holding bad JSON (private mode, manual edit): the app must start, with no sessions, and must not throw. Test in Task 2.
- Two admin actions on one node start at the same time with no session: one dialog only, and both actions continue after one sign-in. Test in Task 3.
- A sign-in request for node B while the dialog for node A is open: request A ends as cancelled, and the dialog shows node B. Test in Task 3.
- A 401 on the retry after a second sign-in: no third dialog, the error goes to the caller. Test in Task 3.
- The user turns the setting off while signed in: the session line hides, and admin buttons grey out. The session stays until sign-out or tab close. Manual check in Task 8.

---

### Task 1: Test runner and the "Show admin features" setting

**Files:**
- Modify: `package.json` (devDependencies, scripts)
- Modify: `vite.config.ts`
- Modify: `src/lib/stores/settings.ts` (interface around line 30-50, `DEFAULT_SETTINGS` around line 60-80, `SETTING_DEFINITIONS` after the `systemInfoUpdateIntervalMs` entry)
- Test: `src/lib/stores/settings.test.ts`

**Interfaces:**
- Produces: `BeaconStudioSettings.adminFeatures: boolean`. Read with `$settings.adminFeatures` or `getSettings().adminFeatures`.
- Produces: `npm test` runs Vitest once over `src/**/*.test.ts`.

- [ ] **Step 1: Install Vitest and jsdom**

Run: `npm install -D vitest@^3 jsdom`
Expected: both packages appear in `devDependencies`.

- [ ] **Step 2: Add the test script**

In `package.json` `scripts`, add after `"lint"`:

```json
		"test": "vitest run",
```

- [ ] **Step 3: Add the test config**

In `vite.config.ts`, change the import of `defineConfig`:

```ts
import { defineConfig } from 'vitest/config';
```

Add this key to the object in `defineConfig({...})`, after `css`:

```ts
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts']
	}
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/stores/settings.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { SETTING_DEFINITIONS, getSettings, setSetting } from './settings';

describe('adminFeatures setting', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('is off by default', () => {
		expect(getSettings().adminFeatures).toBe(false);
	});

	it('stores a new value', () => {
		setSetting('adminFeatures', true);
		expect(getSettings().adminFeatures).toBe(true);
		setSetting('adminFeatures', false);
	});

	it('has a definition in the System group', () => {
		const definition = SETTING_DEFINITIONS.find((d) => d.key === 'adminFeatures');
		expect(definition).toMatchObject({
			group: 'System',
			type: 'boolean',
			label: 'Show admin features'
		});
	});
});
```

- [ ] **Step 5: Run the test to see it fail**

Run: `npm test -- src/lib/stores/settings.test.ts`
Expected: FAIL. TypeScript accepts the file, but `getSettings().adminFeatures` is `undefined`, and no definition exists.
If the run fails with an import error on `$app/...` or `__TELEMETRY__`, the `test` key is not in the same config as the `sveltekit()` plugin and `define`. Fix Step 3 first.

- [ ] **Step 6: Add the setting**

In `src/lib/stores/settings.ts`, add to the `BeaconStudioSettings` interface, after `systemInfoUpdateIntervalMs: number;`:

```ts
	/** Shows the admin features of a Beacon node. */
	adminFeatures: boolean;
```

Add to `DEFAULT_SETTINGS`, after `systemInfoUpdateIntervalMs: 1000,`:

```ts
	adminFeatures: false,
```

Add to `SETTING_DEFINITIONS`, after the `systemInfoUpdateIntervalMs` entry:

```ts
	{
		key: 'adminFeatures',
		group: 'System',
		type: 'boolean',
		label: 'Show admin features',
		description:
			'Shows the admin pages and the admin actions, for example dataset upload. An admin action asks for the admin username and password of the Beacon node.'
	},
```

- [ ] **Step 7: Run the test to see it pass**

Run: `npm test -- src/lib/stores/settings.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors in the changed files.

---

### Task 2: Admin sessions for each node

**Files:**
- Create: `src/lib/services/admin-session.ts`
- Test: `src/lib/services/admin-session.test.ts`

**Interfaces:**
- Consumes: `BeaconClient`, `ApiError`, `ConnectionError` from `@maris-development/beacon-client`. `normalizeUrl` from `./beacon-node-url`. `BeaconNode` from `@/beacon-api/types`.
- Produces:
  - `type AdminCredentials = { username: string; password: string }`
  - `class AdminAuthError extends Error`
  - `makeAdminClient(node: BeaconNode, credentials: AdminCredentials): BeaconClient`
  - `signedInNodeIds: Readable<Set<string>>`
  - `hasAdminSession(nodeId: string): boolean`
  - `credentialsOf(nodeId: string): AdminCredentials | null`
  - `signIn(node: BeaconNode, username: string, password: string): Promise<void>`
  - `signOut(nodeId: string): void`
  - `adminErrorMessage(error: unknown): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/admin-session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeaconNode } from '@/beacon-api/types';

const STORAGE_KEY = 'beacon-studio.admin-sessions';

function node(id: string, url = `https://${id}.example.org`): BeaconNode {
	return { id, name: id, url, status: 'online', latencyMs: 1, lastCheckedAt: null };
}

// The module reads sessionStorage at load, so each test loads a fresh copy.
// The SDK loads after the reset too, so `instanceof` sees the same classes as the module.
async function load() {
	vi.resetModules();
	const session = await import('./admin-session');
	const sdk = await import('@maris-development/beacon-client');
	return { session, sdk };
}

describe('admin-session', () => {
	beforeEach(() => {
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it('signs in after a good check, for that node only', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		await session.signIn(node('a'), 'alice', 'pw');

		expect(session.hasAdminSession('a')).toBe(true);
		expect(session.hasAdminSession('b')).toBe(false);
		expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
			a: { username: 'alice', password: 'pw' }
		});
	});

	it('throws AdminAuthError on a 401 and saves nothing', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockRejectedValue(
			new sdk.ApiError(401, 'unauthorized', 'https://a.example.org/api/admin/check')
		);

		await expect(session.signIn(node('a'), 'alice', 'bad')).rejects.toBeInstanceOf(
			session.AdminAuthError
		);
		expect(session.hasAdminSession('a')).toBe(false);
	});

	it('passes other errors through', async () => {
		const { session, sdk } = await load();
		const error = new sdk.ApiError(500, 'boom', 'https://a.example.org/api/admin/check');
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockRejectedValue(error);

		await expect(session.signIn(node('a'), 'alice', 'pw')).rejects.toBe(error);
	});

	it('signs out one node', async () => {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ a: { username: 'u', password: 'p' }, b: { username: 'u', password: 'p' } })
		);
		const { session } = await load();

		session.signOut('a');

		expect(session.hasAdminSession('a')).toBe(false);
		expect(session.hasAdminSession('b')).toBe(true);
	});

	it('starts empty when the stored value is not JSON', async () => {
		sessionStorage.setItem(STORAGE_KEY, '{not json');
		const { session } = await load();

		expect(session.hasAdminSession('a')).toBe(false);
	});

	it('starts empty when sessionStorage throws', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		await session.signIn(node('a'), 'alice', 'pw');

		expect(session.hasAdminSession('a')).toBe(true);
	});

	it('builds a Basic auth client with no bearer token', async () => {
		const { session } = await load();
		const client = session.makeAdminClient(
			{ ...node('a', 'https://A.example.org/'), token: 'secret' },
			{ username: 'alice', password: 'pw' }
		);

		expect(client.authenticated).toBe(true);
	});

	it('gives a readable message for each error kind', async () => {
		const { session, sdk } = await load();

		expect(session.adminErrorMessage(new sdk.ApiError(403, 'no', 'u'))).toBe(
			'You have no permission for this action on this Beacon node.'
		);
		expect(session.adminErrorMessage(new sdk.ApiError(409, 'File exists', 'u'))).toBe(
			'File exists'
		);
		expect(session.adminErrorMessage(new sdk.ConnectionError('u', null))).toBe(
			'The Beacon node cannot be reached.'
		);
		expect(session.adminErrorMessage(new Error('x'))).toBe('x');
	});
});
```

`check` lives on `AdminClient.prototype`. `client.admin` is an instance field, so a spy on `BeaconClient` does not reach it.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/services/admin-session.test.ts`
Expected: FAIL with "Failed to load url ./admin-session" or a similar missing-module error.

- [ ] **Step 3: Write the service**

Create `src/lib/services/admin-session.ts`:

```ts
/**
 * The admin sign-in of each Beacon node.
 *
 * A session holds the Basic auth credentials of one node. The app keeps them in
 * `sessionStorage`, so they go away when the tab closes. A session on one node
 * gives no rights on another node.
 */

import { derived, get, writable, type Readable } from 'svelte/store';
import { ApiError, BeaconClient, ConnectionError } from '@maris-development/beacon-client';
import type { BeaconNode } from '@/beacon-api/types';
import { normalizeUrl } from './beacon-node-url';

export type AdminCredentials = { username: string; password: string };

type Sessions = Record<string, AdminCredentials>;

const STORAGE_KEY = 'beacon-studio.admin-sessions';

/** The credentials were wrong. The dialog shows this, and stays open. */
export class AdminAuthError extends Error {
	constructor() {
		super('Wrong username or password.');
		this.name = 'AdminAuthError';
	}
}

function readStorage(): Sessions {
	try {
		const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		if (!raw) return {};

		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed as Sessions;
	} catch {
		// Blocked storage or bad JSON: start with no sessions.
	}

	return {};
}

function writeStorage(value: Sessions): void {
	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		// The session then lives in memory only.
	}
}

const sessions = writable<Sessions>(readStorage());
sessions.subscribe(writeStorage);

/** The ids of the nodes with a session. The password never leaves this module through it. */
export const signedInNodeIds: Readable<Set<string>> = derived(
	sessions,
	(value) => new Set(Object.keys(value))
);

export function hasAdminSession(nodeId: string): boolean {
	return nodeId in get(sessions);
}

/** Read by `requireAdminClient` only. */
export function credentialsOf(nodeId: string): AdminCredentials | null {
	return get(sessions)[nodeId] ?? null;
}

/** An SDK client with Basic auth. The bearer token of the node shares the header, so it stays out. */
export function makeAdminClient(node: BeaconNode, credentials: AdminCredentials): BeaconClient {
	return new BeaconClient({
		url: normalizeUrl(node.url),
		username: credentials.username,
		password: credentials.password,
		timeoutMs: 0
	});
}

/** Checks the credentials with the node, and saves them on success. */
export async function signIn(node: BeaconNode, username: string, password: string): Promise<void> {
	const client = makeAdminClient(node, { username, password });

	try {
		await client.admin.check();
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) throw new AdminAuthError();
		throw error;
	}

	sessions.update((value) => ({ ...value, [node.id]: { username, password } }));
}

export function signOut(nodeId: string): void {
	sessions.update((value) => {
		if (!(nodeId in value)) return value;

		const next = { ...value };
		delete next[nodeId];
		return next;
	});
}

/** A message for a toast after a failed admin action. */
export function adminErrorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.status === 403) return 'You have no permission for this action on this Beacon node.';
		return error.body || `The Beacon node answered with status ${error.status}.`;
	}

	if (error instanceof ConnectionError) return 'The Beacon node cannot be reached.';
	if (error instanceof Error) return error.message;

	return String(error);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -- src/lib/services/admin-session.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

---

### Task 3: Sign-in request, `requireAdminClient` and `withAdmin`

**Files:**
- Modify: `src/lib/services/admin-session.ts` (append)
- Test: `src/lib/services/admin-session-request.test.ts`

**Interfaces:**
- Consumes: `credentialsOf`, `makeAdminClient`, `signOut` from Task 2.
- Produces:
  - `interface SignInRequest { node: BeaconNode; settle: (signedIn: boolean) => void }`
  - `signInRequest: Readable<SignInRequest | null>`
  - `askSignIn(node: BeaconNode): Promise<boolean>`
  - `answerSignIn(signedIn: boolean): void`
  - `requireAdminClient(node: BeaconNode): Promise<BeaconClient | null>`
  - `withAdmin<T>(node: BeaconNode, fn: (client: BeaconClient) => Promise<T>): Promise<T | null>`. `null` means the user cancelled the sign-in.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/admin-session-request.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { BeaconNode } from '@/beacon-api/types';

function node(id: string): BeaconNode {
	return {
		id,
		name: id,
		url: `https://${id}.example.org`,
		status: 'online',
		latencyMs: 1,
		lastCheckedAt: null
	};
}

type Session = typeof import('./admin-session');
type Sdk = typeof import('@maris-development/beacon-client');

let sdk: Sdk;

// A fresh module per test, and the SDK of the same load, so `instanceof` matches.
async function load(): Promise<Session> {
	vi.resetModules();
	const session = await import('./admin-session');
	sdk = await import('@maris-development/beacon-client');
	vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
	return session;
}

// Answers the open dialog like a user who types good credentials.
async function signInFromDialog(session: Session) {
	await vi.waitFor(() => expect(get(session.signInRequest)).not.toBeNull());
	const request = get(session.signInRequest)!;
	await session.signIn(request.node, 'alice', 'pw');
	session.answerSignIn(true);
}

const unauthorized = () => new sdk.ApiError(401, 'unauthorized', 'u');

describe('withAdmin', () => {
	beforeEach(() => {
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	it('runs at once with a session', async () => {
		const session = await load();
		await session.signIn(node('a'), 'alice', 'pw');
		const fn = vi.fn().mockResolvedValue('done');

		await expect(session.withAdmin(node('a'), fn)).resolves.toBe('done');
		expect(get(session.signInRequest)).toBeNull();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('asks for a sign-in, then runs', async () => {
		const session = await load();
		const fn = vi.fn().mockResolvedValue('done');

		const result = session.withAdmin(node('a'), fn);
		await signInFromDialog(session);

		await expect(result).resolves.toBe('done');
		expect(get(session.signInRequest)).toBeNull();
	});

	it('returns null on cancel and does not run fn', async () => {
		const session = await load();
		const fn = vi.fn();

		const result = session.withAdmin(node('a'), fn);
		await vi.waitFor(() => expect(get(session.signInRequest)).not.toBeNull());
		session.answerSignIn(false);

		await expect(result).resolves.toBeNull();
		expect(fn).not.toHaveBeenCalled();
	});

	it('signs out on a 401, asks again, and retries one time', async () => {
		const session = await load();
		await session.signIn(node('a'), 'old', 'old');
		const fn = vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce('done');

		const result = session.withAdmin(node('a'), fn);
		await signInFromDialog(session);

		await expect(result).resolves.toBe('done');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('gives a second 401 to the caller, with no third dialog', async () => {
		const session = await load();
		await session.signIn(node('a'), 'old', 'old');
		const fn = vi.fn().mockRejectedValue(unauthorized());

		const result = session.withAdmin(node('a'), fn);
		await signInFromDialog(session);

		await expect(result).rejects.toBeInstanceOf(sdk.ApiError);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(get(session.signInRequest)).toBeNull();
	});

	it('passes a non-401 error through and keeps the session', async () => {
		const session = await load();
		await session.signIn(node('a'), 'alice', 'pw');
		const error = new sdk.ApiError(403, 'forbidden', 'u');

		await expect(session.withAdmin(node('a'), () => Promise.reject(error))).rejects.toBe(error);
		expect(session.hasAdminSession('a')).toBe(true);
	});

	it('opens one dialog for two actions on one node', async () => {
		const session = await load();
		const requests: unknown[] = [];
		session.signInRequest.subscribe((r) => {
			if (r) requests.push(r);
		});

		const first = session.withAdmin(node('a'), async () => 1);
		const second = session.withAdmin(node('a'), async () => 2);
		await signInFromDialog(session);

		await expect(first).resolves.toBe(1);
		await expect(second).resolves.toBe(2);
		expect(requests).toHaveLength(1);
	});

	it('cancels the open request when another node asks', async () => {
		const session = await load();

		const forA = session.askSignIn(node('a'));
		const forB = session.askSignIn(node('b'));

		await expect(forA).resolves.toBe(false);
		expect(get(session.signInRequest)?.node.id).toBe('b');

		session.answerSignIn(false);
		await expect(forB).resolves.toBe(false);
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/services/admin-session-request.test.ts`
Expected: FAIL. `session.withAdmin is not a function`.

- [ ] **Step 3: Add the request flow**

Append to `src/lib/services/admin-session.ts`, and add `readonly` to the `svelte/store` import:

```ts
/** One open sign-in question. `AdminSignInDialog` renders it. */
export interface SignInRequest {
	node: BeaconNode;
	settle: (signedIn: boolean) => void;
}

const request = writable<SignInRequest | null>(null);

export const signInRequest: Readable<SignInRequest | null> = readonly(request);

// Two actions on one node share one question.
const pending = new Map<string, Promise<boolean>>();

/**
 * Asks the dialog for a sign-in on this node. Resolves true after a sign-in.
 * A question for another node replaces this one, which then resolves false.
 */
export function askSignIn(node: BeaconNode): Promise<boolean> {
	const open = pending.get(node.id);
	if (open) return open;

	const promise = new Promise<boolean>((resolve) => {
		request.update((previous) => {
			previous?.settle(false);
			return { node, settle: resolve };
		});
	}).finally(() => pending.delete(node.id));

	pending.set(node.id, promise);
	return promise;
}

/** Closes the dialog. `AdminSignInDialog` calls this. */
export function answerSignIn(signedIn: boolean): void {
	request.update((open) => {
		open?.settle(signedIn);
		return null;
	});
}

/** An admin client for this node. Asks for a sign-in first if needed. Null on cancel. */
export async function requireAdminClient(node: BeaconNode): Promise<BeaconClient | null> {
	let credentials = credentialsOf(node.id);

	if (!credentials) {
		if (!(await askSignIn(node))) return null;
		credentials = credentialsOf(node.id);
	}

	if (!credentials) return null;

	return makeAdminClient(node, credentials);
}

/**
 * Runs one admin action. A 401 removes the session, asks again and runs the
 * action one more time. Null means the user cancelled the sign-in.
 */
export async function withAdmin<T>(
	node: BeaconNode,
	fn: (client: BeaconClient) => Promise<T>
): Promise<T | null> {
	const client = await requireAdminClient(node);
	if (!client) return null;

	try {
		return await fn(client);
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 401) throw error;
	}

	signOut(node.id);

	const retry = await requireAdminClient(node);
	if (!retry) return null;

	return fn(retry);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS for all test files.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

---

### Task 4: Remove the session when a node goes away or moves

**Files:**
- Modify: `src/lib/services/beacon-node.ts` (`updateNode` around line 216, `removeNode` around line 248, imports at the top)
- Test: `src/lib/services/beacon-node.test.ts`

**Interfaces:**
- Consumes: `signOut(nodeId: string): void` from Task 2.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/services/beacon-node.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/utils', () => ({ Utils: { randomUUID: () => crypto.randomUUID() } }));
vi.mock('./admin-session', () => ({ signOut: vi.fn() }));

async function load() {
	vi.resetModules();
	const service = await import('./beacon-node');
	const session = await import('./admin-session');
	return { service, signOut: vi.mocked(session.signOut) };
}

describe('beacon-node admin sessions', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('signs out a removed node', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.removeNode(added.id);

		expect(signOut).toHaveBeenCalledWith(added.id);
	});

	it('signs out a node with a new URL', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.updateNode(added.id, { url: 'https://b.example.org' });

		expect(signOut).toHaveBeenCalledWith(added.id);
	});

	it('keeps the session when only the name changes', async () => {
		const { service, signOut } = await load();
		const added = service.addNode({ name: 'A', url: 'https://a.example.org' });

		service.updateNode(added.id, { name: 'B' });

		expect(signOut).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -- src/lib/services/beacon-node.test.ts`
Expected: FAIL. The first two tests report `signOut` was not called.

- [ ] **Step 3: Call `signOut`**

In `src/lib/services/beacon-node.ts`, add after the import of `./beacon-node-url`:

```ts
import { signOut } from './admin-session';
```

In `updateNode`, after the `track('node.update', ...)` call:

```ts
	// A session belongs to the server at the old URL.
	if (updated.url !== previous.url) signOut(id);
```

In `removeNode`, after `listStore.update(...)`:

```ts
	signOut(id);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: PASS for all test files.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

---

### Task 5: The sign-in dialog

**Files:**
- Create: `src/lib/components/modals/AdminSignInDialog.svelte`
- Modify: `src/routes/+layout.svelte` (import, and markup before `<Confirm />`)

**Interfaces:**
- Consumes: `signInRequest`, `answerSignIn`, `signIn`, `AdminAuthError`, `adminErrorMessage` from Tasks 2 and 3.

No unit test. The repo has no component test setup. Task 8 tests the dialog by hand.

- [ ] **Step 1: Create the dialog**

Create `src/lib/components/modals/AdminSignInDialog.svelte`:

```svelte
<script lang="ts">
	/**
	 * The one dialog that answers `askSignIn`. The layout holds a single instance.
	 */
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import {
		AdminAuthError,
		adminErrorMessage,
		answerSignIn,
		signIn,
		signInRequest
	} from '@/services/admin-session';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	// A new request starts with an empty form.
	$effect(() => {
		if (!$signInRequest) return;

		username = '';
		password = '';
		error = '';
		busy = false;
	});

	// Escape closes this dialog only, not the modal that started the action.
	$effect(() => {
		if (!$signInRequest) return;

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;

			event.preventDefault();
			event.stopImmediatePropagation();
			answerSignIn(false);
		};

		document.addEventListener('keydown', onKeydown, true);

		return () => document.removeEventListener('keydown', onKeydown, true);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		const request = $signInRequest;
		if (!request || busy) return;

		busy = true;
		error = '';

		try {
			await signIn(request.node, username, password);
			answerSignIn(true);
		} catch (caught) {
			if (caught instanceof AdminAuthError) {
				error = caught.message;
			} else {
				error = adminErrorMessage(caught);
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if $signInRequest}
	<div class="sign-in-layer">
		<Modal
			title="Sign in to Beacon node {$signInRequest.node.name}"
			onClose={() => answerSignIn(false)}
			width="440px"
		>
			<form id="admin-sign-in" onsubmit={submit}>
				<p class="node-url">{$signInRequest.node.url}</p>

				<div class="field">
					<Label for="admin-username">Username</Label>
					<Input id="admin-username" autocomplete="username" bind:value={username} required />
				</div>

				<div class="field">
					<Label for="admin-password">Password</Label>
					<Input
						id="admin-password"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						required
					/>
				</div>

				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}
			</form>

			<div slot="footer" class="actions">
				<Button variant="outline" onclick={() => answerSignIn(false)}>Cancel</Button>
				<Button type="submit" form="admin-sign-in" disabled={busy}>
					{#if busy}
						Signing in...
					{:else}
						Sign in
					{/if}
				</Button>
			</div>
		</Modal>
	</div>
{/if}

<style lang="scss">
	// Same layer as `Confirm`: above the modal that started the action.
	.sign-in-layer {
		position: relative;
		z-index: 60;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.375rem;
	}

	.node-url {
		margin: 0;
		color: var(--muted-foreground);
		word-break: break-all;
	}

	.error {
		margin: 0;
		color: var(--destructive);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
```

Note: the busy label "Signing in..." is UI copy, not a comment, so the ASD-STE100 rule on `-ing` verbs does not apply. If the reviewer disagrees, use "Wait...".

- [ ] **Step 2: Mount it in the layout**

In `src/routes/+layout.svelte`, add after the import of `Confirm`:

```ts
	import AdminSignInDialog from '@/components/modals/AdminSignInDialog.svelte';
```

In the markup, add before the comment above `<Confirm />`:

```svelte
<AdminSignInDialog />
```

- [ ] **Step 3: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors. If `Input` does not forward `autocomplete`, remove that prop.

---

### Task 6: `AdminAction` and admin-only menu items

**Files:**
- Create: `src/lib/components/AdminAction.svelte`
- Create: `src/lib/components/sidebar/menu.ts`
- Test: `src/lib/components/sidebar/menu.test.ts`
- Modify: `src/lib/components/sidebar/AppSidebar.svelte` (types at lines 35-46, the `{#each groups ...}` block around line 250)

**Interfaces:**
- Consumes: `$settings.adminFeatures` from Task 1.
- Produces:
  - `AdminAction` with a `children` snippet that takes `{ disabled: boolean }`.
  - `menu.ts`: `type SubItem`, `type MenuItem`, `type Group`, `visibleGroups(groups: Group[], adminFeatures: boolean): Group[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/sidebar/menu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { visibleGroups, type Group } from './menu';

const groups: Group[] = [
	{
		title: 'Node Management',
		items: [
			{
				title: 'Data Browser',
				url: '/data-browser',
				icon: null,
				children: [
					{ title: 'Datasets', url: '/data-browser/datasets' },
					{ title: 'Storage', url: '/data-browser/storage', adminOnly: true }
				]
			},
			{ title: 'Crawlers', url: '/crawlers', icon: null, adminOnly: true }
		]
	},
	{
		title: 'Admin',
		items: [{ title: 'Users & Roles', url: '/access', icon: null, adminOnly: true }]
	}
];

describe('visibleGroups', () => {
	it('keeps every item with admin features on', () => {
		expect(visibleGroups(groups, true)).toEqual(groups);
	});

	it('hides admin items and empty groups with admin features off', () => {
		const result = visibleGroups(groups, false);

		expect(result).toHaveLength(1);
		expect(result[0].items.map((item) => item.title)).toEqual(['Data Browser']);
		expect(result[0].items[0].children?.map((child) => child.title)).toEqual(['Datasets']);
	});
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npm test -- src/lib/components/sidebar/menu.test.ts`
Expected: FAIL with a missing-module error for `./menu`.

- [ ] **Step 3: Write `menu.ts`**

Create `src/lib/components/sidebar/menu.ts`:

```ts
export type SubItem = { title: string; url: string; adminOnly?: boolean };

export type MenuItem = {
	title: string;
	url: string;
	/** Section root the item highlights on. Defaults to `url`. */
	match?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: any;
	children?: SubItem[];
	target?: string;
	adminOnly?: boolean;
};

export type Group = { title: string; items: MenuItem[] };

/** The menu without admin items while admin features are off. A group with no items goes too. */
export function visibleGroups(groups: Group[], adminFeatures: boolean): Group[] {
	if (adminFeatures) return groups;

	const result: Group[] = [];

	for (const group of groups) {
		const items = group.items
			.filter((item) => !item.adminOnly)
			.map((item) => {
				if (!item.children) return item;
				return { ...item, children: item.children.filter((child) => !child.adminOnly) };
			});

		if (items.length > 0) result.push({ ...group, items });
	}

	return result;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npm test -- src/lib/components/sidebar/menu.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Use it in the sidebar**

In `src/lib/components/sidebar/AppSidebar.svelte`:

Delete the local `type SubItem`, `type MenuItem` and `type Group` declarations (lines 35-46). Add to the imports:

```ts
	import { settings } from '@/stores/settings';
	import { visibleGroups, type Group, type MenuItem } from './menu';
```

After the `footer` array, add:

```ts
	let shownGroups = $derived(visibleGroups(groups, $settings.adminFeatures));
```

In the markup, change `{#each groups as group (group.title)}` to:

```svelte
		{#each shownGroups as group (group.title)}
```

- [ ] **Step 6: Create `AdminAction`**

Create `src/lib/components/AdminAction.svelte`:

```svelte
<!--
	Wraps one in-page admin control. While admin features are off, the control
	is disabled and the wrapper shows a hint.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { settings } from '@/stores/settings';

	let { children }: { children: Snippet<[{ disabled: boolean }]> } = $props();

	const OFF_HINT = 'Turn on "Show admin features" in Settings';

	let disabled = $derived(!$settings.adminFeatures);
</script>

<!-- A disabled button gets no hover events, so the wrapper holds the hint. -->
<span class="admin-action" title={disabled ? OFF_HINT : undefined}>
	{@render children({ disabled })}
</span>

<style lang="scss">
	.admin-action {
		display: inline-flex;
	}
</style>
```

- [ ] **Step 7: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

---

### Task 7: Shared `NodePicker` on the data-browser pages

**Files:**
- Create: `src/lib/components/NodePicker.svelte`
- Modify: `src/routes/data-browser/datasets/+page.svelte`
- Modify: `src/routes/data-browser/data-tables/+page.svelte`
- Delete: `src/lib/stores/data-browser-node.ts`

**Interfaces:**
- Consumes: `currentNode`, `nodes`, `selectNode` from `@/services/beacon-node`. `ensureFresh` from `@/services/beacon-node-connect`. `signedInNodeIds`, `signOut` from Task 2. `$settings.adminFeatures` from Task 1.
- Produces: `NodePicker` with an optional `actions` snippet, shown at the end of the picker row.

- [ ] **Step 1: Create the picker**

Create `src/lib/components/NodePicker.svelte`:

```svelte
<!--
	The picker of the global Beacon node, for pages that browse or manage one node.
	Query blocks keep their own node, so this picker does not change them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '@/components/ui/label';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import { currentNode, nodes, selectNode } from '@/services/beacon-node';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { signedInNodeIds, signOut } from '@/services/admin-session';
	import { settings } from '@/stores/settings';

	let { actions }: { actions?: Snippet } = $props();

	// `ensureFresh` skips a check that is not due.
	$effect(() => {
		for (const node of $nodes) void ensureFresh(node);
	});

	let signedIn = $derived(
		$settings.adminFeatures && $currentNode !== null && $signedInNodeIds.has($currentNode.id)
	);
</script>

<div class="node-picker">
	<Label size="sm" for="beacon-node-select">Beacon Node</Label>

	<div class="picker-row">
		<Select.Root
			type="single"
			name="beaconNode"
			value={$currentNode?.id ?? ''}
			onValueChange={(id) => selectNode(id)}
		>
			<Select.Trigger id="beacon-node-select" class="node-select-trigger">
				{$currentNode?.name ?? 'Select a node'}
			</Select.Trigger>
			<Select.Content>
				<Select.Group>
					<Select.Label>Nodes</Select.Label>
					{#each $nodes as node (node.id)}
						<Select.Item value={node.id} label={node.name}>
							{node.name}
						</Select.Item>
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>

		{#if $currentNode}
			<BeaconNodeStatus health={$currentNode} variant="dot" />
		{/if}

		{#if actions}
			<div class="actions">
				{@render actions()}
			</div>
		{/if}
	</div>

	{#if signedIn && $currentNode}
		<p class="session-line">
			Signed in ·
			<button type="button" class="sign-out" onclick={() => signOut($currentNode.id)}>
				Sign out
			</button>
		</p>
	{/if}
</div>

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

	.session-line {
		margin: 0;
		font-size: 0.875rem;
		color: var(--muted-foreground);
	}

	.sign-out {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
```

- [ ] **Step 2: Use it on the datasets page**

In `src/routes/data-browser/datasets/+page.svelte`:

Remove these imports: `* as Select`, `BeaconNodeStatus`, `Label`, `dataBrowserNodeId`, and `ensureFresh`. Change the `nodes` import to:

```ts
	import { currentNode, nodes } from '@/services/beacon-node';
```

Add:

```ts
	import NodePicker from '@/components/NodePicker.svelte';
```

Replace the two lines `let selectedNodeId = dataBrowserNodeId;` and `let selectedNode = $derived(...)` with:

```ts
	let selectedNode = $derived($currentNode);
```

In the first `$effect`, delete these lines:

```ts
		// Persist a fallback pick (e.g. first node) the same as an explicit one.
		if ($selectedNodeId !== selectedNode.id) selectedNodeId.set(selectedNode.id);
```

Delete the second `$effect` (the `ensureFresh` loop). `NodePicker` owns it.

Replace the whole `<div class="mb-4 node-picker"> ... </div>` block with:

```svelte
		<NodePicker />
```

Delete the `div.node-picker { ... }` rule from the `<style>` block.

- [ ] **Step 3: Use it on the data-tables page**

In `src/routes/data-browser/data-tables/+page.svelte`, make the same import, `selectedNode`, effect and style changes as Step 2.

Replace the whole `<div class="mb-4 node-picker"> ... </div>` block, which also holds the Create Table button, with:

```svelte
		<NodePicker>
			{#snippet actions()}
				{#if $nodes.length > 0}
					<Button variant="outline" onclick={() => (create_table_modal_open = true)}>
						Create Table
					</Button>
				{/if}
			{/snippet}
		</NodePicker>
```

- [ ] **Step 4: Delete the old store**

Run: `git rm src/lib/stores/data-browser-node.ts`
Then run: `grep -rn "data-browser-node\|dataBrowserNodeId" src`
Expected: no output.

- [ ] **Step 5: Check types and lint**

Run: `npm run check` and `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Smoke test**

Run: `npm run dev`. Open `/data-browser/datasets`. Pick another node. Open `/data-browser/data-tables`.
Expected: the second page shows the same node. The list loads for that node. The sidebar status follows the same node.

---

### Task 8: Admin actions use the sign-in

**Files:**
- Modify: `src/lib/components/modals/UploadDatasetsModal.svelte` (whole script, and the credential fields in the markup)
- Modify: `src/lib/components/modals/CreateTableModal.svelte` (lines 13-14, 56-84, and the credential fields in the markup)
- Modify: `src/routes/data-browser/datasets/+page.svelte` (Upload Datasets button)
- Modify: `src/routes/data-browser/data-tables/+page.svelte` (Create Table button in the `actions` snippet)
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `withAdmin`, `adminErrorMessage` from Tasks 2 and 3. `AdminAction` from Task 6.

- [ ] **Step 1: Rewrite the upload**

In `src/lib/components/modals/UploadDatasetsModal.svelte`, replace the whole `<script>` block with:

```svelte
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { addToast } from '@/stores/toasts';

	let { onCancel = () => {}, node }: { onCancel: (uploaded: boolean) => void; node: BeaconNode } =
		$props();
	let files: FileList | null = $state(null);
	let progress = $state(0);
	let message = $state('');
	let uploading = $state(false);

	async function uploadFiles() {
		if (!files || files.length === 0) {
			message = 'Please select files.';
			return;
		}

		uploading = true;
		message = '';
		progress = 0;

		const list = Array.from(files);
		const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
		let doneBytes = 0;
		let done = 0;

		try {
			for (const file of list) {
				const result = await withAdmin(node, (client) =>
					client.admin.uploadDataset(file.name, file, {
						onProgress: ({ uploaded }) => {
							progress = Math.round(((doneBytes + uploaded) / totalBytes) * 100);
						}
					})
				);

				if (result === null) {
					message = 'Upload cancelled.';
					return;
				}

				doneBytes += file.size;
				done += 1;
				progress = Math.round((doneBytes / totalBytes) * 100);
			}

			message = `Uploaded ${done} file(s).`;
		} catch (error) {
			addToast({ type: 'error', message: adminErrorMessage(error) });
			message = `Uploaded ${done} of ${list.length} file(s).`;
		} finally {
			uploading = false;
		}
	}
</script>
```

In the markup, delete the two `<div class="mb-4 ...">` blocks that hold "Admin Username" and "Admin Password". Keep the rest of the markup.

- [ ] **Step 2: Rewrite the create-table call**

In `src/lib/components/modals/CreateTableModal.svelte`:

Delete `let username = $state('');` and `let password = $state('');`. Add to the imports:

```ts
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
```

Replace everything from `// Encode Basic Auth header` to the end of the `try`/`catch` in `createTable()` with:

```ts
		// Sub-project 3 replaces this body with the external-table spec of the server.
		try {
			const result = await withAdmin(node, (client) =>
				client.admin.createExternalTable(table_config)
			);
			if (result === null) return;

			message = `Created table ${table_name}`;
			onCancel(true);
		} catch (error) {
			message = adminErrorMessage(error);
		}
```

In the markup, delete the two `<div class="mb-4 ...">` blocks that hold "Admin Username" and "Admin Password".

- [ ] **Step 3: Grey out the page buttons**

In `src/routes/data-browser/datasets/+page.svelte`, add:

```ts
	import AdminAction from '@/components/AdminAction.svelte';
```

Replace the Upload Datasets `<Button ...>Upload Datasets</Button>` with:

```svelte
				<AdminAction>
					{#snippet children({ disabled })}
						<Button {disabled} variant="outline" onclick={() => (upload_files_modal_open = true)}>
							Upload Datasets
						</Button>
					{/snippet}
				</AdminAction>
```

In `src/routes/data-browser/data-tables/+page.svelte`, add the same import, and change the `actions` snippet to:

```svelte
			{#snippet actions()}
				{#if $nodes.length > 0}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button {disabled} variant="outline" onclick={() => (create_table_modal_open = true)}>
								Create Table
							</Button>
						{/snippet}
					</AdminAction>
				{/if}
			{/snippet}
```

- [ ] **Step 4: Update AGENTS.md**

In `AGENTS.md`, section "Shared state", add after the `src/lib/services/beacon-node.ts` bullet:

```markdown
  - `src/lib/services/admin-session.ts` (admin sign-in for each node: Basic auth in `sessionStorage`. Run every admin call through `withAdmin(node, fn)`. It asks the one `AdminSignInDialog` for a sign-in, and retries one time after a 401. Never ask for admin credentials in a page or a modal.)
```

In section "Frontend Conventions", add:

```markdown
- Admin features: an admin-only page gets `adminOnly: true` in the sidebar menu (`components/sidebar/menu.ts`). An admin control in a page for everyone goes inside `AdminAction`, which greys it out while "Show admin features" is off.
```

- [ ] **Step 5: Run every check**

Run: `npm test`, then `npm run check`, then `npm run lint`
Expected: all tests pass. No new check or lint errors.

- [ ] **Step 6: Manual test against a node with admin credentials**

Run: `npm run dev`. Use a Beacon node where you know the admin username and password.

1. Settings: "Show admin features" is off. On `/data-browser/datasets`, "Upload Datasets" is greyed out. A hover shows `Turn on "Show admin features" in Settings`.
2. Turn the setting on. The button is enabled. No "Signed in" line shows.
3. Click "Upload Datasets", pick a small file, click Upload. The dialog "Sign in to Beacon node <name>" opens above the upload modal.
4. Type a wrong password. The dialog shows "Wrong username or password." and stays open.
5. Press Escape. Only the sign-in dialog closes. The upload modal shows "Upload cancelled.".
6. Upload again with good credentials. The file uploads. "Signed in · Sign out" shows under the node picker.
7. Upload a second file. No dialog opens.
8. Pick another node in the picker. The "Signed in" line hides.
9. Pick the first node again. Click "Sign out". The line hides. The next upload asks again.
10. Turn the setting off while signed in. The line hides, and the buttons grey out.
11. On `/data-browser/data-tables`, the Create Table flow asks for a sign-in. The server error then shows in the modal. That is expected until sub-project 3.
12. Confirm the visualiser pages and the query builder keep their own node after a node change in the picker.

Report each result to the user. Report a failed step with what you saw.
