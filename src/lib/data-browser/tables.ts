import type { CatalogTable } from '@maris-development/beacon-client';
import type { CatalogTree } from '@/sql/catalog';
import { quoteIdent, sqlName, type CatalogDefaults, type TableRef } from '@/sql/identifiers';

export const DETAIL_PREVIEW_ROWS = 100;

export type TableKind = 'table' | 'view';

export function tableKind(tableType: string): TableKind {
	if (tableType.toUpperCase().includes('VIEW')) return 'view';
	return 'table';
}

export function isDefaultSchema(
	ref: { catalog: string; schema: string },
	defaults: CatalogDefaults
): boolean {
	return ref.catalog === defaults.catalog && ref.schema === defaults.schema;
}

/** Refresh and drop act on the default schema only, the same rule as beacon-web. */
export function canManage(ref: TableRef, defaults: CatalogDefaults): boolean {
	return isDefaultSchema(ref, defaults);
}

export function previewSql(
	ref: TableRef,
	defaults: CatalogDefaults,
	limit = DETAIL_PREVIEW_ROWS
): string {
	return `SELECT * FROM ${sqlName(ref, defaults)} LIMIT ${limit}`;
}

export function editorSql(ref: TableRef, defaults: CatalogDefaults): string {
	return previewSql(ref, defaults, 100);
}

export function refreshSql(ref: TableRef, defaults: CatalogDefaults): string {
	return `REFRESH ${sqlName(ref, defaults)}`;
}

export function dropSql(ref: TableRef, defaults: CatalogDefaults): string {
	return `DROP TABLE IF EXISTS ${sqlName(ref, defaults)}`;
}

/** A trailing `;` would end the statement before the view, so it goes. */
export function createViewSql(name: string, query: string, materialized: boolean): string {
	const body = query.trim().replace(/;+\s*$/, '');

	let kind = 'VIEW';
	if (materialized) kind = 'MATERIALIZED VIEW';

	return `CREATE ${kind} ${quoteIdent(name)} AS ${body}`;
}

/** The tables of the default schema, and a tree of every other schema. */
export function splitTree(tree: CatalogTree): {
	defaultTables: CatalogTable[];
	others: CatalogTree;
} {
	let defaultTables: CatalogTable[] = [];

	const catalogs = tree.catalogs
		.map((catalog) => ({
			name: catalog.name,
			schemas: catalog.schemas.filter((schema) => {
				if (isDefaultSchema({ catalog: catalog.name, schema: schema.name }, tree.defaults)) {
					defaultTables = schema.tables;
					return false;
				}
				return true;
			})
		}))
		.filter((catalog) => catalog.schemas.length > 0);

	return { defaultTables, others: { catalogs, defaults: tree.defaults } };
}

/** The query string of a table detail URL. Catalog and schema only outside the default schema. */
export function tableDetailQuery(
	ref: TableRef,
	defaults: CatalogDefaults,
	nodeUrl: string
): string {
	const params = new URLSearchParams({ table_name: ref.name, node: nodeUrl });

	if (!isDefaultSchema(ref, defaults)) {
		params.set('catalog', ref.catalog);
		params.set('schema', ref.schema);
	}

	return params.toString();
}
