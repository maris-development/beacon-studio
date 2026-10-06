/**
 * The target of a "back" link. Only a path inside the data browser of this site is
 * accepted, so a crafted link cannot send the user to another site or page.
 */
export function backTarget(back: string | null, base: string, fallback: string): string {
	if (!back || back.includes('\\')) return fallback;

	const root = `${base}/data-browser`;
	if (back === root || back.startsWith(`${root}/`) || back.startsWith(`${root}?`)) {
		return back;
	}

	return fallback;
}

/** Adds `back` to a URL that can already hold parameters. */
export function withBack(href: string, back: string): string {
	let separator = '?';
	if (href.includes('?')) separator = '&';

	return `${href}${separator}back=${encodeURIComponent(back)}`;
}
