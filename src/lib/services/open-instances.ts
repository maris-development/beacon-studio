/**
 * The public list of open Beacon nodes.
 *
 * A new user has no instance, so the app offers the demonstration nodes of
 * MARIS. The list comes from a URL, not from the bundle, so MARIS can change it
 * without a release of the app.
 *
 * This file holds the list only. `open-instances-import.ts` adds each node to
 * the saved instance list, once. A node that the user removes stays out.
 *
 * This file holds no client code, so `beacon-instance-connect.ts` can sweep the
 * list without an import cycle.
 */

import { get, readonly, writable, type Readable } from 'svelte/store';
import { normalizeUrl } from './beacon-instance-url';

/** The address of the public list. */
export const OPEN_INSTANCES_URL = 'https://beacon-datalake.org/open-instances.json';

/** The time after which the fetch of the list counts as a failure. */
const FETCH_TIMEOUT_MS = 10_000;

/** One node of the public list. */
export type OpenInstance = {
	name: string;
	url: string;
	description: string;
};

const openInstancesStore = writable<OpenInstance[]>([]);

/** The public nodes. Use `$openInstances` in a component. */
export const openInstances: Readable<OpenInstance[]> = readonly(openInstancesStore);

/** A snapshot of the list, for plain modules. Call it at the point of use. */
export function getOpenInstances(): OpenInstance[] {
	return get(openInstancesStore);
}

/** True if the value has a usable name and URL. */
function isOpenInstance(value: unknown): value is Partial<OpenInstance> & { name: string; url: string } {
	if (typeof value !== 'object' || value === null) return false;

	const entry = value as Record<string, unknown>;

	return typeof entry.name === 'string' && entry.name.trim() !== ''
		&& typeof entry.url === 'string' && entry.url.trim() !== '';
}

/** Keeps the usable entries, and drops a URL that repeats inside the list. */
function parseList(payload: unknown): OpenInstance[] {
	if (!Array.isArray(payload)) {
		console.warn('The public node list is not an array. The app shows no public nodes.');
		return [];
	}

	const seen = new Set<string>();
	const result: OpenInstance[] = [];

	for (const value of payload) {
		if (!isOpenInstance(value)) continue;

		const url = value.url.trim();
		const key = normalizeUrl(url);

		if (seen.has(key)) continue;
		seen.add(key);

		result.push({
			name: value.name.trim(),
			url,
			description: typeof value.description === 'string' ? value.description.trim() : ''
		});
	}

	return result;
}

/**
 * Reads the public list and fills the store. The list is an offer, so a failure
 * writes a warning to the console and shows no toast. The store then stays
 * empty, and the home page shows no public nodes.
 */
export async function loadOpenInstances(): Promise<OpenInstance[]> {
	try {
		const response = await fetch(OPEN_INSTANCES_URL, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});

		if (!response.ok) {
			throw new Error(`The server answered ${response.status}.`);
		}

		const list = parseList(await response.json());

		openInstancesStore.set(list);

		return list;
	} catch (error) {
		console.warn(`Could not read the public node list at ${OPEN_INSTANCES_URL}.`, error);

		return [];
	}
}
