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

	it('ignores an answer for a request that another node replaced', async () => {
		const session = await load();

		const forA = session.askSignIn(node('a'));
		const requestA = get(session.signInRequest)!;
		const forB = session.askSignIn(node('b'));

		session.answerSignIn(true, requestA);

		await expect(forA).resolves.toBe(false);
		expect(get(session.signInRequest)?.node.id).toBe('b');

		session.answerSignIn(false);
		await expect(forB).resolves.toBe(false);
	});

	it('keeps a session that another action created after the 401', async () => {
		const session = await load();
		await session.signIn(node('a'), 'old', 'old');
		const fn = vi
			.fn()
			.mockImplementationOnce(async () => {
				await session.signIn(node('a'), 'new', 'new');
				throw unauthorized();
			})
			.mockResolvedValueOnce('done');

		await expect(session.withAdmin(node('a'), fn)).resolves.toBe('done');
		expect(get(session.signInRequest)).toBeNull();
		expect(fn).toHaveBeenCalledTimes(2);
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
