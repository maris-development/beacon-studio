// The brand overlay. `STUDIO_BRAND` picks a folder in `src/brands/`, and the build takes its overrides.
// See AGENTS.md "Brands".

import { cpSync, createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'mrmime';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BRANDS_DIR = 'src/brands';
const UPSTREAM_STATIC_DIR = join(ROOT, 'static');

const DEFAULT_BRAND = 'default';
const REQUIRED_FILES = ['brand.ts', 'theme.scss', 'locales.ts'];
const NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * @typedef {object} Brand
 * @property {string} name The folder name under `src/brands/`.
 * @property {string} dir The absolute path of the brand folder.
 * @property {string} staticDir The absolute path of the optional brand `static/` folder.
 */

/**
 * The active brand. This reads the disk, but it writes nothing and logs nothing,
 * because several tools load `svelte.config.js`.
 * @returns {Brand}
 */
export function resolveBrand() {
	const brandsDir = join(ROOT, BRANDS_DIR);
	const name = (process.env.STUDIO_BRAND ?? '').trim() || DEFAULT_BRAND;

	if (!NAME_PATTERN.test(name)) {
		throw new Error(
			`STUDIO_BRAND "${name}" is not valid. Use lowercase letters, digits and hyphens.`
		);
	}

	const dir = join(brandsDir, name);
	if (!existsSync(dir)) {
		throw new Error(
			`Brand "${name}" does not exist. Create ${BRANDS_DIR}/${name}/, or unset STUDIO_BRAND.`
		);
	}

	for (const file of REQUIRED_FILES) {
		if (!existsSync(join(dir, file))) {
			throw new Error(`Brand "${name}" has no ${file}. Copy it from ${BRANDS_DIR}/default/.`);
		}
	}

	return { name, dir, staticDir: join(dir, 'static') };
}

/** Every file below a folder, as paths relative to it. */
function listFiles(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

/**
 * Puts the brand `static/` over the upstream `static/`. A brand file replaces the
 * upstream file at the same path.
 * @param {Brand} brand
 * @returns {import('vite').Plugin}
 */
export function brandPlugin(brand) {
	const hasStatic = existsSync(brand.staticDir);
	let isClient = false;

	return {
		name: 'beacon-studio-brand',
		enforce: 'pre',

		configResolved(config) {
			isClient = !config.build.ssr;
		},

		buildStart() {
			if (!hasStatic || !isClient) return;

			// A renamed upstream file leaves the brand file with no effect.
			for (const file of listFiles(brand.staticDir)) {
				if (!existsSync(join(UPSTREAM_STATIC_DIR, file))) {
					console.warn(`[beacon-studio] brand static file with no upstream file: ${file}`);
				}
			}
		},

		configureServer(server) {
			if (!hasStatic) return;

			// A middleware added here runs before the Vite and SvelteKit asset middlewares.
			server.middlewares.use((req, res, next) => {
				const file = brandFileFor(req.url, server.config.base, brand.staticDir);
				if (!file) return next();

				res.setHeader('Content-Type', lookup(file) ?? 'application/octet-stream');
				createReadStream(file).pipe(res);
			});
		},

		// Vite copies `static/` before it writes the bundle, so these files replace the upstream files.
		writeBundle(options) {
			if (!hasStatic || !isClient || !options.dir) return;
			cpSync(brand.staticDir, options.dir, { recursive: true });
		}
	};
}

/** The brand file for a dev request, or null. It never returns a path outside the brand folder. */
function brandFileFor(url, base, staticDir) {
	if (!url) return null;

	let pathname;
	try {
		pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
	} catch {
		return null;
	}

	const prefix = base.endsWith('/') ? base : `${base}/`;
	if (!pathname.startsWith(prefix)) return null;

	const file = resolve(staticDir, pathname.slice(prefix.length));
	if (!file.startsWith(staticDir + sep)) return null;
	if (!existsSync(file) || !statSync(file).isFile()) return null;

	return file;
}
