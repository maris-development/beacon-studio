import { describe, expect, it, vi } from 'vitest';
import type { CatalogsView } from '@maris-development/beacon-client';
import { CatalogCache, buildTree, filterTree, parseSchema, stringifyType } from '../catalog';

const view: CatalogsView = {
	default_catalog: 'beacon',
	default_schema: 'public',
	catalogs: [
		{
			name: 'remote',
			schemas: [{ name: 'main', tables: [{ name: 'r1', table_type: 'BASE TABLE' }] }]
		},
		{
			name: 'beacon',
			schemas: [
				{ name: 'system', tables: [{ name: 'jobs', table_type: 'VIEW' }] },
				{ name: 'zeta', tables: [{ name: 'z1', table_type: 'BASE TABLE' }] },
				{
					name: 'public',
					tables: [
						{ name: 'argo', table_type: 'BASE TABLE' },
						{ name: 'wod', table_type: 'BASE TABLE' }
					]
				}
			]
		}
	]
};

describe('buildTree', () => {
	it('puts the default catalog and schema first, system schemas last', () => {
		const tree = buildTree(view);
		expect(tree.defaults).toEqual({ catalog: 'beacon', schema: 'public' });
		expect(tree.catalogs.map((c) => c.name)).toEqual(['beacon', 'remote']);
		expect(tree.catalogs[0].schemas.map((s) => s.name)).toEqual(['public', 'zeta', 'system']);
	});
});

describe('filterTree', () => {
	const tree = buildTree(view);

	it('keeps everything for an empty filter', () => {
		expect(filterTree(tree, '  ')).toBe(tree);
	});

	it('keeps matching tables only', () => {
		const result = filterTree(tree, 'arg');
		expect(result.catalogs).toHaveLength(1);
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['argo']);
	});

	it('keeps a whole schema when its name matches', () => {
		const result = filterTree(tree, 'zeta');
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['z1']);
	});

	it('keeps a table when a loaded column matches', () => {
		const columnsOf = (ref: { name: string }) => {
			if (ref.name === 'wod') return [{ name: 'salinity', dataType: 'Float64' }];
			return undefined;
		};
		const result = filterTree(tree, 'salin', columnsOf);
		expect(result.catalogs[0].schemas[0].tables.map((t) => t.name)).toEqual(['wod']);
	});
});

describe('parseSchema', () => {
	it('reads fields with simple and nested types', () => {
		const schema = {
			fields: [
				{ name: 'depth', data_type: 'Float64' },
				{ name: 'time', data_type: { Timestamp: ['Millisecond', null] } },
				{ name: 'tags', data_type: { List: { name: 'item', data_type: 'Utf8' } } },
				{ name: 'price', data_type: { Decimal128: [10, 2] } },
				{ data_type: 'Utf8' }
			]
		};
		expect(parseSchema(schema)).toEqual([
			{ name: 'depth', dataType: 'Float64' },
			{ name: 'time', dataType: 'Timestamp(Millisecond)' },
			{ name: 'tags', dataType: 'List<Utf8>' },
			{ name: 'price', dataType: 'Decimal128(10, 2)' }
		]);
	});

	it('gives no columns for a value of the wrong shape', () => {
		expect(parseSchema(null)).toEqual([]);
		expect(parseSchema({ nope: 1 })).toEqual([]);
	});

	it('writes an unknown type as JSON', () => {
		expect(stringifyType({ A: 1, B: 2 })).toBe('{"A":1,"B":2}');
	});
});

describe('CatalogCache', () => {
	function source() {
		return {
			catalogs: vi.fn().mockResolvedValue(view),
			tableSchema: vi.fn().mockResolvedValue({ fields: [{ name: 'depth', data_type: 'Float64' }] })
		};
	}
	const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };

	it('loads the tree one time for each node URL', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.tree('https://a', src);
		await cache.tree('https://a', src);
		await cache.tree('https://b', src);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('loads again on refresh', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.tree('https://a', src);
		await cache.tree('https://a', src, true);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('loads the columns of one table one time, and lists them', async () => {
		const cache = new CatalogCache();
		const src = source();
		await Promise.all([
			cache.columnsOf('https://a', src, argo),
			cache.columnsOf('https://a', src, argo)
		]);
		expect(src.tableSchema).toHaveBeenCalledTimes(1);
		expect(src.tableSchema).toHaveBeenCalledWith('argo', { catalog: 'beacon', schema: 'public' });
		expect(cache.loadedColumns('https://a')).toEqual([
			{ ref: argo, columns: [{ name: 'depth', dataType: 'Float64' }] }
		]);
		expect(cache.loadedColumns('https://b')).toEqual([]);
	});

	it('forgets a failed load, so a second try calls the server again', async () => {
		const cache = new CatalogCache();
		const src = source();
		src.catalogs.mockRejectedValueOnce(new Error('down'));
		await expect(cache.tree('https://a', src)).rejects.toThrow('down');
		await cache.tree('https://a', src);
		expect(src.catalogs).toHaveBeenCalledTimes(2);
	});

	it('clears one node only', async () => {
		const cache = new CatalogCache();
		const src = source();
		await cache.columnsOf('https://a', src, argo);
		await cache.columnsOf('https://b', src, argo);
		cache.clear('https://a');
		expect(cache.loadedColumns('https://a')).toEqual([]);
		expect(cache.loadedColumns('https://b')).toHaveLength(1);
	});
});
