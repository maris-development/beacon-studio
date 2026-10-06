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
