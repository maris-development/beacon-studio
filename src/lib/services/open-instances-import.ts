/**
 * The import of the public node list into the saved instance list.
 *
 * The app adds every public node once, at start. The user can then edit or
 * remove a node like any other instance.
 *
 * The import keeps the normalized URL of every node it handled. That record is
 * the reason a removed node stays out: without it, the next start adds the node
 * again.
 *
 * This file writes. `open-instances.ts` only reads the list, so it stays free of
 * an import of the state service.
 */

import { persisted } from 'svelte-local-storage-store';
import { get } from 'svelte/store';
import {
	addInstance,
	findByUrl,
	getCurrentInstance,
	normalizeUrl,
	selectInstance
} from './beacon-instance';
import { getOpenInstances, type OpenInstance } from './open-instances';

/** The key of the normalized URLs that the app imported. */
const IMPORTED_KEY = 'imported-open-instance-urls';

const importedUrlsStore = persisted<string[]>(IMPORTED_KEY, []);

/**
 * Adds every public node that the app did not import before. The function
 * returns the number of instances it added.
 *
 * A node with a URL that the saved list already holds counts as imported. The
 * function adds no second record for it.
 *
 * The loop runs backwards. The instances page shows the newest record first, so
 * this puts the public nodes in the order of the public list.
 */
export function importOpenInstances(list: OpenInstance[] = getOpenInstances()): number {
	const imported = new Set(get(importedUrlsStore));
	const hadSelection = getCurrentInstance() !== null;
	let added = 0;

	for (const node of [...list].reverse()) {
		const key = normalizeUrl(node.url);

		if (imported.has(key)) continue;
		imported.add(key);

		if (findByUrl(node.url) !== null) continue;

		addInstance({
			name: node.name,
			url: node.url,
			description: node.description
		});

		added += 1;
	}

	importedUrlsStore.set([...imported]);

	// `addInstance` selects the first record it adds, which the backward loop
	// makes the last node of the public list. Take the first node of that list
	// instead. MARIS puts the node it prefers at the top.
	if (!hadSelection && added > 0) selectFirstOf(list);

	return added;
}

/** Selects the first node of the list that the saved list holds. */
function selectFirstOf(list: OpenInstance[]): void {
	for (const node of list) {
		const instance = findByUrl(node.url);

		if (instance) {
			selectInstance(instance.id);
			return;
		}
	}
}
