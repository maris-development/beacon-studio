// TEMPORARY: SDK `admin.runCrawler()` returns void and drops the crawl report. Delete this file when the SDK returns it.

import { ApiError, ConnectionError, basicAuthHeader } from '@maris-development/beacon-client';

export interface CrawlReport {
	crawler: string;
	/** Candidate tables found. */
	discovered: number;
	created: string[];
	updated: string[];
	/** Tables that this crawler does not own. */
	skipped: string[];
	/** Table name and the reason. */
	failed: [string, string][];
	/** Files that matched no format. */
	skippedFiles: number;
}

function names(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
}

function count(value: unknown): number {
	if (typeof value === 'number') return value;
	return 0;
}

export function parseCrawlReport(raw: unknown): CrawlReport {
	const record = (raw ?? {}) as Record<string, unknown>;

	let failed: [string, string][] = [];
	if (Array.isArray(record.failed)) {
		failed = record.failed
			.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2)
			.map((pair) => [String(pair[0]), String(pair[1])]);
	}

	let crawler = '';
	if (typeof record.crawler === 'string') crawler = record.crawler;

	return {
		crawler,
		discovered: count(record.discovered),
		created: names(record.created),
		updated: names(record.updated),
		skipped: names(record.skipped),
		failed,
		skippedFiles: count(record.skipped_files)
	};
}

// The server sends an error as a JSON string. The SDK decodes it the same way.
function decodeBody(text: string): string {
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed === 'string') return parsed;
	} catch {
		// Plain text body.
	}
	return text;
}

export async function runCrawlerReport(
	baseUrl: string,
	credentials: { username: string; password: string },
	name: string,
	fetchImpl: typeof fetch = fetch
): Promise<CrawlReport> {
	const url = `${baseUrl}/api/admin/crawlers/${encodeURIComponent(name)}/run`;

	let response: Response;
	try {
		response = await fetchImpl(url, {
			method: 'POST',
			headers: { Authorization: basicAuthHeader(credentials.username, credentials.password) }
		});
	} catch (cause) {
		throw new ConnectionError(url, cause);
	}

	const text = await response.text();
	if (!response.ok) throw new ApiError(response.status, decodeBody(text), url);

	return parseCrawlReport(JSON.parse(text));
}
