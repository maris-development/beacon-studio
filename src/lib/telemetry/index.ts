/**
 * The public face of Studio telemetry.
 *
 * Call {@link track} anywhere. Call {@link initTelemetry} once, from the layout.
 *
 * Two rules hold everywhere in this folder:
 *   1. Nothing throws. A telemetry fault is invisible to the user.
 *   2. Nothing raises a toast. A toast is itself an event, so it would loop.
 *
 * This module sits beside `stores/`. It may read `stores/settings`. It must never
 * import a component. See the layer rule in AGENTS.md.
 */

import { dev } from '$app/environment';
import { getSettings } from '@/stores/settings';
import { installId, platform, sessionId, studioVersion } from './identity';
import { clearQueue, enqueue, flush, startQueue } from './queue';
import { categoryOf, type TelemetryEvent, type TelemetryFields, type TelemetryName } from './types';
import { Utils } from '@/utils';

export type { TelemetryFields, TelemetryName } from './types';
export { flush } from './queue';
export { forgetIdentity } from './identity';

/** Set this to true to send telemetry from a dev session, and to patch the console there. */
const DEV_OVERRIDE = true;

/**
 * True while telemetry must stay silent.
 *
 * A dev session sends the events of one developer, so it pollutes the table.
 * The console patch also hides the true source line of every log in the browser
 * console, which makes a debug session harder.
 */
function isDisabled(): boolean {
	return dev && !DEV_OVERRIDE;
}

let started = false;
let stopQueue: (() => void) | null = null;
let stopConsole: (() => void) | null = null;

/** The SvelteKit route id of the open page. The layout writes it on every navigation. */
let routeId: string | null = null;

/**
 * Records the open route. The layout calls this from `afterNavigate`.
 *
 * The route id carries no base path and no query string. `location.pathname`
 * carries both, and the query string holds the shared query payload.
 */
export function setRoute(route: string | null): void {
	routeId = route;
}

/**
 * Records one event.
 *
 * The call returns at once. The queue sends the event later, in a batch.
 * The function does nothing when the user switched telemetry off.
 */
export function track(name: TelemetryName, fields: TelemetryFields = {}): void {
	try {
		if (typeof window === 'undefined') return;
		if (isDisabled()) return;
		if (!getSettings().telemetryEnabled) return;

		const event: TelemetryEvent = {
			event_id: Utils.randomUUID(),
			install_id: installId(),
			session_id: sessionId(),
			studio_version: studioVersion(),
			platform: platform(),
			occurred_at: Date.now(),
			category: categoryOf(name),
			name,
			level: fields.level ?? null,
			route: fields.route ?? routeId,
			node_host: fields.nodeHost ?? null,
			query_id: fields.queryId ?? null,
			message: fields.message ?? null,
			duration_ms: Math.round(fields.durationMs ?? 0) || null,
			row_count: fields.rowCount ?? null,
			props: fields.props ?? null
		};

		enqueue(event);
	} catch {
		// A broken event must never reach the caller.
	}
}

/**
 * The identity of this client, for the feedback form.
 *
 * The two ids stay out while telemetry is off. Without them nobody can link a
 * report to the event table, which is what the opt-out asks for. The `telemetry`
 * field states which of the two cases the reader has.
 */
export function diagnostics(): Record<string, string> {
	try {
		const enabled = getSettings().telemetryEnabled;

		const fields: Record<string, string> = {
			version: studioVersion(),
			platform: platform(),
			telemetry: enabled ? 'on' : 'off'
		};

		if (enabled) {
			fields.install_id = installId();
			fields.session_id = sessionId();
		}

		return fields;
	} catch {
		return {};
	}
}

/**
 * Starts telemetry. Call this once, from the layout `onMount`.
 * Returns the stop function, so the layout can return it from `onMount`.
 *
 * A dev session starts nothing. It keeps the queue idle, and it leaves the
 * console methods untouched.
 */
export function initTelemetry(): () => void {
	if (started || isDisabled()) return () => {};

	started = true;

	try {
		stopQueue = startQueue();

		// The console patch imports this module, so load it here and not at the top.
		void import('./console').then((module) => {
			stopConsole = module.startConsoleCapture();
		});

		track('app.start', { props: { platform: platform(), version: studioVersion() } });
	} catch {
		// A failed start leaves the app untouched.
	}

	return () => {
		stopConsole?.();
		stopQueue?.();
		stopConsole = null;
		stopQueue = null;
		started = false;
	};
}

/** Drops the buffer and sends nothing more. The settings page calls this on an opt-out. */
export function stopTelemetry(): void {
	clearQueue();
}

/** Sends the buffer now. Use it before a navigation that leaves the app. */
export function flushTelemetry(): void {
	void flush();
}
