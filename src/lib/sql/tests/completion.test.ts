import { describe, expect, it } from 'vitest';
import { buildTree } from '../catalog';
import { MAX_COLUMN_ENTRIES, buildCompletions, fnSignature, parseFunctions } from '../completion';

const tree = buildTree({
	default_catalog: 'beacon',
	default_schema: 'public',
	catalogs: [
		{
			name: 'beacon',
			schemas: [
				{ name: 'public', tables: [{ name: 'argo', table_type: 'BASE TABLE' }] },
				{ name: 'system', tables: [{ name: 'jobs', table_type: 'VIEW' }] }
			]
		}
	]
});

const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };

describe('parseFunctions', () => {
	it('reads names, docs and params, drops bad entries and repeats, and sorts', () => {
		const raw = [
			{
				function_name: 'lower',
				description: 'Lower case.',
				return_type: 'Utf8',
				params: [{ name: 's', data_type: 'Utf8' }]
			},
			{ name: 'abs' },
			{ name: 'abs' },
			{ nope: true },
			'junk'
		];
		const parsed = parseFunctions(raw);
		expect(parsed.map((fn) => fn.name)).toEqual(['abs', 'lower']);
		expect(fnSignature(parsed[1])).toBe('lower(s: Utf8) → Utf8');
	});

	it('gives no functions for a value of the wrong shape', () => {
		expect(parseFunctions({})).toEqual([]);
	});
});

describe('buildCompletions', () => {
	it('gives a bare name in the default schema and a qualified name elsewhere', () => {
		const tables = buildCompletions({ tree, functions: [], columns: [] }).filter(
			(entry) => entry.kind === 'table'
		);
		expect(tables.map((entry) => entry.insertText)).toEqual(['argo', 'beacon.system.jobs']);
	});

	it('inserts a function as a snippet', () => {
		const entries = buildCompletions({
			tree: null,
			functions: [{ name: 'abs', params: [] }],
			columns: []
		});
		expect(entries.find((entry) => entry.kind === 'function')).toMatchObject({
			label: 'abs',
			insertText: 'abs($0)',
			snippet: true
		});
	});

	it('gives loaded columns, quoted when needed, with no repeats', () => {
		const entries = buildCompletions({
			tree,
			functions: [],
			columns: [
				{
					ref: argo,
					columns: [
						{ name: 'depth', dataType: 'Float64' },
						{ name: 'Temp', dataType: 'Float32' }
					]
				},
				{ ref: { ...argo, name: 'wod' }, columns: [{ name: 'depth', dataType: 'Float64' }] }
			]
		});
		const columns = entries.filter((entry) => entry.kind === 'column');
		expect(columns.map((entry) => entry.insertText)).toEqual(['depth', '"Temp"']);
		expect(columns[0].detail).toBe('argo: Float64');
	});

	it('stops at the column cap', () => {
		const many = Array.from({ length: MAX_COLUMN_ENTRIES + 10 }, (_, i) => ({
			name: `c${i}`,
			dataType: 'Int32'
		}));
		const entries = buildCompletions({
			tree: null,
			functions: [],
			columns: [{ ref: argo, columns: many }]
		});
		expect(entries.filter((entry) => entry.kind === 'column')).toHaveLength(MAX_COLUMN_ENTRIES);
	});

	it('always gives the keywords', () => {
		const entries = buildCompletions({ tree: null, functions: [], columns: [] });
		expect(entries.some((entry) => entry.kind === 'keyword' && entry.label === 'SELECT')).toBe(
			true
		);
	});
});
