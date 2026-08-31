/**
 * The Beacon instance helpers that talk to a node.
 *
 * These live apart from `beacon-instance.ts` so that the state service imports
 * no client code. `BeaconClient` imports the query store, and the query store
 * imports several other stores. A single file would risk an import cycle through
 * that graph.
 *
 * The health checks here write to `beacon-instance-health.ts`. That file holds
 * state only, so the state service can read it without a cycle.
 */

import { BeaconClient } from '@/beacon-api/client';
import type { BeaconInstance } from '@/beacon-api/types';
import { addInstance, getInstances, type BeaconInstanceInput } from './beacon-instance';
import {
	FRESH_MS,
	isFresh,
	PROBE_TIMEOUT_MS,
	setHealth,
	SWEEP_INTERVAL_MS
} from './beacon-instance-health';
import { normalizeUrl } from './beacon-instance-url';
import { getOpenInstances } from './open-instances';

/**
 * Tests a candidate instance. The caller does not need a record, so the form of
 * a new instance can use this too. A failure shows an error toast.
 */
export async function testInstance(input: Pick<BeaconInstanceInput, 'url' | 'token'>): Promise<boolean> {
	const client = new BeaconClient(input.url.trim(), input.token?.trim() || null);

	return client.testConnection();
}

// -- Health checks ----------------------------------------------------------

/**
 * Anything the app can check. A configured instance fits this, and so does an
 * entry of the public list. The health store keys by URL, so an id is not
 * needed here.
 */
export type HealthTarget = { url: string; token?: string };

/** The checks that run now, keyed by normalized URL. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Checks one node and records the result. The function shows no toast, so it
 * fits a background sweep. A failure or a timeout records `offline`.
 */
export async function checkInstance(target: HealthTarget): Promise<void> {
	const client = new BeaconClient(target.url, target.token ?? null);
	const startedAt = performance.now();

	try {
		const isHealthy = await client.getHealth({ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
		const latencyMs = Math.round(performance.now() - startedAt);

		setHealth(target.url, {
			status: isHealthy ? 'online' : 'offline',
			latencyMs: isHealthy ? latencyMs : null,
			lastCheckedAt: new Date()
		});
	} catch {
		setHealth(target.url, { status: 'offline', latencyMs: null, lastCheckedAt: new Date() });
	}
}

/**
 * Checks one node, but only if the last result is stale. Repeated calls share
 * the check that runs. Call it where the app shows or uses a node.
 */
export function ensureFresh(target: HealthTarget, maxAgeMs: number = FRESH_MS): Promise<void> {
	if (isFresh(target.url, maxAgeMs)) return Promise.resolve();

	const key = normalizeUrl(target.url);

	const running = inFlight.get(key);
	if (running) return running;

	const check = checkInstance(target).finally(() => inFlight.delete(key));

	inFlight.set(key, check);

	return check;
}

/**
 * Checks every configured instance, and every node of the public list. One
 * failure does not stop the others. A node in both lists gets one check, because
 * `ensureFresh` keys by URL. The default checks all of them. Pass `maxAgeMs` to
 * skip the fresh ones.
 */
export async function checkAllInstances(maxAgeMs: number = 0): Promise<void> {
	const targets: HealthTarget[] = [...getInstances(), ...getOpenInstances()];

	await Promise.allSettled(targets.map((target) => ensureFresh(target, maxAgeMs)));
}

/** The stop function of the monitor that runs, or `null`. */
let stopMonitor: (() => void) | null = null;

/**
 * Starts the hourly sweep of every instance. The monitor also checks again when
 * the browser comes back online, and when the user returns to the tab.
 *
 * A second call starts no second monitor. The function returns the stop
 * function of the monitor that runs.
 */
export function startHealthMonitor(): () => void {
	if (stopMonitor) return stopMonitor;

	const sweep = () => void checkAllInstances();

	// The timer stops in a hidden tab in some browsers. A return to the tab
	// therefore checks again, but only the results that the sweep would refresh.
	const onVisible = () => {
		if (document.visibilityState === 'visible') void checkAllInstances(SWEEP_INTERVAL_MS);
	};

	sweep();

	const timer = setInterval(sweep, SWEEP_INTERVAL_MS);

	window.addEventListener('online', sweep);
	document.addEventListener('visibilitychange', onVisible);

	stopMonitor = () => {
		clearInterval(timer);
		window.removeEventListener('online', sweep);
		document.removeEventListener('visibilitychange', onVisible);
		stopMonitor = null;
	};

	return stopMonitor;
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
