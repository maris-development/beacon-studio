import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { BeaconNode } from '@/beacon-api/types';

const STORAGE_KEY = 'beacon-studio.admin-sessions';

function node(id: string, url = `https://${id}.example.org`): BeaconNode {
	return { id, name: id, url, status: 'online', latencyMs: 1, lastCheckedAt: null };
}

// The module reads sessionStorage at load, so each test loads a fresh copy.
// The SDK loads after the reset too, so `instanceof` sees the same classes as the module.
async function load() {
	vi.resetModules();
	const session = await import('../admin-session');
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
		const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const client = session.makeAdminClient(
			{ ...node('a', 'https://A.example.org/'), token: 'secret' },
			{ username: 'alice', password: 'pw' }
		);

		await client.admin.check();

		const [url, init] = fetchMock.mock.calls[0];
		const headers = new Headers(init.headers);
		expect(String(url)).toBe('https://a.example.org/api/admin/check');
		expect(headers.get('Authorization')).toBe(`Basic ${btoa('alice:pw')}`);
		vi.unstubAllGlobals();
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

describe('admin-session remembered sign-ins', () => {
	const A_URL = 'https://a.example.org';

	beforeEach(() => {
		sessionStorage.clear();
		vi.restoreAllMocks();
		vi.stubGlobal('indexedDB', new IDBFactory());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Signs in on a fresh module, then gives a fresh module with an empty sessionStorage.
	async function rememberThenRestart(nodeId = 'a', username = 'alice', password = 'pw') {
		const first = await load();
		vi.spyOn(first.sdk.AdminClient.prototype, 'check').mockResolvedValue();
		await expect(first.session.signIn(node(nodeId), username, password, true)).resolves.toBe(true);

		sessionStorage.clear();
		const second = await load();
		vi.spyOn(second.sdk.AdminClient.prototype, 'check').mockResolvedValue();
		return second;
	}

	it('remembers a sign-in across a restart', async () => {
		const first = await load();
		let session = first.session;
		vi.spyOn(first.sdk.AdminClient.prototype, 'check').mockResolvedValue();
		await expect(session.signIn(node('a'), 'alice', 'pw', true)).resolves.toBe(true);

		sessionStorage.clear();
		({ session } = await load());
		expect(session.hasAdminSession('a')).toBe(false);

		await session.restoreRememberedSessions(() => A_URL);
		expect(session.credentialsOf('a')).toEqual({ username: 'alice', password: 'pw' });
	});

	it('saves nothing without remember', async () => {
		const first = await load();
		let session = first.session;
		vi.spyOn(first.sdk.AdminClient.prototype, 'check').mockResolvedValue();
		await expect(session.signIn(node('a'), 'alice', 'pw', false)).resolves.toBe(true);

		sessionStorage.clear();
		({ session } = await load());
		await session.restoreRememberedSessions(() => A_URL);

		expect(session.hasAdminSession('a')).toBe(false);
	});

	it('forgets an older remembered user on a sign-in without remember', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
		await session.signIn(node('a'), 'alice', 'pw', true);
		await session.signIn(node('a'), 'bob', 'pw2', false);
		const vault = await import('../admin-vault');
		await vi.waitFor(async () => expect(await vault.loadRemembered()).toEqual([]));

		sessionStorage.clear();
		const next = await load();
		await next.session.restoreRememberedSessions(() => A_URL);

		expect(next.session.hasAdminSession('a')).toBe(false);
	});

	it('signOut forgets the remembered entry', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
		await session.signIn(node('a'), 'alice', 'pw', true);

		session.signOut('a');
		const vault = await import('../admin-vault');
		await vi.waitFor(async () => expect(await vault.loadRemembered()).toEqual([]));

		sessionStorage.clear();
		const next = await load();
		await next.session.restoreRememberedSessions(() => A_URL);
		expect(next.session.hasAdminSession('a')).toBe(false);
	});

	it('forgets the entry on a signOut during the save', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
		const vault = await import('../admin-vault');
		const realSave = vault.saveRemembered;
		let release = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		// The save writes only after the signOut, as a slow key or encrypt step does.
		const save = vi.spyOn(vault, 'saveRemembered').mockImplementation(async (entry) => {
			await gate;
			await realSave(entry);
		});

		const signingIn = session.signIn(node('a'), 'alice', 'pw', true);
		await vi.waitFor(() => expect(save).toHaveBeenCalled());
		session.signOut('a');
		await new Promise((resolve) => setTimeout(resolve, 50));
		release();

		await expect(signingIn).resolves.toBe(true);
		await vi.waitFor(async () => expect(await vault.loadRemembered()).toEqual([]));

		sessionStorage.clear();
		const next = await load();
		await next.session.restoreRememberedSessions(() => A_URL);
		expect(next.session.hasAdminSession('a')).toBe(false);
	});

	it('discards an entry for another URL', async () => {
		const { session } = await rememberThenRestart();

		await session.restoreRememberedSessions(() => 'https://other.example.org');

		expect(session.hasAdminSession('a')).toBe(false);
		const vault = await import('../admin-vault');
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('discards an entry for a removed node', async () => {
		const { session } = await rememberThenRestart();

		await session.restoreRememberedSessions(() => null);

		expect(session.hasAdminSession('a')).toBe(false);
		const vault = await import('../admin-vault');
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('compares URLs after normalizeUrl', async () => {
		const { session } = await rememberThenRestart();

		await session.restoreRememberedSessions(() => 'https://A.example.org/');

		expect(session.credentialsOf('a')).toEqual({ username: 'alice', password: 'pw' });
	});

	it('keeps a sign-in made during the restore', async () => {
		const { session } = await rememberThenRestart();

		const restore = session.restoreRememberedSessions(() => A_URL);
		await session.signIn(node('a'), 'bob', 'pw2');
		await restore;

		expect(session.credentialsOf('a')?.username).toBe('bob');
	});

	it('keeps a sign-out made during the restore', async () => {
		const { session } = await rememberThenRestart();

		const restore = session.restoreRememberedSessions(() => A_URL);
		session.signOut('a');
		await restore;

		expect(session.hasAdminSession('a')).toBe(false);
	});

	it('keeps the tab session when the save fails', async () => {
		const { session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();
		const vault = await import('../admin-vault');
		vi.spyOn(vault, 'saveRemembered').mockRejectedValue(new Error('quota'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		await expect(session.signIn(node('a'), 'alice', 'pw', true)).resolves.toBe(false);

		expect(session.hasAdminSession('a')).toBe(true);
	});

	it('sets adminSessionsReady to the running restore', async () => {
		const { session } = await rememberThenRestart();

		const restore = session.restoreRememberedSessions(() => A_URL);

		expect(session.adminSessionsReady).toBe(restore);
		await restore;
	});

	it('forgets all remembered sign-ins and keeps the tab sessions', async () => {
		const { session } = await rememberThenRestart();
		await session.restoreRememberedSessions(() => A_URL);

		await session.forgetAllAdminSignIns();

		expect(session.hasAdminSession('a')).toBe(true);
		const vault = await import('../admin-vault');
		expect(await vault.loadRemembered()).toEqual([]);
	});

	it('reports the vault availability', async () => {
		const { session } = await load();
		expect(session.canRememberSignIn()).toBe(true);

		vi.stubGlobal('indexedDB', undefined);
		expect(session.canRememberSignIn()).toBe(false);
	});
});
