import type { CatalogTree, LoadedColumns } from './catalog';
import { quoteIdent, sqlName } from './identifiers';

export type CompletionKind = 'table' | 'column' | 'function' | 'keyword';

/** One suggestion, with no Monaco type, so it can be tested. The editor maps it. */
export interface CompletionEntry {
	label: string;
	kind: CompletionKind;
	insertText: string;
	snippet: boolean;
	detail?: string;
	documentation?: string;
}

export interface FnMeta {
	name: string;
	description?: string;
	returnType?: string;
	params: { name: string; dataType?: string }[];
}

export const MAX_COLUMN_ENTRIES = 5000;

// Monaco SQL mode highlights keywords but suggests none.
export const SQL_KEYWORDS = [
	'SELECT',
	'FROM',
	'WHERE',
	'GROUP BY',
	'ORDER BY',
	'HAVING',
	'LIMIT',
	'OFFSET',
	'JOIN',
	'INNER JOIN',
	'LEFT JOIN',
	'RIGHT JOIN',
	'FULL JOIN',
	'CROSS JOIN',
	'ON',
	'USING',
	'AS',
	'AND',
	'OR',
	'NOT',
	'IN',
	'IS NULL',
	'IS NOT NULL',
	'BETWEEN',
	'LIKE',
	'ILIKE',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'DISTINCT',
	'UNION',
	'UNION ALL',
	'INTERSECT',
	'EXCEPT',
	'WITH',
	'ASC',
	'DESC',
	'NULLS FIRST',
	'NULLS LAST',
	'CREATE TABLE',
	'CREATE VIEW',
	'CREATE MATERIALIZED VIEW',
	'CREATE EXTERNAL TABLE',
	'STORED AS',
	'LOCATION',
	'OPTIONS',
	'INSERT INTO',
	'VALUES',
	'UPDATE',
	'SET',
	'DELETE FROM',
	'DROP TABLE',
	'ALTER TABLE',
	'REFRESH',
	'EXPLAIN',
	'ANALYZE',
	'SHOW TABLES',
	'DESCRIBE'
];

function text(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	return undefined;
}

/** Reads `/api/functions`. The entries have no fixed name field. */
export function parseFunctions(raw: unknown): FnMeta[] {
	if (!Array.isArray(raw)) return [];

	const seen = new Set<string>();
	const result: FnMeta[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;

		const entry = item as Record<string, unknown>;
		const name = text(entry.function_name ?? entry.name ?? entry.function ?? entry.id);
		if (!name || seen.has(name)) continue;

		seen.add(name);

		let params: FnMeta['params'] = [];
		if (Array.isArray(entry.params)) {
			params = (entry.params as Record<string, unknown>[]).map((param) => ({
				name: text(param?.name) ?? '',
				dataType: text(param?.data_type)
			}));
		}

		result.push({
			name,
			description: text(entry.description),
			returnType: text(entry.return_type),
			params
		});
	}

	return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function fnSignature(fn: FnMeta): string {
	const params = fn.params
		.map((param) => {
			if (param.dataType) return `${param.name}: ${param.dataType}`;
			return param.name;
		})
		.join(', ');

	let signature = `${fn.name}(${params})`;
	if (fn.returnType) signature += ` → ${fn.returnType}`;

	return signature;
}

export function buildCompletions(input: {
	tree: CatalogTree | null;
	functions: FnMeta[];
	columns: LoadedColumns[];
}): CompletionEntry[] {
	const entries: CompletionEntry[] = [];

	if (input.tree) {
		const { defaults } = input.tree;

		for (const catalog of input.tree.catalogs) {
			for (const schema of catalog.schemas) {
				for (const table of schema.tables) {
					const name = sqlName(
						{ catalog: catalog.name, schema: schema.name, name: table.name },
						defaults
					);
					entries.push({
						label: name,
						kind: 'table',
						insertText: name,
						snippet: false,
						detail: `${catalog.name}.${schema.name} · ${table.table_type}`
					});
				}
			}
		}
	}

	const seenColumns = new Set<string>();

	for (const { ref, columns } of input.columns) {
		for (const column of columns) {
			if (seenColumns.size >= MAX_COLUMN_ENTRIES) break;
			if (seenColumns.has(column.name)) continue;

			seenColumns.add(column.name);
			entries.push({
				label: column.name,
				kind: 'column',
				insertText: quoteIdent(column.name),
				snippet: false,
				detail: `${ref.name}: ${column.dataType}`
			});
		}
	}

	for (const fn of input.functions) {
		entries.push({
			label: fn.name,
			kind: 'function',
			insertText: `${fn.name}($0)`,
			snippet: true,
			detail: fnSignature(fn),
			documentation: fn.description
		});
	}

	for (const keyword of SQL_KEYWORDS) {
		entries.push({ label: keyword, kind: 'keyword', insertText: keyword, snippet: false });
	}

	return entries;
}
