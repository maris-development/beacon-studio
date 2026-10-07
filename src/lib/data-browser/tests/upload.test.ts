import { describe, expect, it } from 'vitest';
import {
	isHiddenPath,
	planUpload,
	resumeItems,
	retarget,
	retryItems,
	uploadProgress,
	uploadSummary
} from '../upload';

describe('stop, resume and retarget', () => {
	const base = planUpload('a/', [
		{ relativePath: 'x.nc', size: 1 },
		{ relativePath: 'y.nc', size: 1 },
		{ relativePath: 'z.nc', size: 1 }
	]);
	const mixed = [
		{ ...base[0], status: 'done' as const },
		{ ...base[1], status: 'stopped' as const },
		{ ...base[2], status: 'failed' as const, error: 'boom' }
	];

	it('retries failed items only', () => {
		expect(retryItems(mixed).map((item) => item.status)).toEqual(['done', 'stopped', 'waiting']);
	});

	it('resumes stopped items only', () => {
		expect(resumeItems(mixed).map((item) => item.status)).toEqual(['done', 'waiting', 'failed']);
	});

	it('keeps the target of a done item when the destination changes', () => {
		expect(retarget(mixed, 'b').map((item) => item.target)).toEqual(['a/x.nc', 'b/y.nc', 'b/z.nc']);
	});
});

describe('isHiddenPath', () => {
	it('finds a hidden file or a file in a hidden folder', () => {
		expect(isHiddenPath('.DS_Store')).toBe(true);
		expect(isHiddenPath('data/.git/config')).toBe(true);
		expect(isHiddenPath('data/a.nc')).toBe(false);
	});
});

describe('planUpload', () => {
	it('puts each file under the normalized destination, with its folder path', () => {
		const items = planUpload(' /argo//2024', [
			{ relativePath: 'a.nc', size: 10 },
			{ relativePath: 'sub/b.nc', size: 20 }
		]);
		expect(items.map((item) => item.target)).toEqual(['argo/2024/a.nc', 'argo/2024/sub/b.nc']);
		expect(items.every((item) => item.status === 'waiting' && item.uploaded === 0)).toBe(true);
		expect(new Set(items.map((item) => item.id)).size).toBe(2);
	});

	it('uploads to the root for an empty destination', () => {
		expect(planUpload('', [{ relativePath: 'a.nc', size: 1 }])[0].target).toBe('a.nc');
	});

	it('removes a leading slash from a relative path', () => {
		expect(planUpload('x/', [{ relativePath: '/a.nc', size: 1 }])[0].target).toBe('x/a.nc');
	});
});

describe('progress', () => {
	const items = planUpload('', [
		{ relativePath: 'a', size: 100 },
		{ relativePath: 'b', size: 300 }
	]);

	it('weights by bytes, and counts a done file whole', () => {
		const next = [
			{ ...items[0], status: 'done' as const, uploaded: 100 },
			{ ...items[1], status: 'uploading' as const, uploaded: 100 }
		];
		expect(uploadProgress(next)).toBe(50);
	});

	it('gives 0 for no bytes and 100 when all are done', () => {
		expect(uploadProgress([])).toBe(0);
		expect(uploadProgress(items.map((item) => ({ ...item, status: 'done' as const })))).toBe(100);
	});

	it('counts a failed file as not sent', () => {
		const next = [
			{ ...items[0], status: 'failed' as const, uploaded: 50 },
			{ ...items[1], status: 'done' as const, uploaded: 300 }
		];
		expect(uploadProgress(next)).toBe(75);
	});
});

describe('retry and summary', () => {
	it('puts only failed items back to waiting', () => {
		const items = planUpload('', [
			{ relativePath: 'a', size: 1 },
			{ relativePath: 'b', size: 1 }
		]);
		const next = retryItems([
			{ ...items[0], status: 'done', uploaded: 1 },
			{ ...items[1], status: 'failed', uploaded: 0, error: 'exists' }
		]);
		expect(next.map((item) => item.status)).toEqual(['done', 'waiting']);
		expect(next[1].error).toBe('');
	});

	it('counts done and failed', () => {
		const items = planUpload('', [
			{ relativePath: 'a', size: 1 },
			{ relativePath: 'b', size: 1 },
			{ relativePath: 'c', size: 1 }
		]);
		const next = [
			{ ...items[0], status: 'done' as const },
			{ ...items[1], status: 'failed' as const },
			items[2]
		];
		expect(uploadSummary(next)).toEqual({ done: 1, failed: 1, total: 3 });
	});
});
