/**
 * The active brand: the defaults, with the overrides of
 * `src/brands/<name>/brand.ts` on top. See AGENTS.md "Brands".
 *
 * This module sits in the bottom layer. It imports only the brand folder and
 * assets, so every other layer can import it.
 */

import overrides from "$brand/brand";
import defaultLogo from "$lib/assets/logo-gradient.svg";
import type { BrandConfig, BrandFeature, DeepPartial } from "./define";

export type { BrandConfig } from "./define";

declare const __BRAND__: string;

/** The folder name of the active brand, for example `default`. Use it to scope a storage key per brand. */
export const BRAND_ID: string = __BRAND__;

const DEFAULTS: BrandConfig = {
    name: "Beacon Studio",
    logo: defaultLogo,
    links: {
        about: "https://beacon-datalake.org/ecosystem/studio",
        docs: "https://maris-development.github.io/beacon/",
        source: "https://github.com/maris-development/beacon",
        publicNodes: "https://beacon-datalake.org/public-nodes"
    },
    endpoints: {
        publicNodes: "https://beacon-datalake.org/api/studio/public-nodes",
        homeExamples: "https://beacon-datalake.org/api/studio/examples",
        feedback: "https://beacon-datalake.org/studio-feedback",
        telemetry: "https://beacon-datalake.org/api/telemetry"
    },
    // The cast is needed because `strict: false` reads `[]` as `undefined[]`.
    features: [] as BrandFeature[]
};

type Tree = Record<string, unknown>;

// Only a plain object merges key by key. An array, null or a class instance replaces the default.
function isTree(value: unknown): value is Tree {
    if (typeof value !== "object" || value === null) return false;
    return Object.getPrototypeOf(value) === Object.prototype;
}

// An undefined value keeps the default. A null value stays, because null hides a link.
function merge<T extends object>(base: T, patch: DeepPartial<T>): T {
    const result: Tree = { ...(base as Tree) };

    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;

        const current = result[key];
        if (isTree(current) && isTree(value)) {
            result[key] = merge(current, value);
        } else {
            result[key] = value;
        }
    }

    return result as T;
}

export const BRAND = merge(DEFAULTS, overrides);
