/**
 * The in-memory health of every Beacon instance.
 *
 * This file holds state only. It imports no client code, so the state service
 * `beacon-instance.ts` can merge the health into its reads without an import
 * cycle. The probe that fills this store lives in `beacon-instance-connect.ts`.
 *
 * The app persists no health. A reload starts every instance at `unknown`.
 */

import { get, readonly, writable, type Readable } from 'svelte/store';
import type { BeaconInstanceHealth } from '@/beacon-api/types';

export type { BeaconInstanceHealth };

/** The age at which a check result counts as stale. */
export const FRESH_MS = 60_000;

/** The time between two sweeps of every instance. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** The time after which one check counts as a failure. */
export const PROBE_TIMEOUT_MS = 10_000;

/** The health of an instance that the app never checked. */
export const UNKNOWN_HEALTH: BeaconInstanceHealth = Object.freeze({
	status: 'unknown',
	latencyMs: null,
	lastCheckedAt: null
});

const healthStore = writable<Record<string, BeaconInstanceHealth>>({});

/** The health of every instance, keyed by id. Use `$healthMap` in a component. */
export const healthMap: Readable<Record<string, BeaconInstanceHealth>> = readonly(healthStore);

/** The health of one instance. Returns {@link UNKNOWN_HEALTH} for an unchecked id. */
export function getHealthOf(id: string): BeaconInstanceHealth {
	return get(healthStore)[id] ?? UNKNOWN_HEALTH;
}

/** Records the result of one check. This is the only writer of the store. */
export function setHealth(id: string, health: BeaconInstanceHealth): void {
	healthStore.update((map) => ({ ...map, [id]: health }));
}

/** Drops the health of one instance. Call it when the app removes the instance. */
export function dropHealth(id: string): void {
	healthStore.update((map) => {
		const { [id]: _removed, ...rest } = map;
		return rest;
	});
}

/** True if the last check of this instance is inside the given window. */
export function isFresh(id: string, maxAgeMs: number = FRESH_MS): boolean {
	const { lastCheckedAt } = getHealthOf(id);

	if (lastCheckedAt === null) return false;

	return Date.now() - lastCheckedAt.getTime() < maxAgeMs;
}
