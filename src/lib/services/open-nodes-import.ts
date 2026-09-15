/**
 * The import of the public node list into the saved node list.
 *
 * The app adds every public node once, at start. The user can then edit or
 * remove a node like any other node.
 *
 * The import keeps the normalized URL of every node it handled. That record is
 * the reason a removed node stays out: without it, the next start adds the node
 * again.
 *
 * This file writes. `open-nodes.ts` only reads the list, so it stays free of
 * an import of the state service.
 */

import { persisted } from 'svelte-local-storage-store';
import { get, readonly, writable, type Readable } from 'svelte/store';
import {
	addNode,
	findByUrl,
	getCurrentNode,
	getNodes,
	migrateKey,
	normalizeUrl,
	selectNode
} from './beacon-node';
import { getOpenNodes, loadOpenNodes, type OpenNode } from './open-nodes';

/** The key of the normalized URLs that the app imported. */
const IMPORTED_KEY = 'imported-open-node-urls';

// An old storage key. It is a data format, not a term. Never rename it.
migrateKey('imported-open-instance-urls', IMPORTED_KEY);

const importedUrlsStore = persisted<string[]>(IMPORTED_KEY, []);

// A saved node list means the first visit is over. Nothing to wait for.
const hasNodes = getNodes().length > 0;

const settledStore = writable(hasNodes);

/**
 * True after the public list lands, or after its fetch fails.
 *
 * A share link names its node by URL. On a first visit the saved list is empty,
 * so that name resolves to nothing until the public list lands. A page reads
 * this store to hold back a "node not found" message until the app can tell.
 */
export const openNodesSettled: Readable<boolean> = readonly(settledStore);

let settle: () => void = () => {};

const settledPromise = hasNodes
	? Promise.resolve()
	: new Promise<void>((done) => {
			settle = done;
		});

/** {@link openNodesSettled} for a one-shot caller, such as a toast. */
export function whenOpenNodesSettled(): Promise<void> {
	return settledPromise;
}

/**
 * Reads the public list, imports it, and reports the list as settled. A failed
 * fetch also settles the list, so a caller never waits forever.
 */
export async function syncOpenNodes(): Promise<number> {
	try {
		return importOpenNodes(await loadOpenNodes());
	} finally {
		settledStore.set(true);
		settle();
	}
}

/**
 * Adds every public node that the app did not import before. The function
 * returns the number of nodes it added.
 *
 * A node with a URL that the saved list already holds counts as imported. The
 * function adds no second record for it.
 *
 * The loop runs backwards. The nodes page shows the newest record first, so
 * this puts the public nodes in the order of the public list.
 */
export function importOpenNodes(list: OpenNode[] = getOpenNodes()): number {
	const imported = new Set(get(importedUrlsStore));
	const hadSelection = getCurrentNode() !== null;
	let added = 0;

	for (const node of [...list].reverse()) {
		const key = normalizeUrl(node.url);

		if (imported.has(key)) continue;
		imported.add(key);

		if (findByUrl(node.url) !== null) continue;

		addNode({
			name: node.name,
			url: node.url,
			description: node.description
		});

		added += 1;
	}

	importedUrlsStore.set([...imported]);

	// `addNode` selects the first record it adds, which the backward loop
	// makes the last node of the public list. Take the first node of that list
	// instead. MARIS puts the node it prefers at the top.
	if (!hadSelection && added > 0) selectFirstOf(list);

	return added;
}

/** Selects the first node of the list that the saved list holds. */
function selectFirstOf(list: OpenNode[]): void {
	for (const node of list) {
		const saved = findByUrl(node.url);

		if (saved) {
			selectNode(saved.id);
			return;
		}
	}
}
