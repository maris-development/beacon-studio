import type { SimpleOutputFormat } from '@maris-development/beacon-client';

export interface DownloadFormat {
	label: string;
	format: SimpleOutputFormat;
	extension: string;
}

export const DOWNLOAD_FORMATS: DownloadFormat[] = [
	{ label: 'CSV', format: 'csv', extension: 'csv' },
	{ label: 'Parquet', format: 'parquet', extension: 'parquet' },
	{ label: 'Arrow IPC', format: 'ipc', extension: 'arrow' },
	{ label: 'NetCDF', format: 'netcdf', extension: 'nc' }
];

export function downloadFileName(format: DownloadFormat, now: Date): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
	return `query-${stamp}.${format.extension}`;
}
