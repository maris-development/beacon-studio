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
		expect(form.hasAdminInput({ username: '', password: '', remember: true })).toBe(false);
		expect(form.hasAdminInput({ username: 'admin', password: '', remember: false })).toBe(true);
		expect(form.hasAdminInput({ username: '', password: 'pw', remember: false })).toBe(true);
	});

	it('adds a node with no sign-in when the admin fields are empty', async () => {
		const { form, session, nodes, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(values, { username: '', password: '', remember: false });

		expect(result?.adminError).toBeNull();
		expect(nodes.getNodes().map((node) => node.name)).toEqual(['ERA5']);
		expect(check).not.toHaveBeenCalled();
		expect(session.hasAdminSession(result!.node.id)).toBe(false);
	});

	it('adds a node and signs in with good credentials', async () => {
		const { form, session, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(values, {
			username: 'admin',
			password: 'pw',
			remember: false
		});

		expect(result?.adminError).toBeNull();
		expect(session.hasAdminSession(result!.node.id)).toBe(true);
	});

	it('keeps the node when the sign-in fails', async () => {
		const { form, session, nodes, sdk } = await load();
		vi.spyOn(sdk.AdminClient.prototype, 'check').mockRejectedValue(unauthorized(sdk));

		const result = await form.saveNodeForm(values, {
			username: 'admin',
			password: 'bad',
			remember: false
		});

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
			{ username: 'admin', password: 'new', remember: false },
			added.id
		);

		expect(result?.node.url).toBe('https://other.example.org');
		expect(session.credentialsOf(added.id)).toEqual({ username: 'admin', password: 'new' });
	});

	it('passes remember to signIn', async () => {
		const { form, session } = await load();
		const signIn = vi.spyOn(session, 'signIn').mockResolvedValue(true);

		const result = await form.saveNodeForm(values, {
			username: 'alice',
			password: 'pw',
			remember: true
		});

		expect(signIn).toHaveBeenCalledWith(result!.node, 'alice', 'pw', true);
	});

	it('reports a failed remember', async () => {
		const { form, session } = await load();
		vi.spyOn(session, 'signIn').mockResolvedValue(false);

		const result = await form.saveNodeForm(values, {
			username: 'alice',
			password: 'pw',
			remember: true
		});

		expect(result?.rememberFailed).toBe(true);
		expect(result?.adminError).toBeNull();
	});

	it('keeps a session only while the URL stays the same', async () => {
		const { form, nodes } = await load();
		const added = nodes.addNode(values);

		expect(form.sessionSurvives(added, 'https://beacon-era5.example.org/')).toBe(true);
		expect(form.sessionSurvives(added, 'https://other.example.org')).toBe(false);
	});

	it('returns null for an unknown id and signs in nowhere', async () => {
		const { form, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check').mockResolvedValue();

		const result = await form.saveNodeForm(
			values,
			{ username: 'admin', password: 'pw', remember: false },
			'missing'
		);

		expect(result).toBeNull();
		expect(check).not.toHaveBeenCalled();
	});

	it('sees a complete pair only when both fields hold text', async () => {
		const { form } = await load();

		expect(form.hasCompleteAdminInput(null)).toBe(false);
		expect(form.hasCompleteAdminInput({ username: 'admin', password: '', remember: false })).toBe(
			false
		);
		expect(form.hasCompleteAdminInput({ username: '', password: 'pw', remember: false })).toBe(
			false
		);
		expect(form.hasCompleteAdminInput({ username: 'admin', password: 'pw', remember: false })).toBe(
			true
		);
	});

	it('tests admin input without a session', async () => {
		const { form, session, sdk } = await load();
		const check = vi.spyOn(sdk.AdminClient.prototype, 'check');

		expect(await form.testAdminInput(values.url, null)).toBeNull();
		expect(
			await form.testAdminInput(values.url, { username: 'admin', password: '', remember: false })
		).toBeNull();
		expect(check).not.toHaveBeenCalled();

		check.mockRejectedValue(unauthorized(sdk));
		expect(
			await form.testAdminInput(values.url, { username: 'admin', password: 'bad', remember: false })
		).toBe(new session.AdminAuthError().message);
	});
});
