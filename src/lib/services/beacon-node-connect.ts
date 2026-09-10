/**
 * The Beacon node helpers that talk to a node.
 *
 * These live apart from `beacon-node.ts` so that the state service imports
 * no client code. `BeaconClient` imports the query store, and the query store
 * imports several other stores. A single file would risk an import cycle through
 * that graph.
 *
 * The health checks here write to `beacon-node-health.ts`. That file holds
 * state only, so the state service can read it without a cycle.
 */

import { BeaconClient } from '@/beacon-api/client';
import type { BeaconNode } from '@/beacon-api/types';
import { addNode, getNodes, type BeaconNodeInput } from './beacon-node';
import {
	FRESH_MS,
	isFresh,
	PROBE_TIMEOUT_MS,
	setHealth,
	SWEEP_INTERVAL_MS
} from './beacon-node-health';
import { normalizeUrl } from './beacon-node-url';
import { getOpenNodes } from './open-nodes';

/**
 * Tests a candidate node. The caller does not need a record, so the form of
 * a new node can use this too. A failure shows an error toast.
 */
export async function testNode(input: Pick<BeaconNodeInput, 'url' | 'token'>): Promise<boolean> {
	const client = new BeaconClient(input.url.trim(), input.token?.trim() || null);

	return client.testConnection();
}

// -- Health checks ----------------------------------------------------------

/**
 * Anything the app can check. A configured node fits this, and so does an
 * entry of the public list. The health store keys by URL, so an id is not
 * needed here.
 */
export type HealthTarget = { url: string; token?: string };

/** The checks that run now, keyed by normalized URL. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Checks one node and records the result. The function shows no toast, so it
 * fits a background sweep. A failure or a timeout records `offline`.
 *
 * A node that does not answer also loses its cached tables and schemas. That
 * cache holds one answer for the session. A node that comes back can hold other
 * tables, and a restart of the app would be the only way to see them.
 */
export async function checkNode(target: HealthTarget): Promise<void> {
	const client = new BeaconClient(target.url, target.token ?? null);
	const startedAt = performance.now();

	try {
		const isHealthy = await client.getHealth({ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
		const latencyMs = Math.round(performance.now() - startedAt);

		if (!isHealthy) client.clearMetadataCache();

		setHealth(target.url, {
			status: isHealthy ? 'online' : 'offline',
			latencyMs: isHealthy ? latencyMs : null,
			lastCheckedAt: new Date()
		});
	} catch {
		client.clearMetadataCache();
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

	const check = checkNode(target).finally(() => inFlight.delete(key));

	inFlight.set(key, check);

	return check;
}

/**
 * Checks every configured node, and every node of the public list. One
 * failure does not stop the others. A node in both lists gets one check, because
 * `ensureFresh` keys by URL. The default checks all of them. Pass `maxAgeMs` to
 * skip the fresh ones.
 */
export async function checkAllNodes(maxAgeMs: number = 0): Promise<void> {
	const targets: HealthTarget[] = [...getNodes(), ...getOpenNodes()];

	await Promise.allSettled(targets.map((target) => ensureFresh(target, maxAgeMs)));
}

/** The stop function of the monitor that runs, or `null`. */
let stopMonitor: (() => void) | null = null;

/**
 * Starts the hourly sweep of every node. The monitor also checks again when
 * the browser comes back online, and when the user returns to the tab.
 *
 * A second call starts no second monitor. The function returns the stop
 * function of the monitor that runs.
 */
export function startHealthMonitor(): () => void {
	if (stopMonitor) return stopMonitor;

	const sweep = () => void checkAllNodes();

	// The timer stops in a hidden tab in some browsers. A return to the tab
	// therefore checks again, but only the results that the sweep would refresh.
	const onVisible = () => {
		if (document.visibilityState === 'visible') void checkAllNodes(SWEEP_INTERVAL_MS);
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

/** True if a configured node points at this origin. */
function hasNodeOnOrigin(origin: string): boolean {
	const target = normalizeUrl(origin);

	return getNodes().some((node) => {
		try {
			return normalizeUrl(new URL(node.url).origin) === target;
		} catch {
			return false;
		}
	});
}

/**
 * Adds the Beacon node of the current host root, if the node answers and the
 * list has no node on that origin. The app can run on the same host as a
 * node. Example: the app on `https://beacon.maris.nl/studio/` adds
 * `https://beacon.maris.nl`.
 *
 * The function returns the new node, or `null` if it added none. It never
 * replaces the selection of the user. See `addNode`.
 */
export async function ensureHostNode(origin: string): Promise<BeaconNode | null> {
	if (hasNodeOnOrigin(origin)) return null;

	const canConnect = await new BeaconClient(origin)
		.getHealth()
		.then((isHealthy) => isHealthy)
		.catch(() => false);

	if (!canConnect) {
		console.warn(`No Beacon node answers at ${origin}. The app adds no node.`);
		return null;
	}

	const { hostname } = new URL(origin);

	return addNode({
		name: `Beacon - ${hostname}`,
		url: origin,
		description: `Beacon node of the current host root. (${origin})`
	});
}
