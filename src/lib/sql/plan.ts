/** One node of a DataFusion EXPLAIN plan, ready for display. */
export interface PlanNodeView {
	type: string;
	badges: string[];
	fields: [string, string][];
	details: string | null;
	children: Record<string, unknown>[];
}

const SPECIAL_KEYS = new Set(['Node Type', 'Plans', 'Actual Rows', 'Actual Total Time', 'Details']);

function isNode(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The plan comes as `[{ Plan: node }]`, `{ Plan: node }` or a bare node. */
export function planRoot(plan: unknown): Record<string, unknown> | null {
	let value = plan;
	if (Array.isArray(value)) value = value[0];
	if (isNode(value) && 'Plan' in value) value = value.Plan;

	if (isNode(value)) return value;

	return null;
}

function show(value: unknown): string {
	if (typeof value === 'string') return value;

	return JSON.stringify(value);
}

export function viewOf(node: Record<string, unknown>): PlanNodeView {
	const badges: string[] = [];
	if (node['Actual Rows'] !== undefined) badges.push(`${show(node['Actual Rows'])} rows`);
	if (node['Actual Total Time'] !== undefined)
		badges.push(`compute ${show(node['Actual Total Time'])} ms`);

	let type = 'Node';
	if (typeof node['Node Type'] === 'string') type = node['Node Type'];

	let details: string | null = null;
	if (typeof node.Details === 'string') details = node.Details;

	let children: Record<string, unknown>[] = [];
	if (Array.isArray(node.Plans)) children = node.Plans.filter(isNode);

	const fields = Object.entries(node)
		.filter(([key]) => !SPECIAL_KEYS.has(key))
		.map(([key, value]): [string, string] => [key, show(value)]);

	return { type, badges, fields, details, children };
}
