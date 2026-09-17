import { openUrl } from '@tauri-apps/plugin-opener';
import { getCurrentNode } from '@/services/beacon-node';
import { diagnostics } from '@/telemetry';

const FEEDBACK_URL = 'https://beacon-datalake.org/studio-feedback';

/**
 * The form URL, with the state of this client in the query string.
 *
 * The website reads these parameters once, at the GET of the page, and puts
 * them in the hidden `extra` field. They reach the e-mail on submit.
 *
 * Send the route id, never `location.href`: the query string of a Studio page
 * holds the whole shared query payload.
 *
 * Send the node URL, never the node record: a record can hold a bearer token.
 */
export function buildFeedbackUrl(routeId: string | null): string {
	const url = new URL(FEEDBACK_URL);

	if (typeof window === 'undefined') return url.toString();

	const node = getCurrentNode();

	const fields: Record<string, string | null | undefined> = {
		...diagnostics(),
		route: routeId,
		node: node?.url,
		node_status: node?.status,
		viewport: `${window.innerWidth}x${window.innerHeight}`,
		locale: navigator.language,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
	};

	for (const [key, value] of Object.entries(fields)) {
		if (value) url.searchParams.set(key, value);
	}

	return url.toString();
}

/** Opens the form in the system browser, or in a new tab outside Tauri. */
export async function openFeedback(routeId: string | null): Promise<void> {
	const url = buildFeedbackUrl(routeId);

	try {
		await openUrl(url);
	} catch {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
}
