/**
 * The facts about one client that the server cannot read from the request.
 *
 * The browser, the operating system and the origin already land in their own
 * columns, because the server writes them from the request headers. They stay
 * out of here.
 *
 * The object goes into the props of `app.start`, once per session.
 */

/** The version of the event payload. Raise it when a props key changes meaning. */
export const SCHEMA_VERSION = 1;

interface NetworkInformation {
	effectiveType?: string;
	downlink?: number;
	saveData?: boolean;
}

function connection(): NetworkInformation | undefined {
	const value = (navigator as unknown as { connection?: NetworkInformation }).connection;

	if (!value || typeof value !== 'object') return undefined;

	return value;
}

/** True when the app runs from the home screen, without browser chrome. */
function standalone(): boolean {
	try {
		return window.matchMedia('(display-mode: standalone)').matches;
	} catch {
		return false;
	}
}

/** The colour scheme that the system asks for. */
function colorScheme(): string {
	try {
		if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';

		return 'light';
	} catch {
		return 'unknown';
	}
}

/** Reads the session context. It never throws, and it returns what it can read. */
export function sessionContext(): Record<string, unknown> {
	try {
		const network = connection();

		return {
			_v: SCHEMA_VERSION,
			viewport: `${window.innerWidth}x${window.innerHeight}`,
			screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
			dpr: Math.round((window.devicePixelRatio ?? 1) * 100) / 100,
			locale: navigator.language,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			cores: navigator.hardwareConcurrency ?? null,
			memoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
			network: network?.effectiveType ?? null,
			saveData: network?.saveData ?? null,
			standalone: standalone(),
			colorScheme: colorScheme()
		};
	} catch {
		return { _v: SCHEMA_VERSION };
	}
}
