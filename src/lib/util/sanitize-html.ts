/**
 * Sanitize HTML — make a remote text safe to render as markup.
 *
 * The public node list of MARIS holds a description with HTML in it, so the app
 * must render that markup. The list comes from a server, so the app cannot trust
 * it: a script tag or an `onerror` attribute in the text would run in the app.
 *
 * `sanitizeHtml` keeps a small set of tags and drops everything else. DOMPurify
 * parses the text with the browser, so the markup that this function returns
 * matches the markup that the browser reads back. `htmlToText` gives the same
 * text for a place that takes plain text only, such as a `title` attribute.
 */

import DOMPurify from 'dompurify';

/** The tags a description may use. DOMPurify drops every other tag. */
const ALLOWED_TAGS = [
	'a',
	'b',
	'br',
	'code',
	'em',
	'i',
	'li',
	'ol',
	'p',
	'small',
	'span',
	'strong',
	'sub',
	'sup',
	'u',
	'ul'
];

/** The attributes a tag may keep. DOMPurify drops every other attribute. */
const ALLOWED_ATTR = ['href', 'title', 'class'];

/** The markup with the unsafe tags and attributes removed. */
export function sanitizeHtml(html: string | undefined): string {
	if (!html || !DOMPurify.isSupported) return '';

	// `RETURN_DOM` gives the body element, but the types of DOMPurify say `Node`.
	const body = DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		RETURN_DOM: true
	}) as HTMLElement;

	for (const anchor of body.querySelectorAll('a')) {
		// The app runs in a window of its own, so a link opens a new tab.
		anchor.setAttribute('target', '_blank');
		anchor.setAttribute('rel', 'noopener noreferrer');
	}

	return body.innerHTML;
}

/** The readable text of the markup, for a place that takes no markup. */
export function htmlToText(html: string | undefined): string {
	if (!html) return '';
	if (!DOMPurify.isSupported) return html;

	const body = DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
		RETURN_DOM: true
	});

	return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
