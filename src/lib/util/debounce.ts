/**
 * Debounce — run a function once a burst of calls has stopped.
 *
 * The chart explorer needs this on every control that edits a plot. A drag of a
 * slider fires one event per pixel, and each one can rebuild the colour of every
 * row. At several hundred thousand rows that is far more work than the user can
 * see, and the page stops answering while it runs.
 *
 * The returned object also lets a caller finish early. A field that loses focus,
 * or a slider that the user let go of, should not wait out the delay.
 */
export interface Debounced<T extends unknown[]> {
	/** Schedule a call. A later call inside the delay replaces this one. */
	call: (...args: T) => void;
	/** Run the pending call now, if there is one. */
	flush: () => void;
	/** Drop the pending call. */
	cancel: () => void;
	/** True while a call is waiting. */
	readonly pending: () => boolean;
}

export function debounce<T extends unknown[]>(fn: (...args: T) => void, delay = 250): Debounced<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let lastArgs: T | null = null;

	function run() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}

		const args = lastArgs;
		lastArgs = null;
		if (args) fn(...args);
	}

	return {
		call(...args: T) {
			lastArgs = args;

			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(run, delay);
		},

		flush() {
			if (timer === null) return;
			run();
		},

		cancel() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
			lastArgs = null;
		},

		pending: () => timer !== null
	};
}
