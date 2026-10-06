import { normalizeFolder } from './folders';

export type UploadStatus = 'waiting' | 'uploading' | 'done' | 'failed';

export interface UploadItem {
	id: number;
	/** The path inside the picked or dropped folder, or the file name. */
	relativePath: string;
	/** The destination key in the datasets store. */
	target: string;
	size: number;
	status: UploadStatus;
	uploaded: number;
	error: string;
}

export function planUpload(
	destination: string,
	files: { relativePath: string; size: number }[]
): UploadItem[] {
	const folder = normalizeFolder(destination);

	return files.map((file, index) => ({
		id: index,
		relativePath: file.relativePath,
		target: `${folder}${file.relativePath.replace(/^\/+/, '')}`,
		size: file.size,
		status: 'waiting',
		uploaded: 0,
		error: ''
	}));
}

/** Percent of all bytes sent. A done file counts whole, a failed file counts zero. */
export function uploadProgress(items: UploadItem[]): number {
	const total = items.reduce((sum, item) => sum + item.size, 0);
	if (total === 0) {
		if (items.length > 0 && items.every((item) => item.status === 'done')) return 100;
		return 0;
	}

	const sent = items.reduce((sum, item) => {
		if (item.status === 'done') return sum + item.size;
		if (item.status === 'uploading') return sum + Math.min(item.uploaded, item.size);
		return sum;
	}, 0);

	return Math.round((sent / total) * 100);
}

export function retryItems(items: UploadItem[]): UploadItem[] {
	return items.map((item) => {
		if (item.status !== 'failed') return item;
		return { ...item, status: 'waiting', uploaded: 0, error: '' };
	});
}

export function uploadSummary(items: UploadItem[]): {
	done: number;
	failed: number;
	total: number;
} {
	return {
		done: items.filter((item) => item.status === 'done').length,
		failed: items.filter((item) => item.status === 'failed').length,
		total: items.length
	};
}
