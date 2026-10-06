/**
 * The telemetry buffer and its transport.
 *
 * Events go into memory. The queue flushes on a size trigger, on a timer, and
 * when the page hides. Nothing here blocks the app, and nothing here throws.
 * A failure drops the batch. Telemetry is never worth a broken page.
 *
 * The queue never calls `addToast`. A toast raises a `toast.*` event, and that
 * event would raise another toast on the next failure.
 */

import { clearToken, collectUrl, getToken } from './session';
import type { TelemetryBatch, TelemetryEvent } from './types';

/** Flush when the buffer reaches this size. It matches the server batch limit. */
const FLUSH_AT_EVENTS = 20;

/** Flush at least this often, in milliseconds. */
const FLUSH_INTERVAL_MS = 15_000;

/** The server refuses a batch above 50 events. */
const MAX_EVENTS_PER_BATCH = 50;

/** Drop the oldest events above this size. A stuck server must not fill memory. */
const MAX_BUFFER = 200;

/**
 * The size of one request body, in bytes. It stays below the server cap of
 * 262144. A query shape makes one event large, so an event count alone is not
 * enough: 50 rich events pass the cap, and the server then answers 413.
 */
const MAX_BODY_BYTES = 200_000;

/**
 * The size of one body on unload, in bytes. A browser refuses a `keepalive`
 * request above its own quota, which the Fetch standard sets at 65536 bytes for
 * every keepalive request together. This budget stays below it.
 */
const MAX_KEEPALIVE_BYTES = 50_000;

/** Stop for this long after a 429, in milliseconds. */
const RATE_LIMIT_PAUSE_MS = 300_000;

let buffer: TelemetryEvent[] = [];

/** Counts the clears. A flush that started before a clear must not restore its batch. */
let epoch = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let pausedUntil = 0;
let sending = false;

/** The encoded size of one event, in bytes. */
function byteSize(event: TelemetryEvent): number {
	try {
		return new TextEncoder().encode(JSON.stringify(event)).length;
	} catch {
		return 0;
	}
}

/**
 * Takes the next batch off the front of the buffer.
 *
 * The batch stops at the event count and at the byte budget. It always holds at
 * least one event, so a single large event can never block the queue.
 */
function takeBatch(): TelemetryEvent[] {
	let bytes = 0;
	let count = 0;

	// The body holds the events plus the wrapper, so start above zero.
	const overhead = 16;

	while (count < buffer.length && count < MAX_EVENTS_PER_BATCH) {
		const size = byteSize(buffer[count]) + 1;

		if (count > 0 && bytes + size + overhead > MAX_BODY_BYTES) break;

		bytes += size;
		count += 1;
	}

	return buffer.splice(0, count);
}

/**
 * Takes the last events of the buffer, inside the unload budget.
 *
 * The unload budget holds fewer events than the buffer can. The newest events
 * therefore go first, so `session.end` is always in the batch. The rest stays in
 * the buffer: a hidden tab that comes back sends it later, and the server orders
 * every row on `occurred_at`.
 */
function takeTail(budget: number): TelemetryEvent[] {
	let bytes = 0;
	let count = 0;

	// The body holds the events plus the wrapper, so start above zero.
	const overhead = 16;

	while (count < buffer.length && count < MAX_EVENTS_PER_BATCH) {
		const size = byteSize(buffer[buffer.length - 1 - count]) + 1;

		if (count > 0 && bytes + size + overhead > budget) break;

		bytes += size;
		count += 1;
	}

	return buffer.splice(buffer.length - count, count);
}

/** Adds one event to the buffer, and flushes when the buffer is full. */
export function enqueue(event: TelemetryEvent): void {
	buffer.push(event);

	if (buffer.length > MAX_BUFFER) {
		buffer = buffer.slice(-MAX_BUFFER);
	}

	if (buffer.length >= FLUSH_AT_EVENTS) {
		void flush();
	}
}

/** Sends the buffer. A second call while a send runs does nothing. */
export async function flush(): Promise<void> {
	if (sending || buffer.length === 0 || Date.now() < pausedUntil) return;

	sending = true;

	try {
		const startEpoch = epoch;
		const events = takeBatch();
		const sent = await post(events);

		// A refused batch goes back to the front, so the next flush tries again.
		// An opt-out during the send drops it instead.
		if (!sent && epoch === startEpoch) {
			buffer = [...events, ...buffer].slice(-MAX_BUFFER);
		}
	} finally {
		sending = false;
	}
}

/**
 * Sends the buffer while the page closes.
 *
 * `sendBeacon` survives the unload, but it sets no header, so it carries no token.
 * The server rejects it. Therefore this uses `fetch` with `keepalive`, which does
 * send headers and also survives the unload.
 */
export function flushOnHide(): void {
	if (buffer.length === 0 || Date.now() < pausedUntil) return;

	const events = takeTail(MAX_KEEPALIVE_BYTES);

	void post(events, true);
}

/** Starts the flush timer and the page handlers. Returns the stop function. */
export function startQueue(): () => void {
	timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

	const onHide = () => {
		if (document.visibilityState === 'hidden') flushOnHide();
	};

	document.addEventListener('visibilitychange', onHide);
	window.addEventListener('pagehide', flushOnHide);

	return () => {
		if (timer) clearInterval(timer);
		timer = null;
		document.removeEventListener('visibilitychange', onHide);
		window.removeEventListener('pagehide', flushOnHide);
	};
}

/** Drops every buffered event. The settings page calls this when a user switches telemetry off. */
export function clearQueue(): void {
	buffer = [];
	epoch += 1;
}

/** Posts one batch. Returns true when the server accepted it, or when it is not worth a retry. */
async function post(events: TelemetryEvent[], keepalive = false): Promise<boolean> {
	const token = await getToken();

	if (!token) return false;

	const batch: TelemetryBatch = { events };

	try {
		const response = await fetch(collectUrl(), {
			method: 'POST',
			credentials: 'omit',
			keepalive,
			headers: {
				'Content-Type': 'application/json',
				'X-Telemetry-Token': token
			},
			body: JSON.stringify(batch)
		});

		if (response.status === 429) {
			pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
			return true;
		}

		// The token expired. Mint a new one and let the next flush send the batch.
		if (response.status === 401) {
			clearToken();
			return false;
		}

		// A 400 or a 413 means the batch itself is wrong. A retry sends the same
		// bad batch, so drop it.
		if (response.status === 400 || response.status === 413) {
			return true;
		}

		return response.ok;
	} catch {
		return false;
	}
}
