/**
 * The types of a brand, and the helper that a brand folder calls.
 *
 * This file must never import `$brand`. A brand imports it, so that import
 * would make a cycle.
 */

/** A feature of the shared code that a brand can turn on. Add the id of a new brand feature here. */
export type BrandFeature = never;

/** The values a brand can override. `index.ts` holds the upstream default of each one. */
export type BrandConfig = {
	/** The app name. It is not translated. A catalog string reads it as `{app}`. */
	name: string;
	/** The logo URL. Import the file, so Vite hashes it and applies the base path. */
	logo: string;
	links: {
		/** The links in the sidebar footer. `null` hides the link. */
		about: string | null;
		docs: string | null;
		source: string | null;
		/** The page about the public nodes, on the Beacon nodes page. */
		publicNodes: string;
	};
	endpoints: {
		/** The public node list that a new user gets. */
		publicNodes: string;
		/** The Quick start examples on the home page. */
		homeExamples: string;
		/** The feedback form. */
		feedback: string;
		/** The telemetry receiver. `STUDIO_TELEMETRY` still turns telemetry on or off. */
		telemetry: string;
	};
	/** The features that this brand turns on. A brand list replaces the default list. */
	features: readonly BrandFeature[];
};

// An array is one value, so an override replaces it whole.
export type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends readonly unknown[]
		? T[K]
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

export type BrandOverrides = DeepPartial<BrandConfig>;

/** Types the overrides of a brand. A wrong key fails the type check. */
export function defineBrand(overrides: BrandOverrides): BrandOverrides {
	return overrides;
}
