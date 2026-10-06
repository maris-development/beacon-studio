import { describe, expect, it } from 'vitest';
import { allFolders, normalizeFolder } from '../folders';

describe('normalizeFolder', () => {
	it('gives the root as an empty string', () => {
		expect(normalizeFolder('')).toBe('');
		expect(normalizeFolder(' / ')).toBe('');
	});

	it('trims, removes the leading slash and repeats, and ends with a slash', () => {
		expect(normalizeFolder(' /argo//2024 ')).toBe('argo/2024/');
		expect(normalizeFolder('argo/')).toBe('argo/');
	});
});

describe('allFolders', () => {
	it('lists every folder at every depth, once, sorted', () => {
		const paths = [
			'argo/2024/a.nc',
			'argo/2024/b.nc',
			'argo/2023/c.nc',
			'top.parquet',
			'wod/x/y/z.csv'
		];
		expect(allFolders(paths)).toEqual([
			'argo/',
			'argo/2023/',
			'argo/2024/',
			'wod/',
			'wod/x/',
			'wod/x/y/'
		]);
	});

	it('gives no folders for files in the root only', () => {
		expect(allFolders(['a.nc'])).toEqual([]);
	});
});
