/**
 * Sanitize HTML — make a remote text safe to render as markup.
 *
 * The public node list of MARIS holds a description with HTML in it, so the app
 * must render that markup. The list comes from a server, so the app cannot trust
 * it: a script tag or an `onerror` attribute in the text would run in the app.
 *
 * `sanitizeHtml` keeps a small set of tags and drops everything else. It parses
 * the text with the browser, so a broken tag cannot slip a second tag past a
 * pattern match. `htmlToText` gives the same text for a place that takes plain
 * text only, such as a `title` attribute.
 */

/** The tags a description may use. The parser drops every other tag. */
const ALLOWED_TAGS = new Set([
	'A',
	'B',
	'BR',
	'CODE',
	'EM',
	'I',
	'LI',
	'OL',
	'P',
	'SMALL',
	'SPAN',
	'STRONG',
	'SUB',
	'SUP',
	'U',
	'UL'
]);

/** The attributes each tag may keep. The parser drops every other attribute. */
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
	A: new Set(['href', 'title'])
};

/** The schemes a link may use. A `javascript:` URL runs code on a click. */
const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:'];

/** True if the href points at a safe address. */
function isSafeHref(value: string): boolean {
	try {
		const url = new URL(value, 'https://example.invalid/');

		return ALLOWED_SCHEMES.includes(url.protocol);
	} catch {
		return false;
	}
}

/** Replaces a node by its own children, so the text stays and the tag goes. */
function unwrap(element: Element): void {
	const parent = element.parentNode;
	if (!parent) return;

	while (element.firstChild) {
		parent.insertBefore(element.firstChild, element);
	}

	parent.removeChild(element);
}

/** Drops the tags and attributes that the lists above leave out. */
function clean(root: Element): void {
	for (const element of [...root.querySelectorAll('*')]) {
		const tag = element.tagName.toUpperCase();

		// A script or a style holds no readable text, so drop the content too.
		if (tag === 'SCRIPT' || tag === 'STYLE') {
			element.remove();
			continue;
		}

		if (!ALLOWED_TAGS.has(tag)) {
			unwrap(element);
			continue;
		}

		const allowed = ALLOWED_ATTRIBUTES[tag] ?? new Set<string>();

		for (const attribute of [...element.attributes]) {
			if (!allowed.has(attribute.name.toLowerCase())) {
				element.removeAttribute(attribute.name);
			}
		}

		if (tag === 'A') {
			const href = element.getAttribute('href') ?? '';

			if (isSafeHref(href)) {
				// The app runs in a window of its own, so a link opens a new tab.
				element.setAttribute('target', '_blank');
				element.setAttribute('rel', 'noopener noreferrer');
			} else {
				unwrap(element);
			}
		}
	}
}

/** Parses the text, or returns `null` outside a browser. */
function parse(html: string): HTMLElement | null {
	if (typeof DOMParser === 'undefined') return null;

	return new DOMParser().parseFromString(html, 'text/html').body;
}

/** The markup with the unsafe tags and attributes removed. */
export function sanitizeHtml(html: string | undefined): string {
	if (!html) return '';

	const body = parse(html);
	if (!body) return '';

	clean(body);

	return body.innerHTML;
}

/** The readable text of the markup, for a place that takes no markup. */
export function htmlToText(html: string | undefined): string {
	if (!html) return '';

	const body = parse(html);
	if (!body) return html;

	return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
