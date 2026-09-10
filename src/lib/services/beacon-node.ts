/**
 * The single owner of the Beacon node configuration.
 *
 * The app persists two values: the list of nodes, and the id of the selection.
 * The service derives the current node from both. It does not persist a copy of
 * the selected object. An edit of the selected node is therefore active
 * immediately.
 *
 * Read with `currentNode` / `nodes` in a component, or with `getCurrentNode()` /
 * `getNodes()` in a plain module. Write only with the actions in this file. The
 * stores stay private on purpose.
 *
 * This file holds no network code. See `beacon-node-connect.ts` for the helpers
 * that talk to a node.
 *
 * The reads merge the live health of `beacon-node-health.ts` onto each record.
 * The list store holds the persisted fields only, so no status or latency
 * reaches local storage.
 */

import { browser } from '$app/environment';
import { derived, get, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import type { BeaconNode, BeaconNodeHealth, NodeRef, StoredBeaconNode } from '@/beacon-api/types';
import { Utils } from '@/utils';
import { dropHealth, getHealthOf, healthMap, UNKNOWN_HEALTH } from './beacon-node-health';
import { normalizeUrl } from './beacon-node-url';

export type { BeaconNode, NodeRef, StoredBeaconNode };
export { normalizeUrl };

/** The fields a caller supplies. The service owns id, createdAt and updatedAt. */
export type BeaconNodeInput = {
	name: string;
	url: string;
	description?: string;
	token?: string;
};

const LIST_KEY = 'beacon-nodes';
const SELECTED_KEY = 'current-beacon-node-id';

/** The key of the app version that persisted the full selected object. */
const LEGACY_SELECTED_KEY = 'current-beacon-instance';

/**
 * Moves the raw value of a renamed local storage key. The function writes only
 * when the new key is absent, and then removes the old key. Call it before a
 * `persisted()` store reads the new key.
 */
export function migrateKey(oldKey: string, newKey: string): void {
	if (!browser) return;

	const value = window.localStorage.getItem(oldKey);
	if (value === null) return;

	if (window.localStorage.getItem(newKey) === null) {
		window.localStorage.setItem(newKey, value);
	}

	window.localStorage.removeItem(oldKey);
}

// The first argument of each call is a storage key of an older app version.
// It is a data format, not a term. Never rename one.
migrateKey('beacon-instances', LIST_KEY);
migrateKey('current-beacon-instance-id', SELECTED_KEY);

const listStore = persisted<StoredBeaconNode[]>(LIST_KEY, []);
const selectedIdStore = persisted<string | null>(SELECTED_KEY, null);

/**
 * Moves an old selection to the new key. The app kept a full copy of the
 * selected node. It now keeps the id only. The function runs once, because it
 * deletes the old key.
 */
function migrateLegacySelection(): void {
	if (!browser) return;

	const raw = window.localStorage.getItem(LEGACY_SELECTED_KEY);
	if (raw === null) return;

	try {
		const legacy = JSON.parse(raw) as BeaconNode | null;

		if (legacy?.id && get(selectedIdStore) === null) {
			selectedIdStore.set(legacy.id);
		}
	} catch (error) {
		console.warn('Could not read the old Beacon node selection.', error);
	}

	window.localStorage.removeItem(LEGACY_SELECTED_KEY);
}

migrateLegacySelection();

/**
 * Puts every stored URL in the form of {@link normalizeUrl}. An older app
 * version stored the value of the user, so a record can hold a trailing slash
 * or a mixed case host.
 *
 * The function writes only when a URL changes. It is therefore safe to run on
 * every start, and a list that needs no change writes nothing.
 */
function migrateNodeUrls(): void {
	if (!browser) return;

	const list = get(listStore);

	if (list.every((node) => node.url === normalizeUrl(node.url))) return;

	listStore.set(list.map((node) => ({ ...node, url: normalizeUrl(node.url) })));
}

migrateNodeUrls();

// -- Reads ------------------------------------------------------------------

/** Puts the live health on a stored record. */
function withHealth(stored: StoredBeaconNode, map: Record<string, BeaconNodeHealth>): BeaconNode {
	return { ...stored, ...(map[normalizeUrl(stored.url)] ?? UNKNOWN_HEALTH) };
}

/** Every configured node, with its health. Use `$nodes` in a component. */
export const nodes: Readable<BeaconNode[]> = derived([listStore, healthMap], ([list, map]) =>
	list.map((stored) => withHealth(stored, map))
);

/**
 * The selected node, or `null`. Use `$currentNode` in a component. The value
 * follows an edit of the selected node, and a health check.
 */
export const currentNode: Readable<BeaconNode | null> = derived(
	[nodes, selectedIdStore],
	([list, id]) => list.find((node) => node.id === id) ?? null
);

/** A snapshot of the list, for plain modules. Call it at the point of use. */
export function getNodes(): BeaconNode[] {
	return get(nodes);
}

/** A snapshot of the selection, for plain modules. Call it at the point of use. */
export function getCurrentNode(): BeaconNode | null {
	return get(currentNode);
}

/** The selection, or an error. Use it where the caller cannot continue without one. */
export function requireCurrentNode(): BeaconNode {
	const node = getCurrentNode();

	if (!node) {
		throw new Error('No Beacon node selected.');
	}

	return node;
}

/** The node with this id, or `null`. */
export function findById(id: string): BeaconNode | null {
	return getNodes().find((node) => node.id === id) ?? null;
}

/** The node with this URL, or `null`. The compare uses {@link normalizeUrl}. */
export function findByUrl(url: string): BeaconNode | null {
	const target = normalizeUrl(url);

	return getNodes().find((node) => normalizeUrl(node.url) === target) ?? null;
}

/**
 * The node that a query record ref names, or `null`.
 *
 * A record holds the ref by value, so the ref can name a node that the list no
 * longer holds. The match uses the id first, then the URL. A user can remove a
 * node and add it again, which gives it a new id.
 *
 * The function is pure, so a component can call it inside a `$derived` on a
 * mirror of the list. See `resolveRef` for the snapshot form.
 */
export function matchRef(list: BeaconNode[], ref: NodeRef | null | undefined): BeaconNode | null {
	if (!ref) return null;

	if (ref.id) {
		const byId = list.find((node) => node.id === ref.id);
		if (byId) return byId;
	}

	if (ref.url) {
		const target = normalizeUrl(ref.url);
		return list.find((node) => normalizeUrl(node.url) === target) ?? null;
	}

	return null;
}

/** {@link matchRef} against the list of now. Use it in a plain module. */
export function resolveRef(ref: NodeRef | null | undefined): BeaconNode | null {
	return matchRef(getNodes(), ref);
}

// -- Writes -----------------------------------------------------------------

/** Applies the given fields only. An absent field keeps its value. */
function applyInput(node: StoredBeaconNode, input: Partial<BeaconNodeInput>): StoredBeaconNode {
	const next: StoredBeaconNode = { ...node, updatedAt: new Date() };

	if (input.name !== undefined) next.name = input.name.trim();
	if (input.url !== undefined) next.url = normalizeUrl(input.url);
	if (input.description !== undefined) next.description = input.description.trim();
	if (input.token !== undefined) next.token = input.token.trim();

	return next;
}

/**
 * Adds a node to the end of the list. The function selects the new node when
 * the app has no selection. It never replaces a selection.
 */
export function addNode(input: BeaconNodeInput): BeaconNode {
	const now = new Date();

	const stored: StoredBeaconNode = {
		id: Utils.uuidv4(),
		name: input.name.trim(),
		url: normalizeUrl(input.url),
		description: input.description?.trim() ?? '',
		token: input.token?.trim() ?? '',
		createdAt: now,
		updatedAt: now
	};

	listStore.update((list) => [...list, stored]);

	if (getCurrentNode() === null) {
		selectedIdStore.set(stored.id);
	}

	return { ...stored, ...UNKNOWN_HEALTH };
}

/**
 * Changes a node. The function returns the new record, or `null` if the id is
 * unknown. An edit of the selected node takes effect at once, because the
 * selection holds an id only.
 *
 * A new token can change the answer of the node, so the function drops the
 * health. A new URL needs no drop, because the health store keys by URL.
 */
export function updateNode(id: string, input: Partial<BeaconNodeInput>): BeaconNode | null {
	const previous = findById(id);
	if (!previous) return null;

	let updated: StoredBeaconNode = previous;

	listStore.update((list) =>
		list.map((node) => {
			if (node.id !== id) return node;

			updated = applyInput(node, input);
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
 * Removes a node. The function returns the removed record, or `null` if the id
 * is unknown. It selects the first node that stays, if it removed the selected
 * one.
 */
export function removeNode(id: string): BeaconNode | null {
	const removed = findById(id);
	if (!removed) return null;

	const wasSelected = get(selectedIdStore) === id;

	listStore.update((list) => list.filter((node) => node.id !== id));

	// Another record can point at the same node. Keep the health for it.
	if (findByUrl(removed.url) === null) {
		dropHealth(removed.url);
	}

	if (wasSelected) {
		selectedIdStore.set(null);
		selectFirstIfNone();
	}

	return removed;
}

/** Selects a node. Pass `null` to clear the selection. */
export function selectNode(id: string | null): void {
	if (id !== null && findById(id) === null) {
		console.warn(`No Beacon node has the id "${id}". The app keeps the selection.`);
		return;
	}

	selectedIdStore.set(id);
}

/**
 * Selects the first node if the app has no selection. The function returns the
 * selection, or `null` if the list is empty.
 */
export function selectFirstIfNone(): BeaconNode | null {
	const current = getCurrentNode();
	if (current) return current;

	const first = getNodes()[0] ?? null;
	if (first) selectedIdStore.set(first.id);

	return first;
}
