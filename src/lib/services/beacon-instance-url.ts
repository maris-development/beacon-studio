/**
 * The URL helper of the Beacon instance services.
 *
 * It lives apart so that `beacon-instance.ts`, `beacon-instance-health.ts` and
 * `BeaconClient` can all use it. The health store keys its records by a
 * normalized URL, and the state service reads that store. A shared file keeps
 * the two apart.
 */

/** A scheme at the start of a URL, for example `https://`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The origin and the path of one node. See {@link splitInstanceUrl}. */
export type InstanceUrlParts = {
    /** Scheme and host, lower case, with no trailing slash. Example: `https://beacon.maris.nl`. */
    origin: string;
    /** The sub directory of the node, or `''`. Never a trailing slash. Example: `/beacon-api`. */
    pathPrefix: string;
};

/**
 * Reads a URL that a user typed. A value with no scheme gets `https://`, so
 * `beacon.maris.nl` parses. The function returns `null` for an unusable value.
 */
function parse(url: string): URL | null {
    const trimmed = url.trim();
    if (trimmed === '') return null;

    const withScheme = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        return new URL(withScheme);
    } catch {
        return null;
    }
}

/** Removes every trailing slash. A path of `/` becomes `''`. */
function stripTrailingSlash(path: string): string {
    return path.replace(/\/+$/, '');
}

/**
 * Splits a node URL into its origin and its sub directory. A node can run under
 * a path, so the parts stay apart. `BeaconClient` joins them again per request.
 *
 * The origin is lower case, because a scheme and a host are case insensitive.
 * The path keeps its case, because a server can treat two spellings as two
 * paths. A query string and a fragment drop, because an API path takes neither.
 *
 * An unusable value gives the trimmed input as the origin and an empty path.
 * The caller then sees the value of the user, and the request fails as before.
 */
export function splitInstanceUrl(url: string): InstanceUrlParts {
    const parsed = parse(url);

    if (!parsed) {
        return { origin: stripTrailingSlash(url.trim()), pathPrefix: '' };
    }

    // A scheme that the URL standard calls "not special" gives the string
    // "null" as the origin. Build the origin by hand for that case.
    let origin = parsed.origin;
    if (origin === 'null') {
        origin = `${parsed.protocol}//${parsed.host}`;
    }

    return { origin: origin.toLowerCase(), pathPrefix: stripTrailingSlash(parsed.pathname) };
}

/**
 * Puts a URL in one comparable form: a lower case origin, the path of the node,
 * and no trailing slash. Two records of the same node must not be duplicates,
 * and every request must build the same path.
 */
export function normalizeUrl(url: string): string {
    const { origin, pathPrefix } = splitInstanceUrl(url);

    return origin + pathPrefix;
}
