import { describe, expect, it, vi } from 'vitest';
import { ApiError, ConnectionError } from '@maris-development/beacon-client';
import { parseCrawlReport, runCrawlerReport } from '../crawler-run';

const credentials = { username: 'alice', password: 'pw' };

const report = {
	crawler: 'argo',
	discovered: 3,
	created: ['argo_2024'],
	updated: ['argo_2023'],
	skipped: ['manual'],
	failed: [['argo_bad', 'unknown format']],
	skipped_files: 4
};

function respond(status: number, body: string) {
	return vi.fn().mockResolvedValue(new Response(body, { status }));
}

describe('parseCrawlReport', () => {
	it('reads the server report', () => {
		expect(parseCrawlReport(report)).toEqual({
			crawler: 'argo',
			discovered: 3,
			created: ['argo_2024'],
			updated: ['argo_2023'],
			skipped: ['manual'],
			failed: [['argo_bad', 'unknown format']],
			skippedFiles: 4
		});
	});

	it('fills gaps with empty values', () => {
		expect(parseCrawlReport({ crawler: 'x', failed: [['a']] })).toEqual({
			crawler: 'x',
			discovered: 0,
			created: [],
			updated: [],
			skipped: [],
			failed: [],
			skippedFiles: 0
		});
	});
});

describe('runCrawlerReport', () => {
	it('posts with Basic auth to the run endpoint, and returns the report', async () => {
		const fetchImpl = respond(200, JSON.stringify(report));

		const result = await runCrawlerReport('https://a.org', credentials, 'my crawler', fetchImpl);

		expect(result.created).toEqual(['argo_2024']);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://a.org/api/admin/crawlers/my%20crawler/run');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toMatch(/^Basic /);
	});

	it('throws ApiError with the decoded body on a 400', async () => {
		const fetchImpl = respond(400, JSON.stringify('crawl produced no report'));

		const error = await runCrawlerReport('https://a.org', credentials, 'x', fetchImpl).catch(
			(e) => e
		);

		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(400);
		expect(error.body).toBe('crawl produced no report');
	});

	it('throws ApiError on a 401, so withAdmin asks for a sign-in', async () => {
		const error = await runCrawlerReport('https://a.org', credentials, 'x', respond(401, '')).catch(
			(e) => e
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(401);
	});

	it('throws ConnectionError when the node cannot be reached', async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		const error = await runCrawlerReport('https://a.org', credentials, 'x', fetchImpl).catch(
			(e) => e
		);
		expect(error).toBeInstanceOf(ConnectionError);
	});

	it('gives a readable error for an empty success body', async () => {
		await expect(
			runCrawlerReport('https://a.org', credentials, 'x', respond(200, ''))
		).rejects.toThrow('The Beacon node sent no run report.');
	});
});
