/**
 * The in-memory health of every Beacon node.
 *
 * This file holds state only. It imports no client code, so the state service
 * `beacon-node.ts` can merge the health into its reads without an import
 * cycle. The probe that fills this store lives in `beacon-node-connect.ts`.
 *
 * The store keys a record by the normalized URL, not by a node id. A node
 * of the public list has no id, and the home page must show its health too. A
 * URL key also gives one result per node, even if two nodes point at it.
 *
 * The app persists no health. A reload starts every node at `unknown`.
 */

import { get, readonly, writable, type Readable } from 'svelte/store';
import type { BeaconNodeHealth } from '@/beacon-api/types';
import { normalizeUrl } from './beacon-node-url';

export type { BeaconNodeHealth };

/** The age at which a check result counts as stale. */
export const FRESH_MS = 60_000;

/** The time between two sweeps of every node. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** The time after which one check counts as a failure. */
export const PROBE_TIMEOUT_MS = 10_000;

/** The health of a node that the app never checked. */
export const UNKNOWN_HEALTH: BeaconNodeHealth = Object.freeze({
	status: 'unknown',
	latencyMs: null,
	lastCheckedAt: null
});

const healthStore = writable<Record<string, BeaconNodeHealth>>({});

/**
 * The health of every node, keyed by normalized URL. Use `$healthMap` in a
 * component, together with {@link healthOf}.
 */
export const healthMap: Readable<Record<string, BeaconNodeHealth>> = readonly(healthStore);

/** The health of one node in a map snapshot. Use it with `$healthMap`. */
export function healthOf(
	map: Record<string, BeaconNodeHealth>,
	url: string
): BeaconNodeHealth {
	return map[normalizeUrl(url)] ?? UNKNOWN_HEALTH;
}

/** The health of one node. Returns {@link UNKNOWN_HEALTH} for an unchecked URL. */
export function getHealthOf(url: string): BeaconNodeHealth {
	return healthOf(get(healthStore), url);
}

/** Records the result of one check. This is the only writer of the store. */
export function setHealth(url: string, health: BeaconNodeHealth): void {
	const key = normalizeUrl(url);

	healthStore.update((map) => ({ ...map, [key]: health }));
}

/** Drops the health of one node. Call it when no node keeps that URL. */
export function dropHealth(url: string): void {
	const key = normalizeUrl(url);

	healthStore.update((map) => {
		const { [key]: _removed, ...rest } = map;
		return rest;
	});
}

/** True if the last check of this node is inside the given window. */
export function isFresh(url: string, maxAgeMs: number = FRESH_MS): boolean {
	const { lastCheckedAt } = getHealthOf(url);

	if (lastCheckedAt === null) return false;

	return Date.now() - lastCheckedAt.getTime() < maxAgeMs;
}
