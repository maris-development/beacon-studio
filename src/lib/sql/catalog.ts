import type { Catalog, CatalogSchema, CatalogsView } from '@maris-development/beacon-client';
import type { CatalogDefaults, TableRef } from './identifiers';

export type SchemaColumn = { name: string; dataType: string };

export type CatalogTree = { catalogs: Catalog[]; defaults: CatalogDefaults };

export type LoadedColumns = { ref: TableRef; columns: SchemaColumn[] };

/** A Beacon table can have more than 100,000 columns. The tree shows this many at a time. */
export const COLUMN_PAGE_SIZE = 500;

const SYSTEM_SCHEMAS = ['information_schema', 'system'];

function isDefault(catalog: string, schema: string, defaults: CatalogDefaults): boolean {
	return catalog === defaults.catalog && schema === defaults.schema;
}

function orderSchemas(
	catalog: string,
	schemas: CatalogSchema[],
	defaults: CatalogDefaults
): CatalogSchema[] {
	const rank = (schema: CatalogSchema) => {
		if (isDefault(catalog, schema.name, defaults)) return 0;
		if (SYSTEM_SCHEMAS.includes(schema.name.toLowerCase())) return 2;
		return 1;
	};

	return [...schemas].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function buildTree(view: CatalogsView): CatalogTree {
	const defaults = { catalog: view.default_catalog, schema: view.default_schema };
	const rank = (catalog: Catalog) => {
		if (catalog.name === defaults.catalog) return 0;
		return 1;
	};

	const catalogs = [...view.catalogs]
		.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
		.map((catalog) => ({
			name: catalog.name,
			schemas: orderSchemas(catalog.name, catalog.schemas, defaults)
		}));

	return { catalogs, defaults };
}

/**
 * Keeps the entries that match `needle`. A matching catalog or schema keeps all its
 * tables. A table also stays when one of its loaded columns matches.
 */
export function filterTree(
	tree: CatalogTree,
	needle: string,
	columnsOf?: (ref: TableRef) => SchemaColumn[] | undefined
): CatalogTree {
	const query = needle.trim().toLowerCase();
	if (!query) return tree;

	const hit = (value: string) => value.toLowerCase().includes(query);

	const catalogs = tree.catalogs
		.map((catalog) => ({
			name: catalog.name,
			schemas: catalog.schemas
				.map((schema) => {
					if (hit(catalog.name) || hit(schema.name)) return schema;

					const tables = schema.tables.filter((table) => {
						if (hit(table.name)) return true;

						const ref = { catalog: catalog.name, schema: schema.name, name: table.name };
						return columnsOf?.(ref)?.some((column) => hit(column.name)) ?? false;
					});

					return { name: schema.name, tables };
				})
				.filter((schema) => schema.tables.length > 0)
		}))
		.filter((catalog) => catalog.schemas.length > 0);

	return { catalogs, defaults: tree.defaults };
}

type RawField = { name?: unknown; data_type?: unknown; dataType?: unknown; type?: unknown };

/** Reads the column list from an Arrow schema as the server sends it. */
export function parseSchema(schema: unknown): SchemaColumn[] {
	if (!schema || typeof schema !== 'object') return [];

	const record = schema as Record<string, unknown>;
	let raw: unknown[] = [];
	if (Array.isArray(record.fields)) {
		raw = record.fields;
	} else if (Array.isArray(record.columns)) {
		raw = record.columns;
	}

	return (raw as RawField[])
		.filter((field) => field && typeof field.name === 'string')
		.map((field) => ({
			name: field.name as string,
			dataType: stringifyType(field.data_type ?? field.dataType ?? field.type)
		}));
}

/** `"Float64"`, `{ Timestamp: ["Millisecond", null] }` and `{ List: field }` as one line of text. */
export function stringifyType(type: unknown): string {
	if (type == null) return '';
	if (typeof type === 'string') return type;
	if (typeof type !== 'object') return String(type);

	const entries = Object.entries(type as Record<string, unknown>);
	if (entries.length !== 1) return JSON.stringify(type);

	const [name, args] = entries[0];

	if (args && typeof args === 'object' && !Array.isArray(args) && 'data_type' in args) {
		return `${name}<${stringifyType((args as RawField).data_type)}>`;
	}

	if (Array.isArray(args)) {
		const parts = args.filter((arg) => arg != null).map((arg) => stringifyType(arg));
		if (parts.length === 0) return name;
		return `${name}(${parts.join(', ')})`;
	}

	if (args == null) return name;

	return `${name}(${stringifyType(args)})`;
}

export function tableKey(ref: TableRef): string {
	return `${ref.catalog}\u0000${ref.schema}\u0000${ref.name}`;
}

/** The part of the SDK client that the catalogue needs. */
export interface CatalogSource {
	catalogs(): Promise<CatalogsView>;
	tableSchema(name: string, in_: { catalog: string; schema: string }): Promise<unknown>;
}

/** Trees and columns for each node URL, for the life of the page. A failed load is not kept. */
export class CatalogCache {
	private trees = new Map<string, Promise<CatalogTree>>();
	private columnLoads = new Map<string, Promise<SchemaColumn[]>>();
	private loaded = new Map<string, LoadedColumns & { nodeUrl: string }>();

	tree(nodeUrl: string, source: CatalogSource, refresh = false): Promise<CatalogTree> {
		if (refresh) this.clear(nodeUrl);

		let load = this.trees.get(nodeUrl);
		if (!load) {
			load = source.catalogs().then(buildTree);
			this.trees.set(nodeUrl, load);
			load.catch(() => this.trees.delete(nodeUrl));
		}

		return load;
	}

	columnsOf(nodeUrl: string, source: CatalogSource, ref: TableRef): Promise<SchemaColumn[]> {
		const key = `${nodeUrl}\u0000${tableKey(ref)}`;

		let load = this.columnLoads.get(key);
		if (!load) {
			load = source
				.tableSchema(ref.name, { catalog: ref.catalog, schema: ref.schema })
				.then(parseSchema);
			this.columnLoads.set(key, load);
			load.then(
				(columns) => this.loaded.set(key, { nodeUrl, ref, columns }),
				() => this.columnLoads.delete(key)
			);
		}

		return load;
	}

	loadedColumns(nodeUrl: string): LoadedColumns[] {
		const result: LoadedColumns[] = [];

		for (const entry of this.loaded.values()) {
			if (entry.nodeUrl === nodeUrl) result.push({ ref: entry.ref, columns: entry.columns });
		}

		return result;
	}

	clear(nodeUrl: string): void {
		this.trees.delete(nodeUrl);

		const prefix = `${nodeUrl}\u0000`;
		for (const key of [...this.columnLoads.keys()]) {
			if (key.startsWith(prefix)) this.columnLoads.delete(key);
		}
		for (const key of [...this.loaded.keys()]) {
			if (key.startsWith(prefix)) this.loaded.delete(key);
		}
	}
}
