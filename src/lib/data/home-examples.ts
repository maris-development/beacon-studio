/**
 * The Quick start examples on the home page.
 *
 * `loadHomeExamples` fetches {@link HOME_EXAMPLES_URL} and writes the result
 * to `localStorage`, so MARIS can change the list without a release of the
 * app. A failed fetch keeps the last list, or an empty list on a first visit.
 */

import { get, readonly, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';
import { BRAND, BRAND_ID } from '@/brand';
import { addToast } from '@/stores/toasts';

/** The address of the examples list. A brand can set its own in `brand.ts`. */
export const HOME_EXAMPLES_URL = BRAND.endpoints.homeExamples;

/** The localStorage key of the cached list. Two brands on one domain keep separate lists. (can happen in dev mode, highly unlikely in prod) */
const STORAGE_KEY = `beacon-studio.${BRAND_ID}.home-examples`;

/** The time after which the fetch of the list counts as a failure. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * One card of the Quick start examples section on the home page.
 *
 * `rows` and `seconds` come from a reference run of the query. The card states
 * them, so a new user knows the size of the result before the run starts.
 */
export type HomeExample = {
	/** Card heading. */
	title: string;
	/** One sentence about the selection. */
	description: string;
	/** The node that holds the data, in words. */
	sourceName: string;
	/** The table on that node. */
	tableName: string;
	/** File name of the screenshot, under `static/images/`. */
	image: string;
	/** Row count of the reference run. */
	rows: number;
	/** Duration of the reference run, in seconds. */
	seconds: number;
	/** Output format of the query, in words. */
	format: string;
	/**
	 * The `?query=...` part of a share link for this example, copied from the
	 * workbench's own Share button. To update an example, share the query
	 * again and paste the new value here.
	 */
	shareQuery: string;
};

/** True if the value has every field of a `HomeExample`, with the right type. */
function isHomeExample(value: unknown): value is HomeExample {
	if (typeof value !== 'object' || value === null) return false;

	const entry = value as Record<string, unknown>;

	return typeof entry.title === 'string'
		&& typeof entry.description === 'string'
		&& typeof entry.sourceName === 'string'
		&& typeof entry.tableName === 'string'
		&& typeof entry.image === 'string'
		&& typeof entry.rows === 'number'
		&& typeof entry.seconds === 'number'
		&& typeof entry.format === 'string'
		&& typeof entry.shareQuery === 'string';
}

/** Keeps the usable entries, in file order, and drops a malformed one. A payload that is not an array throws. */
function parseExamples(payload: unknown): HomeExample[] {
	if (!Array.isArray(payload)) {
		throw new Error('The home examples list is not an array.');
	}

	return payload.filter(isHomeExample);
}

const homeExamplesStore = persisted<HomeExample[]>(STORAGE_KEY, []);

/**
 * The cached examples, in the order that the home page shows them. Reads from
 * `localStorage` at once, so a component has the last fetch to show before
 * `loadHomeExamples` answers. Use `$homeExamples` in a component.
 */
export const homeExamples: Readable<HomeExample[]> = readonly(homeExamplesStore);

/**
 * Reads the examples list from {@link HOME_EXAMPLES_URL} and writes it to
 * `localStorage`. A failure shows a toast and keeps the cached list, which is
 * empty on a first visit. An empty array from the server is no failure.
 */
export async function loadHomeExamples(): Promise<HomeExample[]> {
	try {
		const response = await fetch(HOME_EXAMPLES_URL, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});

		if (!response.ok) {
			throw new Error(`The server answered ${response.status}.`);
		}

		const examples = parseExamples(await response.json());

		homeExamplesStore.set(examples);

		return examples;
	} catch (error) {
		console.warn(`Could not read the home examples list at ${HOME_EXAMPLES_URL}.`, error);

		let detail = String(error);
		if (error instanceof Error) detail = error.message;
		addToast({ key: 'home.examples.loadFailed', type: 'warning', message: detail });

		return get(homeExamplesStore);
	}
}
