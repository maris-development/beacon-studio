/** The SQL editor link of a detail page. The `node` parameter makes the editor run on the page node. */
export function editorLink(editorPath: string, sql: string, nodeUrl: string): string {
	return `${editorPath}?sql=${encodeURIComponent(sql)}&node=${encodeURIComponent(nodeUrl)}`;
}

/** A date from a server string, or `null` when the text is not a date. */
export function parseDate(value: string | null): Date | null {
	if (!value) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;

	return date;
}
