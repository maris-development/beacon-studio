/**
 * The single owner of the Beacon instance configuration.
 *
 * The app persists two values: the list of instances, and the id of the
 * selection. The service derives the current instance from both. It does not
 * persist a copy of the selected object. An edit of the selected instance is
 * therefore active immediately.
 *
 * Read with `currentInstance` / `instances` in a component, or with
 * `getCurrentInstance()` / `getInstances()` in a plain module. Write only with
 * the actions in this file. The stores stay private on purpose.
 *
 * This file holds no network code. See `beacon-instance-connect.ts` for the
 * helpers that talk to a node.
 *
 * The reads merge the live health of `beacon-instance-health.ts` onto each
 * record. The list store holds the persisted fields only, so no status or
 * latency reaches local storage.
 */

import { browser } from '$app/environment';
import { derived, get, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import type {
	BeaconInstance,
	BeaconInstanceHealth,
	InstanceRef,
	StoredBeaconInstance
} from '@/beacon-api/types';
import { Utils } from '@/utils';
import { dropHealth, getHealthOf, healthMap, UNKNOWN_HEALTH } from './beacon-instance-health';
import { normalizeUrl } from './beacon-instance-url';

export type { BeaconInstance, InstanceRef, StoredBeaconInstance };
export { normalizeUrl };

/** The fields a caller supplies. The service owns id, createdAt and updatedAt. */
export type BeaconInstanceInput = {
	name: string;
	url: string;
	description?: string;
	token?: string;
};

const LIST_KEY = 'beacon-instances';
const SELECTED_KEY = 'current-beacon-instance-id';

/** The key of the app version that persisted the full selected object. */
const LEGACY_SELECTED_KEY = 'current-beacon-instance';

const listStore = persisted<StoredBeaconInstance[]>(LIST_KEY, []);
const selectedIdStore = persisted<string | null>(SELECTED_KEY, null);

/**
 * Moves an old selection to the new key. The app kept a full copy of the
 * selected instance. It now keeps the id only. The function runs once, because
 * it deletes the old key.
 */
function migrateLegacySelection(): void {
	if (!browser) return;

	const raw = window.localStorage.getItem(LEGACY_SELECTED_KEY);
	if (raw === null) return;

	try {
		const legacy = JSON.parse(raw) as BeaconInstance | null;

		if (legacy?.id && get(selectedIdStore) === null) {
			selectedIdStore.set(legacy.id);
		}
	} catch (error) {
		console.warn('Could not read the old Beacon instance selection.', error);
	}

	window.localStorage.removeItem(LEGACY_SELECTED_KEY);
}

migrateLegacySelection();

// -- Reads ------------------------------------------------------------------

/** Puts the live health on a stored record. */
function withHealth(
	stored: StoredBeaconInstance,
	map: Record<string, BeaconInstanceHealth>
): BeaconInstance {
	return { ...stored, ...(map[normalizeUrl(stored.url)] ?? UNKNOWN_HEALTH) };
}

/** Every configured instance, with its health. Use `$instances` in a component. */
export const instances: Readable<BeaconInstance[]> = derived(
	[listStore, healthMap],
	([list, map]) => list.map((stored) => withHealth(stored, map))
);

/**
 * The selected instance, or `null`. Use `$currentInstance` in a component.
 * The value follows an edit of the selected instance, and a health check.
 */
export const currentInstance: Readable<BeaconInstance | null> = derived(
	[instances, selectedIdStore],
	([list, id]) => list.find((instance) => instance.id === id) ?? null
);

/** A snapshot of the list, for plain modules. Call it at the point of use. */
export function getInstances(): BeaconInstance[] {
	return get(instances);
}

/** A snapshot of the selection, for plain modules. Call it at the point of use. */
export function getCurrentInstance(): BeaconInstance | null {
	return get(currentInstance);
}

/** The selection, or an error. Use it where the caller cannot continue without one. */
export function requireCurrentInstance(): BeaconInstance {
	const instance = getCurrentInstance();

	if (!instance) {
		throw new Error('No Beacon instance selected.');
	}

	return instance;
}

/** The instance with this id, or `null`. */
export function findById(id: string): BeaconInstance | null {
	return getInstances().find((instance) => instance.id === id) ?? null;
}

/** The instance with this URL, or `null`. The compare uses {@link normalizeUrl}. */
export function findByUrl(url: string): BeaconInstance | null {
	const target = normalizeUrl(url);

	return getInstances().find((instance) => normalizeUrl(instance.url) === target) ?? null;
}

/**
 * The instance that a query record ref names, or `null`.
 *
 * A record holds the ref by value, so the ref can name a node that the list no
 * longer holds. The match uses the id first, then the URL. A user can remove a
 * node and add it again, which gives it a new id.
 *
 * The function is pure, so a component can call it inside a `$derived` on a
 * mirror of the list. See `resolveRef` for the snapshot form.
 */
export function matchRef(
	list: BeaconInstance[],
	ref: InstanceRef | null | undefined
): BeaconInstance | null {
	if (!ref) return null;

	if (ref.id) {
		const byId = list.find((instance) => instance.id === ref.id);
		if (byId) return byId;
	}

	if (ref.url) {
		const target = normalizeUrl(ref.url);
		return list.find((instance) => normalizeUrl(instance.url) === target) ?? null;
	}

	return null;
}

/** {@link matchRef} against the list of now. Use it in a plain module. */
export function resolveRef(ref: InstanceRef | null | undefined): BeaconInstance | null {
	return matchRef(getInstances(), ref);
}

// -- Writes -----------------------------------------------------------------

/** Applies the given fields only. An absent field keeps its value. */
function applyInput(
	instance: StoredBeaconInstance,
	input: Partial<BeaconInstanceInput>
): StoredBeaconInstance {
	const next: StoredBeaconInstance = { ...instance, updatedAt: new Date() };

	if (input.name !== undefined) next.name = input.name.trim();
	if (input.url !== undefined) next.url = input.url.trim();
	if (input.description !== undefined) next.description = input.description.trim();
	if (input.token !== undefined) next.token = input.token.trim();

	return next;
}

/**
 * Adds an instance to the end of the list. The function selects the new
 * instance when the app has no selection. It never replaces a selection.
 */
export function addInstance(input: BeaconInstanceInput): BeaconInstance {
	const now = new Date();

	const stored: StoredBeaconInstance = {
		id: Utils.uuidv4(),
		name: input.name.trim(),
		url: input.url.trim(),
		description: input.description?.trim() ?? '',
		token: input.token?.trim() ?? '',
		createdAt: now,
		updatedAt: now
	};

	listStore.update((list) => [...list, stored]);

	if (getCurrentInstance() === null) {
		selectedIdStore.set(stored.id);
	}

	return { ...stored, ...UNKNOWN_HEALTH };
}

/**
 * Changes an instance. The function returns the new record, or `null` if the id
 * is unknown. An edit of the selected instance takes effect at once, because
 * the selection holds an id only.
 *
 * A new token can change the answer of the node, so the function drops the
 * health. A new URL needs no drop, because the health store keys by URL.
 */
export function updateInstance(
	id: string,
	input: Partial<BeaconInstanceInput>
): BeaconInstance | null {
	const previous = findById(id);
	if (!previous) return null;

	let updated: StoredBeaconInstance = previous;

	listStore.update((list) =>
		list.map((instance) => {
			if (instance.id !== id) return instance;

			updated = applyInput(instance, input);
			return updated;
		})
	);

	if (updated.token !== previous.token) {
		dropHealth(updated.url);
		return { ...updated, ...UNKNOWN_HEALTH };
	}

	return { ...updated, ...getHealthOf(updated.url) };
}

/**
 * Removes an instance. The function returns the removed record, or `null` if
 * the id is unknown. It selects the first instance that stays, if it removed
 * the selected one.
 */
export function removeInstance(id: string): BeaconInstance | null {
	const removed = findById(id);
	if (!removed) return null;

	const wasSelected = get(selectedIdStore) === id;

	listStore.update((list) => list.filter((instance) => instance.id !== id));

	// Another instance can point at the same node. Keep the health for it.
	if (findByUrl(removed.url) === null) {
		dropHealth(removed.url);
	}

	if (wasSelected) {
		selectedIdStore.set(null);
		selectFirstIfNone();
	}

	return removed;
}

/** Selects an instance. Pass `null` to clear the selection. */
export function selectInstance(id: string | null): void {
	if (id !== null && findById(id) === null) {
		console.warn(`No Beacon instance has the id "${id}". The app keeps the selection.`);
		return;
	}

	selectedIdStore.set(id);
}

/**
 * Selects the first instance if the app has no selection. The function returns
 * the selection, or `null` if the list is empty.
 */
export function selectFirstIfNone(): BeaconInstance | null {
	const current = getCurrentInstance();
	if (current) return current;

	const first = getInstances()[0] ?? null;
	if (first) selectedIdStore.set(first.id);

	return first;
}
