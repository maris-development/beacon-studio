export type TableRef = { catalog: string; schema: string; name: string };

/** The catalog and schema that an unqualified table name resolves against. */
export type CatalogDefaults = { catalog: string; schema: string };

const BARE_IDENT = /^[a-z_][a-z0-9_]*$/;

// Words that the SQL parser rejects, or reads as a keyword, in the place of a name.
const RESERVED_WORDS = new Set([
	'all',
	'and',
	'any',
	'array',
	'as',
	'asc',
	'between',
	'by',
	'case',
	'cast',
	'create',
	'cross',
	'current_date',
	'current_time',
	'current_timestamp',
	'default',
	'delete',
	'desc',
	'distinct',
	'drop',
	'else',
	'end',
	'except',
	'exists',
	'false',
	'fetch',
	'filter',
	'for',
	'from',
	'full',
	'group',
	'having',
	'in',
	'inner',
	'insert',
	'intersect',
	'interval',
	'into',
	'is',
	'join',
	'lateral',
	'left',
	'like',
	'limit',
	'natural',
	'not',
	'null',
	'offset',
	'on',
	'or',
	'order',
	'outer',
	'over',
	'partition',
	'primary',
	'references',
	'right',
	'select',
	'set',
	'table',
	'then',
	'to',
	'true',
	'union',
	'unique',
	'update',
	'user',
	'using',
	'values',
	'when',
	'where',
	'window',
	'with'
]);

export function quoteIdent(name: string): string {
	if (BARE_IDENT.test(name) && !RESERVED_WORDS.has(name)) return name;

	return `"${name.replace(/"/g, '""')}"`;
}

/** Bare in the default catalog and schema, `catalog.schema.table` elsewhere. */
export function sqlName(ref: TableRef, defaults: CatalogDefaults): string {
	if (ref.catalog === defaults.catalog && ref.schema === defaults.schema) {
		return quoteIdent(ref.name);
	}

	return [ref.catalog, ref.schema, ref.name].map(quoteIdent).join('.');
}
