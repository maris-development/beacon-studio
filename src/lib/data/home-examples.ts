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

import { asset } from '$app/paths';
import { readonly, writable, type Readable } from 'svelte/store';

/**
 * The examples file, under `static/home-examples.json`. Edit it there, in the
 * order the cards should show, to change the Quick start examples: the file
 * is fetched at runtime, not bundled, so no build or release is needed.
 */
const HOME_EXAMPLES_PATH = '/home-examples.json';

const homeExamplesStore = writable<HomeExample[]>([]);

/** The examples, in the order that the home page shows them. Use `$homeExamples` in a component. */
export const homeExamples: Readable<HomeExample[]> = readonly(homeExamplesStore);

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

/** Keeps the usable entries, in file order, and drops a malformed one. */
function parseExamples(payload: unknown): HomeExample[] {
	if (!Array.isArray(payload)) {
		console.warn('home-examples.json is not an array. The home page shows no examples.');
		return [];
	}

	return payload.filter(isHomeExample);
}

/**
 * Reads `home-examples.json` and fills the store. A failure is not fatal: it
 * writes a warning to the console, and the home page then shows no cards.
 */
export async function loadHomeExamples(): Promise<HomeExample[]> {
	try {
		const response = await fetch(asset(HOME_EXAMPLES_PATH));

		if (!response.ok) {
			throw new Error(`The server answered ${response.status}.`);
		}

		const examples = parseExamples(await response.json());

		homeExamplesStore.set(examples);

		return examples;
	} catch (error) {
		console.warn('Could not read home-examples.json.', error);

		return [];
	}
}
