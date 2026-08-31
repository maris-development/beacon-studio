/**
 * The URL helper of the Beacon instance services.
 *
 * It lives apart so that `beacon-instance.ts` and `beacon-instance-health.ts`
 * can both use it. The health store keys its records by a normalized URL, and
 * the state service reads that store. A shared file keeps the two apart.
 */

/**
 * Puts a URL in a comparable form. The compare is case insensitive and ignores
 * a trailing slash. Two instances with the same node must not be duplicates.
 */
export function normalizeUrl(url: string): string {
	return url.trim().toLowerCase().replace(/\/+$/, '');
}
