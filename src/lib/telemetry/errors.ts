/**
 * Reports an uncaught fault as telemetry.
 *
 * The console patch sees a `console.error` call only. A thrown error and a
 * rejected promise never pass through it, so both need their own handler.
 *
 * An abort stays out. The app aborts a query on every new run, so an abort is a
 * normal step and not a fault.
 */

import { track } from './index';

/** The server cuts the message at 500 characters. */
const MAX_MESSAGE = 500;

/** The reported part of a stack trace, in characters. */
const MAX_STACK = 300;

/** The reported part of a file name, in characters. */
const MAX_SOURCE = 120;

/** The test reads `name`, so it also holds for an error of another realm. */
function isAbort(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;

	return (value as { name?: unknown }).name === 'AbortError';
}

function messageOf(value: unknown): string {
	if (value instanceof Error) return `${value.name}: ${value.message}`.slice(0, MAX_MESSAGE);

	if (typeof value === 'string') return value.slice(0, MAX_MESSAGE);

	try {
		return (JSON.stringify(value) ?? 'unknown').slice(0, MAX_MESSAGE);
	} catch {
		return 'unknown';
	}
}

/** The first lines of a stack trace. The top frames name the fault. */
function stackOf(value: unknown): string | undefined {
	if (!(value instanceof Error) || typeof value.stack !== 'string') return undefined;

	return value.stack.slice(0, MAX_STACK);
}

/** Keeps the file name of a bundle URL and drops the origin. */
function sourceOf(url: string | undefined): string | undefined {
	if (!url) return undefined;

	try {
		return new URL(url).pathname.slice(-MAX_SOURCE);
	} catch {
		return url.slice(-MAX_SOURCE);
	}
}

/** Starts both handlers. Returns the function that removes them. */
export function startErrorCapture(): () => void {
	const onError = (event: ErrorEvent) => {
		// A failed image, script or stylesheet raises this event with no error object.
		const target = event.target;
		const isResource = target instanceof Element;

		if (isResource) {
			track('app.error', {
				level: 'error',
				message: `Failed to load ${target.tagName.toLowerCase()}`,
				props: { kind: 'resource' }
			});

			return;
		}

		if (isAbort(event.error)) return;

		track('app.error', {
			level: 'error',
			message: messageOf(event.error ?? event.message),
			props: {
				kind: 'uncaught',
				source: sourceOf(event.filename),
				line: event.lineno || undefined,
				stack: stackOf(event.error)
			}
		});
	};

	const onRejection = (event: PromiseRejectionEvent) => {
		if (isAbort(event.reason)) return;

		track('app.error', {
			level: 'error',
			message: messageOf(event.reason),
			props: { kind: 'rejection', stack: stackOf(event.reason) }
		});
	};

	// A resource error does not bubble, so the listener runs in the capture phase.
	window.addEventListener('error', onError, true);
	window.addEventListener('unhandledrejection', onRejection);

	return () => {
		window.removeEventListener('error', onError, true);
		window.removeEventListener('unhandledrejection', onRejection);
	};
}
