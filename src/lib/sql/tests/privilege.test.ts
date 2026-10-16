import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@maris-development/beacon-client';
import { withAdminFallback } from '../privilege';

const refusal = new ApiError(
	400,
	'operation not permitted: this statement requires super-user privileges',
	'u'
);

describe('withAdminFallback', () => {
	it('runs as a normal user when the server allows it', async () => {
		const asAdmin = vi.fn();
		const outcome = await withAdminFallback(async (client: string) => `ran as ${client}`, {
			client: 'user',
			adminFeatures: true,
			asAdmin
		});

		expect(outcome).toEqual({ kind: 'done', value: 'ran as user' });
		expect(asAdmin).not.toHaveBeenCalled();
	});

	it('runs again as admin after a refusal with admin features on', async () => {
		const run = vi.fn(async (client: string) => {
			if (client === 'user') throw refusal;
			return 'ran as admin';
		});

		const outcome = await withAdminFallback(run, {
			client: 'user',
			adminFeatures: true,
			asAdmin: (fn) => fn('admin')
		});

		expect(outcome).toEqual({ kind: 'done', value: 'ran as admin' });
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('reports a cancelled sign-in', async () => {
		const outcome = await withAdminFallback(() => Promise.reject(refusal), {
			client: 'user',
			adminFeatures: true,
			asAdmin: async () => null
		});

		expect(outcome).toEqual({ kind: 'cancelled' });
	});

	it('does not ask for admin with admin features off', async () => {
		const asAdmin = vi.fn();
		const outcome = await withAdminFallback(() => Promise.reject(refusal), {
			client: 'user',
			adminFeatures: false,
			asAdmin
		});

		expect(outcome).toEqual({ kind: 'needs-admin-features', error: refusal });
		expect(asAdmin).not.toHaveBeenCalled();
	});

	it('passes any other error through', async () => {
		const error = new ApiError(400, 'column "x" not found', 'u');

		await expect(
			withAdminFallback(() => Promise.reject(error), {
				client: 'user',
				adminFeatures: true,
				asAdmin: vi.fn()
			})
		).rejects.toBe(error);
	});
});
