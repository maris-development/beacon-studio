import { isSuperUserRefusal } from './statement';

export type PrivilegedOutcome<T> =
	| { kind: 'done'; value: T }
	| { kind: 'cancelled' }
	| { kind: 'needs-admin-features'; error: unknown };

/**
 * Runs as a normal user first. On a super-user refusal, runs again through `asAdmin`,
 * but only with admin features on. The server refuses before it runs anything, so the
 * statement never runs twice.
 */
export async function withAdminFallback<C, T>(
	run: (client: C) => Promise<T>,
	options: {
		client: C;
		adminFeatures: boolean;
		asAdmin: (run: (client: C) => Promise<T>) => Promise<T | null>;
	}
): Promise<PrivilegedOutcome<T>> {
	try {
		return { kind: 'done', value: await run(options.client) };
	} catch (error) {
		if (!isSuperUserRefusal(error)) throw error;
		if (!options.adminFeatures) return { kind: 'needs-admin-features', error };
	}

	const value = await options.asAdmin(run);
	if (value === null) return { kind: 'cancelled' };

	return { kind: 'done', value };
}
