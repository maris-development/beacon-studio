/**
 * The Beacon instance helpers that talk to a node.
 *
 * These live apart from `beacon-instance.ts` so that the state service imports
 * no client code. `BeaconClient` imports the query store, and the query store
 * imports the state service. A single file would close that import cycle.
 */

import { BeaconClient } from '@/beacon-api/client';
import type { BeaconInstance } from '@/beacon-api/types';
import {
	addInstance,
	getInstances,
	normalizeUrl,
	type BeaconInstanceInput
} from './beacon-instance';

/**
 * Tests a candidate instance. The caller does not need a record, so the form of
 * a new instance can use this too. A failure shows an error toast.
 */
export async function testInstance(input: Pick<BeaconInstanceInput, 'url' | 'token'>): Promise<boolean> {
	const client = new BeaconClient(input.url.trim(), input.token?.trim() || null);

	return client.testConnection();
}

/** True if a configured instance points at this origin. */
function hasInstanceOnOrigin(origin: string): boolean {
	const target = normalizeUrl(origin);

	return getInstances().some((instance) => {
		try {
			return normalizeUrl(new URL(instance.url).origin) === target;
		} catch {
			return false;
		}
	});
}

/**
 * Adds the Beacon node of the current host root, if the node answers and the
 * list has no instance on that origin. The app can run on the same host as a
 * node. Example: the app on `https://beacon.maris.nl/studio/` adds
 * `https://beacon.maris.nl`.
 *
 * The function returns the new instance, or `null` if it added none. It never
 * replaces the selection of the user. See `addInstance`.
 */
export async function ensureHostInstance(origin: string): Promise<BeaconInstance | null> {
	if (hasInstanceOnOrigin(origin)) return null;

	const canConnect = await new BeaconClient(origin)
		.getHealth()
		.then((isHealthy) => isHealthy)
		.catch(() => false);

	if (!canConnect) {
		console.warn(`No Beacon node answers at ${origin}. The app adds no instance.`);
		return null;
	}

	const { hostname } = new URL(origin);

	return addInstance({
		name: `Beacon - ${hostname}`,
		url: origin,
		description: `Beacon node of the current host root. (${origin})`
	});
}
