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
import { splitNodeUrl } from '@/services/beacon-node-url';
import { getSettings, settings, type SettingKey } from '@/stores/settings';
import { sessionContext } from './context';
import { forgetIdentity, installId, platform, sessionId, studioVersion } from './identity';
import { fitProps, type Props } from './props';
import { clearQueue, enqueue, flush, startQueue } from './queue';
import { categoryOf, type TelemetryEvent, type TelemetryFields, type TelemetryName } from './types';
import { Utils } from '@/utils';

export type { TelemetryFields, TelemetryName, QuerySource } from './types';
export { describeQuery } from './query-shape';
export { flush } from './queue';
export { forgetIdentity } from './identity';

/** Set this to true to send telemetry from a dev session, and to patch the console there. */
const DEV_OVERRIDE = false;

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
let stopWatch: (() => void) | null = null;
let stopErrors: (() => void) | null = null;
let stopExit: (() => void) | null = null;

/** The moment this session started, for the duration of `session.end`. */
let startedAt = 0;

/** True once `session.end` went out. The exit path can run twice. */
let ended = false;

/** What happened in this session. `session.end` reports the totals. */
const counts = { pages: 0, queries: 0, downloads: 0, visualises: 0, errors: 0, cancels: 0 };

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
 * The node of one event: a lower case origin, with no path.
 *
 * A node can run under a sub directory, and that path can name a customer.
 * The origin also keys the health store, so both sides count the same node once.
 */
function nodeHost(url: string | undefined): string | null {
	if (!url) return null;

	return splitNodeUrl(url).origin || null;
}

/**
 * The props keys that name what a user asked for: a table, a column, a filter
 * value, a drawn area, a file or a search term.
 *
 * The `telemetryQueryDetails` setting governs these keys. The counts beside them
 * stay, because `columnCount`, `filterCount` and `filterKinds` name nothing.
 */
const CONTENT_KEYS = ['table', 'columns', 'filters', 'column', 'file', 'term', 'bbox'];

/**
 * Removes the query content when the user switched that detail off.
 *
 * This is the one guard for content. It runs on every event, so a new event
 * needs no separate check. A `queryDetails` marker tells the reader that a field
 * is absent by choice, and not because an old client sent the row.
 */
function applyContentRule(props: Props | null | undefined): Props | null {
	if (!props) return null;

	if (getSettings().telemetryQueryDetails) return props;

	const kept: Props = {};

	for (const [key, value] of Object.entries(props)) {
		if (CONTENT_KEYS.includes(key)) continue;

		kept[key] = value;
	}

	kept.queryDetails = false;

	return kept;
}

/** Raises the session totals that `session.end` reports. */
function count(name: TelemetryName): void {
	if (name === 'page.view') counts.pages += 1;
	else if (name === 'query.execute') counts.queries += 1;
	else if (name === 'query.download') counts.downloads += 1;
	else if (name === 'query.visualise') counts.visualises += 1;
	else if (name === 'query.cancel') counts.cancels += 1;
	else if (name === 'query.error' || name === 'app.error' || name === 'console.error') {
		counts.errors += 1;
	}
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

		count(name);

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
			node_host: nodeHost(fields.nodeHost),
			query_id: fields.queryId ?? null,
			message: fields.message ?? null,
			duration_ms: Math.round(fields.durationMs ?? 0) || null,
			row_count: fields.rowCount ?? null,
			props: fitProps(applyContentRule(fields.props))
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
 * Reacts to a settings change, from any write path.
 *
 * The settings store sits below this module, so it cannot call telemetry itself.
 * A watcher here also covers a reset of one key and a reset of every key.
 *
 * It does two jobs: it stops telemetry on an opt-out, and it reports which
 * defaults people change. A reset of every key reports every changed key.
 */
function watchSettings(): () => void {
	let previous = getSettings();

	return settings.subscribe((value) => {
		const wasEnabled = previous.telemetryEnabled;

		for (const key of Object.keys(value) as SettingKey[]) {
			if (previous[key] === value[key]) continue;

			// An opt-out never reports itself: `track` reads the new value first.
			track('settings.change', { props: { key, value: value[key] } });
		}

		previous = value;

		if (wasEnabled && !value.telemetryEnabled) stopTelemetry();
	});
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
	startedAt = Date.now();
	ended = false;

	try {
		// This handler runs before the one of the queue, so `session.end` joins the
		// last batch. A listener runs in the order of its registration.
		stopExit = watchExit();
		stopQueue = startQueue();
		stopWatch = watchSettings();

		// Both modules import this one, so load them here and not at the top.
		void import('./console').then((module) => {
			stopConsole = module.startConsoleCapture();
		});

		void import('./errors').then((module) => {
			stopErrors = module.startErrorCapture();
		});

		track('app.start', {
			props: { platform: platform(), version: studioVersion(), ...sessionContext() }
		});
	} catch {
		// A failed start leaves the app untouched.
	}

	return () => {
		stopConsole?.();
		stopQueue?.();
		stopWatch?.();
		stopErrors?.();
		stopExit?.();
		stopConsole = null;
		stopQueue = null;
		stopWatch = null;
		stopErrors = null;
		stopExit = null;
		started = false;
	};
}

/**
 * Reports the totals of the session when the page closes.
 *
 * `pagehide` is the last moment that a handler runs. The queue sends the buffer
 * on the same event, so the totals still reach the server.
 */
function watchExit(): () => void {
	const onExit = () => {
		if (ended) return;

		ended = true;

		track('session.end', {
			durationMs: Date.now() - startedAt,
			props: { ...counts }
		});
	};

	window.addEventListener('pagehide', onExit);

	return () => window.removeEventListener('pagehide', onExit);
}

/**
 * Drops the buffer, and drops the ids of this client.
 *
 * The watcher calls this on an opt-out. The buffer goes first, so a live flush
 * cannot send an event that carries the old install id.
 */
export function stopTelemetry(): void {
	clearQueue();
	forgetIdentity();
}

/** Sends the buffer now. Use it before a navigation that leaves the app. */
export function flushTelemetry(): void {
	void flush();
}
