/**
 * The telemetry endpoints, and the short-lived session token.
 *
 * Studio is open source, so it can hold no secret. The token proves nothing about
 * the caller. It forces one round trip per session, it expires, and a rotation of
 * the server secret revokes every live token. The rate limit on the server does
 * the real work.
 *
 * The endpoints live on the website. Every build posts to the absolute URL.
 */

const API_BASE = 'https://beacon-datalake.org/api/telemetry';
// const API_BASE = 'http://beacon-datalake/api/telemetry';

export function collectUrl(): string {
	return API_BASE;
}

export function sessionUrl(): string {
	return `${API_BASE}/session`;
}

/** The live token, and the moment it stops working. */
let token: string | null = null;
let expiresAt = 0;

/** One in-flight mint. A burst of events must not mint several tokens. */
let pending: Promise<string | null> | null = null;

/** Renew this many milliseconds before the server expiry, so a slow batch still passes. */
const RENEW_MARGIN_MS = 60_000;

/**
 * Returns a usable token, or null when the server refuses.
 * A null result means the caller drops the batch. Telemetry never blocks the app.
 */
export async function getToken(): Promise<string | null> {
	if (token && Date.now() < expiresAt - RENEW_MARGIN_MS) {
		return token;
	}

	if (pending) return pending;

	pending = mint().finally(() => {
		pending = null;
	});

	return pending;
}

/** Drops the token. The queue calls this on a 401 and then tries once more. */
export function clearToken(): void {
	token = null;
	expiresAt = 0;
}

async function mint(): Promise<string | null> {
	try {
		const response = await fetch(sessionUrl(), {
			method: 'POST',
			credentials: 'omit'
		});

		if (!response.ok) return null;

		const body = (await response.json()) as { token?: string; expires_in?: number };

		if (!body.token) return null;

		token = body.token;
		expiresAt = Date.now() + (body.expires_in ?? 0) * 1000;

		return token;
	} catch {
		// The website can be unreachable. Telemetry stays silent.
		return null;
	}
}
