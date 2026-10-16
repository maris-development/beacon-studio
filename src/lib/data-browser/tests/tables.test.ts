import { describe, expect, it } from 'vitest';
import { buildTree } from '@/sql/catalog';
import {
	canManage,
	createViewSql,
	dropSql,
	editorSql,
	previewSql,
	refreshSql,
	splitTree,
	tableDetailQuery,
	tableKind
} from '../tables';

const defaults = { catalog: 'beacon', schema: 'public' };
const argo = { catalog: 'beacon', schema: 'public', name: 'argo' };
const odd = { catalog: 'beacon', schema: 'public', name: 'My "Table"' };
const jobs = { catalog: 'beacon', schema: 'system', name: 'jobs' };

describe('table statements', () => {
	it('builds the preview with a bare name in the default schema', () => {
		expect(previewSql(argo, defaults)).toBe('SELECT * FROM argo LIMIT 100');
	});

	it('quotes an odd name and qualifies another schema', () => {
		expect(previewSql(odd, defaults, 5)).toBe('SELECT * FROM "My ""Table""" LIMIT 5');
		expect(previewSql(jobs, defaults)).toBe('SELECT * FROM beacon.system.jobs LIMIT 100');
	});

	it('builds the SQL editor query, refresh and drop', () => {
		expect(editorSql(odd, defaults)).toBe('SELECT * FROM "My ""Table""" LIMIT 100');
		expect(refreshSql(odd, defaults)).toBe('REFRESH "My ""Table"""');
		expect(dropSql(argo, defaults)).toBe('DROP TABLE IF EXISTS argo');
	});

	it('builds a view and a materialized view', () => {
		expect(createViewSql('Recent', ' SELECT 1 AS a; ', false)).toBe(
			'CREATE VIEW "Recent" AS SELECT 1 AS a'
		);
		expect(createViewSql('recent', 'SELECT 1', true)).toBe(
			'CREATE MATERIALIZED VIEW recent AS SELECT 1'
		);
	});
});

describe('table rules', () => {
	it('allows refresh and drop in the default schema only', () => {
		expect(canManage(argo, defaults)).toBe(true);
		expect(canManage(jobs, defaults)).toBe(false);
	});

	it('reads the kind', () => {
		expect(tableKind('VIEW')).toBe('view');
		expect(tableKind('view')).toBe('view');
		expect(tableKind('BASE TABLE')).toBe('table');
	});
});

describe('splitTree', () => {
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
			},
			{
				name: 'remote',
				schemas: [{ name: 'public', tables: [{ name: 'r', table_type: 'BASE TABLE' }] }]
			}
		]
	});

	it('puts the default schema apart from the rest', () => {
		const { defaultTables, others } = splitTree(tree);
		expect(defaultTables.map((t) => t.name)).toEqual(['argo']);
		expect(others.catalogs.map((c) => c.name)).toEqual(['beacon', 'remote']);
		expect(others.catalogs[0].schemas.map((s) => s.name)).toEqual(['system']);
	});

	it('drops a catalog that only held the default schema', () => {
		const only = buildTree({
			default_catalog: 'beacon',
			default_schema: 'public',
			catalogs: [{ name: 'beacon', schemas: [{ name: 'public', tables: [] }] }]
		});
		expect(splitTree(only).others.catalogs).toEqual([]);
	});
});

describe('tableDetailQuery', () => {
	it('leaves out catalog and schema in the default schema', () => {
		expect(tableDetailQuery(argo, defaults, 'https://a.org')).toBe(
			'table_name=argo&node=https%3A%2F%2Fa.org'
		);
	});

	it('adds catalog and schema elsewhere', () => {
		expect(tableDetailQuery(jobs, defaults, 'https://a.org')).toBe(
			'table_name=jobs&node=https%3A%2F%2Fa.org&catalog=beacon&schema=system'
		);
	});
});
