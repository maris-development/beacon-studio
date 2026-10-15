/**
 * The active brand: the upstream defaults, with the overrides of
 * `src/brands/<name>/brand.ts` on top. See AGENTS.md "Brands".
 *
 * This module sits in the bottom layer. It imports only the brand folder and
 * assets, so every other layer can import it.
 */

import overrides from '$brand/brand';
import defaultLogo from '$lib/assets/logo-gradient.svg';
import type { BrandConfig } from './define';

export type { BrandConfig } from './define';

const DEFAULTS: BrandConfig = {
	name: 'Beacon Studio',
	logo: defaultLogo,
	links: {
		about: 'https://beacon-datalake.org/ecosystem/studio',
		docs: 'https://maris-development.github.io/beacon/',
		source: 'https://github.com/maris-development/beacon',
		publicNodes: 'https://beacon-datalake.org/public-nodes'
	},
	endpoints: {
		publicNodes: 'https://beacon-datalake.org/api/studio/public-nodes',
		homeExamples: 'https://beacon-datalake.org/api/studio/examples',
		feedback: 'https://beacon-datalake.org/studio-feedback',
		telemetry: 'https://beacon-datalake.org/api/telemetry'
	}
};

type Tree = Record<string, unknown>;

function isTree(value: unknown): value is Tree {
	return typeof value === 'object' && value !== null;
}

// An undefined value keeps the default. A null value stays, because null hides a link.
function merge(base: Tree, patch: Tree): Tree {
	const result: Tree = { ...base };

	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) continue;

		const current = base[key];
		if (isTree(current) && isTree(value)) {
			result[key] = merge(current, value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

export const BRAND = merge(DEFAULTS, overrides) as BrandConfig;
