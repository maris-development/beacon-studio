import { describe, expect, it } from 'vitest';
import {
	datasetDetailQuery,
	datasetEditorSql,
	fileName,
	folderOf,
	folderParts,
	formatFromPath,
	formatSize,
	listFolder,
	parseEntries,
	previewQuery,
	searchEntries,
	sortFiles,
	type DatasetEntry
} from '../datasets';

function entry(path: string, extra: Partial<DatasetEntry> = {}): DatasetEntry {
	return { path, format: 'nc', canInspect: true, size: null, lastModified: null, ...extra };
}

const entries = [
	entry('argo/2024/a.nc'),
	entry('argo/2024/b.nc'),
	entry('argo/2023/c.nc'),
	entry('argo/index.csv', { format: 'csv' }),
	entry('top.parquet', { format: 'parquet' })
];

describe('parseEntries', () => {
	it('reads the server fields and drops bad entries', () => {
		const raw = [
			{
				file_path: 'a.nc',
				format: 'nc',
				can_inspect: true,
				size: 10,
				last_modified: '2026-01-01T00:00:00Z'
			},
			{ file_path: 'b.txt', format: 'txt', can_inspect: false },
			{ format: 'nc' },
			'junk'
		];
		expect(parseEntries(raw)).toEqual([
			{
				path: 'a.nc',
				format: 'nc',
				canInspect: true,
				size: 10,
				lastModified: '2026-01-01T00:00:00Z'
			},
			{ path: 'b.txt', format: 'txt', canInspect: false, size: null, lastModified: null }
		]);
	});

	it('gives no entries for a value of the wrong shape', () => {
		expect(parseEntries({})).toEqual([]);
	});
});

describe('listFolder', () => {
	it('lists the root', () => {
		const { folders, files } = listFolder(entries, '');
		expect(folders).toEqual([{ name: 'argo', path: 'argo/', count: 4 }]);
		expect(files.map((f) => f.path)).toEqual(['top.parquet']);
	});

	it('lists a folder with sub-folders and files', () => {
		const { folders, files } = listFolder(entries, 'argo');
		expect(folders).toEqual([
			{ name: '2023', path: 'argo/2023/', count: 1 },
			{ name: '2024', path: 'argo/2024/', count: 2 }
		]);
		expect(files.map((f) => f.path)).toEqual(['argo/index.csv']);
	});

	it('gives nothing for an unknown folder', () => {
		expect(listFolder(entries, 'nope/')).toEqual({ folders: [], files: [] });
	});
});

describe('searchEntries', () => {
	it('matches the full path in every folder, without case', () => {
		expect(searchEntries(entries, '2024/A').map((f) => f.path)).toEqual(['argo/2024/a.nc']);
	});

	it('gives every entry for an empty search', () => {
		expect(searchEntries(entries, ' ')).toHaveLength(5);
	});
});

describe('sortFiles', () => {
	const files = [
		entry('b.nc', { size: 5, lastModified: '2026-02-01T00:00:00Z' }),
		entry('a.nc', { size: null, lastModified: null }),
		entry('c.nc', { size: 50, lastModified: '2026-01-01T00:00:00Z' })
	];

	it('sorts by name', () => {
		expect(sortFiles(files, 'name', 'asc').map((f) => f.path)).toEqual(['a.nc', 'b.nc', 'c.nc']);
		expect(sortFiles(files, 'name', 'desc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
	});

	it('sorts by size and date, with unknown values last', () => {
		expect(sortFiles(files, 'size', 'desc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
		expect(sortFiles(files, 'date', 'asc').map((f) => f.path)).toEqual(['c.nc', 'b.nc', 'a.nc']);
	});
});

describe('names and paths', () => {
	it('splits a folder into parts', () => {
		expect(folderParts('argo/2024/')).toEqual([
			{ name: 'argo', path: 'argo/' },
			{ name: '2024', path: 'argo/2024/' }
		]);
		expect(folderParts('')).toEqual([]);
	});

	it('reads the name and folder of a path', () => {
		expect(fileName('argo/2024/a.nc')).toBe('a.nc');
		expect(folderOf('argo/2024/a.nc')).toBe('argo/2024/');
		expect(folderOf('top.nc')).toBe('');
	});

	it('writes a size', () => {
		expect(formatSize(null)).toBe('');
		expect(formatSize(512)).toBe('512 B');
		expect(formatSize(1536)).toBe('1.5 KB');
		expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
	});
});

describe('queries', () => {
	it('builds the preview for each format key', () => {
		expect(previewQuery(entry('a.nc'), ['n', 't'])).toEqual({
			select: [{ column: 'n' }, { column: 't' }],
			from: { netcdf: { paths: ['a.nc'] } },
			limit: 100
		});
		expect(previewQuery(entry('a.parquet', { format: 'parquet' }), ['n'], 5).from).toEqual({
			parquet: { paths: ['a.parquet'] }
		});
		expect(previewQuery(entry('x', { format: '' }), ['n']).from).toEqual({
			parquet: { paths: ['x'] }
		});
	});

	it('builds the SQL editor query with the right read function, and escapes a quote', () => {
		expect(datasetEditorSql(entry("it's.nc"))).toBe(
			"SELECT * FROM read_netcdf(['it''s.nc']) LIMIT 100"
		);
		expect(datasetEditorSql(entry('a.txt', { format: 'txt' }))).toBe(
			"SELECT * FROM read_odv_ascii(['a.txt']) LIMIT 100"
		);
		expect(datasetEditorSql(entry('a.xyz', { format: 'xyz' }))).toBe(
			"SELECT * FROM read_parquet(['a.xyz']) LIMIT 100"
		);
	});

	it('builds the detail query', () => {
		expect(datasetDetailQuery('argo/a b.nc', 'https://a.org')).toBe(
			'file=argo%2Fa+b.nc&node=https%3A%2F%2Fa.org'
		);
	});
});

describe('formatFromPath', () => {
	it('reads the format from the extension', () => {
		expect(formatFromPath('argo/a.nc')).toBe('nc');
		expect(formatFromPath('A.PARQUET')).toBe('parquet');
		expect(formatFromPath('x.tif')).toBe('tiff');
		expect(formatFromPath('noext')).toBe('');
		expect(formatFromPath('dir.v2/noext')).toBe('');
	});

	it('gives the right read function for a share link with no details', () => {
		const entry = {
			path: 'argo/a.nc',
			format: formatFromPath('argo/a.nc'),
			canInspect: true,
			size: null,
			lastModified: null
		};
		expect(datasetEditorSql(entry)).toBe("SELECT * FROM read_netcdf(['argo/a.nc']) LIMIT 100");
	});
});
