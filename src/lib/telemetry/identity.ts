/**
 * The identity and the build of one Studio client.
 *
 * `installId` lives in localStorage and links the sessions of one browser.
 * `sessionId` lives in sessionStorage and dies with the tab.
 *
 * Neither id holds a name, an email or an account. Both are random. They are
 * pseudonymous, not anonymous: one installId groups the events of one browser.
 *
 * Every read catches. A private window, a cleared site list and a browser that
 * blocks site data all throw. Telemetry then falls back to a value that lives
 * in memory only, and the app keeps working.
 */

import { GIT_COMMIT_SHORT } from '@/build-info';
import type { TelemetryPlatform } from './types';
import { Utils } from '@/utils';

const INSTALL_KEY = 'beacon-studio.telemetry.install-id';
const SESSION_KEY = 'beacon-studio.telemetry.session-id';

let memoryInstallId: string | null = null;
let memorySessionId: string | null = null;

function readOrCreate(storage: Storage | undefined, key: string): string | null {
	if (!storage) return null;

	try {
		const existing = storage.getItem(key);

		if (existing) return existing;

		const created = Utils.randomUUID();
		storage.setItem(key, created);

		return created;
	} catch {
		return null;
	}
}

/** The id of this browser. It survives a reload and a restart. */
export function installId(): string {
	if (memoryInstallId) return memoryInstallId;

	const stored = readOrCreate(globalThis.localStorage, INSTALL_KEY);
	memoryInstallId = stored ?? Utils.randomUUID();

	return memoryInstallId;
}

/** The id of this tab. It dies when the tab closes. */
export function sessionId(): string {
	if (memorySessionId) return memorySessionId;

	const stored = readOrCreate(globalThis.sessionStorage, SESSION_KEY);
	memorySessionId = stored ?? Utils.randomUUID();

	return memorySessionId;
}

/** True inside the Tauri desktop app. */
export function isTauri(): boolean {
	return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function platform(): TelemetryPlatform {
	if (isTauri()) return 'desktop';
	return 'web';
}

/** The short git commit of this build. */
export function studioVersion(): string {
	return GIT_COMMIT_SHORT || 'unknown';
}

/** Drops every id from storage. The settings page calls this when a user switches telemetry off. */
export function forgetIdentity(): void {
	memoryInstallId = null;
	memorySessionId = null;

	try {
		globalThis.localStorage?.removeItem(INSTALL_KEY);
		globalThis.sessionStorage?.removeItem(SESSION_KEY);
	} catch {
		// A browser that blocks site data has nothing to remove.
	}
}
