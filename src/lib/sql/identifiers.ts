export type TableRef = { catalog: string; schema: string; name: string };

/** The catalog and schema that an unqualified table name resolves against. */
export type CatalogDefaults = { catalog: string; schema: string };

const BARE_IDENT = /^[a-z_][a-z0-9_]*$/;

export function quoteIdent(name: string): string {
	if (BARE_IDENT.test(name)) return name;

	return `"${name.replace(/"/g, '""')}"`;
}

/** Bare in the default catalog and schema, `catalog.schema.table` elsewhere. */
export function sqlName(ref: TableRef, defaults: CatalogDefaults): string {
	if (ref.catalog === defaults.catalog && ref.schema === defaults.schema) {
		return quoteIdent(ref.name);
	}

	return [ref.catalog, ref.schema, ref.name].map(quoteIdent).join('.');
}
