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
 */

import { browser } from '$app/environment';
import { derived, get, readonly, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import type { BeaconInstance } from '@/beacon-api/types';
import { Utils } from '@/utils';

export type { BeaconInstance };

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

const listStore = persisted<BeaconInstance[]>(LIST_KEY, []);
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

/**
 * Puts a URL in a comparable form. The compare is case insensitive and ignores
 * a trailing slash. Two instances with the same node must not be duplicates.
 */
export function normalizeUrl(url: string): string {
	return url.trim().toLowerCase().replace(/\/+$/, '');
}

// -- Reads ------------------------------------------------------------------

/** Every configured instance. Use `$instances` in a component. */
export const instances: Readable<BeaconInstance[]> = readonly(listStore);

/**
 * The selected instance, or `null`. Use `$currentInstance` in a component.
 * The value follows an edit of the selected instance.
 */
export const currentInstance: Readable<BeaconInstance | null> = derived(
	[listStore, selectedIdStore],
	([list, id]) => list.find((instance) => instance.id === id) ?? null
);

/** A snapshot of the list, for plain modules. Call it at the point of use. */
export function getInstances(): BeaconInstance[] {
	return get(listStore);
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

// -- Writes -----------------------------------------------------------------

/** Applies the given fields only. An absent field keeps its value. */
function applyInput(instance: BeaconInstance, input: Partial<BeaconInstanceInput>): BeaconInstance {
	const next: BeaconInstance = { ...instance, updatedAt: new Date() };

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

	const instance: BeaconInstance = {
		id: Utils.uuidv4(),
		name: input.name.trim(),
		url: input.url.trim(),
		description: input.description?.trim() ?? '',
		token: input.token?.trim() ?? '',
		createdAt: now,
		updatedAt: now
	};

	listStore.update((list) => [...list, instance]);

	if (getCurrentInstance() === null) {
		selectedIdStore.set(instance.id);
	}

	return instance;
}

/**
 * Changes an instance. The function returns the new record, or `null` if the id
 * is unknown. An edit of the selected instance takes effect at once, because
 * the selection holds an id only.
 */
export function updateInstance(
	id: string,
	input: Partial<BeaconInstanceInput>
): BeaconInstance | null {
	let updated: BeaconInstance | null = null;

	listStore.update((list) =>
		list.map((instance) => {
			if (instance.id !== id) return instance;

			updated = applyInput(instance, input);
			return updated;
		})
	);

	return updated;
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
