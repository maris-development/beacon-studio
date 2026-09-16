/**
 * Reports console output as telemetry.
 *
 * `warn` and `error` are always on. A developer writes those for a fault, and a
 * fault is what the report needs.
 *
 * `log` is off by default, behind the `telemetryConsoleLog` setting. Two reasons:
 * the patch also catches MapLibre, deck.gl, Monaco and Arrow, which log per frame;
 * and a log line carries whole objects, so it can hold a query or a file name that
 * nobody meant to send.
 *
 * The patch always calls the original method first. The developer console must
 * stay correct.
 */

import { getSettings } from '@/stores/settings';
import { track } from './index';
import type { ConsoleName, TelemetryLevel } from './types';

/** The length of one reported message. The server cuts at 500 characters. */
const MAX_MESSAGE = 500;

/** Stops a loop when the telemetry code itself logs. */
let inside = false;

type ConsoleMethod = 'log' | 'warn' | 'error';

const originals: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

/** Turns the arguments of one console call into one short string. */
function toMessage(args: unknown[]): string {
	const parts = args.map((arg) => {
		if (typeof arg === 'string') return arg;

		if (arg instanceof Error) return `${arg.name}: ${arg.message}`;

		if (arg === null) return 'null';

		if (typeof arg !== 'object') return String(arg);

		try {
			return JSON.stringify(arg) ?? '[object]';
		} catch {
			// A circular object or a large Arrow table cannot be encoded.
			return '[object]';
		}
	});

	return parts.join(' ').slice(0, MAX_MESSAGE);
}

function patch(method: ConsoleMethod, name: ConsoleName, level: TelemetryLevel): void {
	const original = console[method].bind(console);
	originals[method] = original;

	console[method] = (...args: unknown[]) => {
		original(...args);

		if (inside) return;

		if (method === 'log' && !getSettings().telemetryConsoleLog) return;

		inside = true;

		try {
			track(name, { level, message: toMessage(args) });
		} catch {
			// Telemetry must never break a log call.
		} finally {
			inside = false;
		}
	};
}

/** Wraps the console methods. Returns the function that puts the originals back. */
export function startConsoleCapture(): () => void {
	patch('warn', 'console.warn', 'warn');
	patch('error', 'console.error', 'error');
	patch('log', 'console.log', 'log');

	return () => {
		for (const [method, original] of Object.entries(originals)) {
			console[method as ConsoleMethod] = original;
		}
	};
}
