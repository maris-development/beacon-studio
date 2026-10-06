import { describe, expect, it } from 'vitest';
import { DOWNLOAD_FORMATS, downloadFileName } from '../download';

describe('downloads', () => {
	it('offers the four formats', () => {
		expect(DOWNLOAD_FORMATS.map((format) => format.label)).toEqual([
			'CSV',
			'Parquet',
			'Arrow IPC',
			'NetCDF'
		]);
	});

	it('names the file after the time', () => {
		const arrow = DOWNLOAD_FORMATS.find((format) => format.label === 'Arrow IPC')!;
		expect(downloadFileName(arrow, new Date('2026-10-06T11:44:05.123Z'))).toBe(
			'query-2026-10-06T11-44-05.arrow'
		);
	});
});
