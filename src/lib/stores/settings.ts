/**
 * The Beacon Studio settings store.
 *
 * One persisted object holds every user preference. The app kept these values as
 * module constants before. Each value now has a default and an entry in
 * {@link SETTING_DEFINITIONS}. The settings page reads that list and builds the
 * form from it, so a new setting needs no new markup.
 *
 * Two ways to read a value:
 *
 *   $settings          in Svelte markup or an effect. The value is reactive.
 *   getSettings()      in plain modules. The call returns a snapshot.
 *
 * Modules that ran on a constant must call {@link getSettings} at the point of
 * use, not at module load. A read at module load keeps the value of the first
 * page load for ever.
 *
 * The store holds raw values in canonical units: bytes, milliseconds and counts.
 * A definition can carry a `scale` and a `unit`. The settings page divides by the
 * scale for display, and multiplies again on write.
 */

import { derived, get, type Readable } from 'svelte/store';
import { persisted } from 'svelte-local-storage-store';

/** The localStorage key of the settings object. */
const STORAGE_KEY = 'beacon-studio.settings';

export interface BeaconStudioSettings {
	// -- query ----------------------------------------------------------------
	/** The output format of a new query block. */
	defaultOutputFormat: string;
	/** Blocks a query with no filters. It stops a read of a whole table. */
	requireQueryFilters: boolean;
	/** The cap on result size in cells (rows × columns). It protects the browser. */
	queryCellLimit: number;
	/** The number of decoded results that the memory cache holds. */
	memoryCacheMaxEntries: number;
	/** The number of rows in the query history. */
	queryHistoryMax: number;
	/** The number of tables that the Arrow worker holds. */
	workerMaxLoadedTables: number;

	// -- disk cache -----------------------------------------------------------
	/** The number of results in the OPFS cache. */
	diskCacheMaxEntries: number;
	/** The total size of the OPFS cache payloads, in bytes. */
	diskCacheMaxTotalBytes: number;
	/** The age at which an OPFS entry becomes stale, in milliseconds. */
	diskCacheMaxAgeMs: number;

	// -- map ------------------------------------------------------------------
	/** The MapLibre style URL of the base map. */
	mapStyleUrl: string;
	/** The decimals that the map groups latitude and longitude by. */
	mapGroupByDecimals: number;
	/** The width of a new cross section, in kilometres. */
	crossSectionWidthKm: number;

	// -- plot -----------------------------------------------------------------

	/**
	 * The number of rows after which a plot samples the data. A lower value keeps the browser stable.
	 */
	sampleAfterRows: number;

	// -- system ---------------------------------------------------------------
	/** The refresh period of the system info page, in milliseconds. */
	systemInfoUpdateIntervalMs: number;
}

export const DEFAULT_SETTINGS: BeaconStudioSettings = {
	defaultOutputFormat: 'parquet',
	queryCellLimit: 10_000_000,
	requireQueryFilters: true,
	memoryCacheMaxEntries: 4,
	queryHistoryMax: 100,
	workerMaxLoadedTables: 2,

	diskCacheMaxEntries: 50,
	diskCacheMaxTotalBytes: 1024 * 1024 * 1024,
	diskCacheMaxAgeMs: 24 * 60 * 60 * 1000,

	mapStyleUrl: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
	mapGroupByDecimals: 3,
	crossSectionWidthKm: 5,

	sampleAfterRows: 500_000,

	systemInfoUpdateIntervalMs: 1000
};

/** The keys of one settings object. */
export type SettingKey = keyof BeaconStudioSettings;

export type SettingGroup = 'Queries' | 'Result cache' | 'Map' | 'System' | 'Plot';

interface BaseDefinition {
	key: SettingKey;
	group: SettingGroup;
	label: string;
	description: string;
}

export interface NumberSettingDefinition extends BaseDefinition {
	type: 'number';
	min: number;
	max: number;
	/** The step of the input, in display units. */
	step?: number;
	/** The unit of the display value. */
	unit?: string;
	/**
	 * The factor between the stored value and the display value. The page divides
	 * by it for display, and multiplies by it on write. Default 1.
	 */
	scale?: number;
}

export interface TextSettingDefinition extends BaseDefinition {
	type: 'text';
	placeholder?: string;
}

export interface BooleanSettingDefinition extends BaseDefinition {
	type: 'boolean';
}

export interface SelectSettingDefinition extends BaseDefinition {
	type: 'select';
	options: Array<{ label: string; value: string }>;
}

export type SettingDefinition =
	| NumberSettingDefinition
	| TextSettingDefinition
	| BooleanSettingDefinition
	| SelectSettingDefinition;

/** One entry per setting. The settings page builds its form from this list. */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
	{
		key: 'defaultOutputFormat',
		group: 'Queries',
		type: 'select',
		label: 'Default output format',
		description: 'The output format of a new query block.',
		options: [
			{ label: 'Parquet', value: 'parquet' },
			{ label: 'CSV', value: 'csv' },
			{ label: 'Arrow', value: 'arrow' },
			{ label: 'NetCDF', value: 'netcdf' }
		]
	},
	{
		key: 'requireQueryFilters',
		group: 'Queries',
		type: 'boolean',
		label: 'Require a filter',
		description:
			'Blocks a query with no filters in the workbench. Beacon must not read a whole table.'
	},
	{
		key: 'queryCellLimit',
		group: 'Queries',
		type: 'number',
		label: 'Query cell limit',
		description:
			'The cap on result size in cells (rows × columns). A lower value keeps the browser stable. The row limit is this value divided by the number of columns.',
		min: 1,
		max: 1000,
		step: 1,
		unit: 'million cells',
		scale: 1_000_000
	},
	{
		key: 'queryHistoryMax',
		group: 'Queries',
		type: 'number',
		label: 'Query history size',
		description: 'The number of rows in the query history. The oldest runs go away first.',
		min: 1,
		max: 1000,
		step: 1,
		unit: 'entries'
	},
	{
		key: 'memoryCacheMaxEntries',
		group: 'Result cache',
		type: 'number',
		label: 'Memory cache entries',
		description: 'The number of decoded results that stay in memory.',
		min: 1,
		max: 32,
		step: 1,
		unit: 'results'
	},
	{
		key: 'workerMaxLoadedTables',
		group: 'Result cache',
		type: 'number',
		label: 'Worker tables',
		description: 'The number of tables that the Arrow worker holds for sort and group actions.',
		min: 1,
		max: 8,
		step: 1,
		unit: 'tables'
	},
	{
		key: 'diskCacheMaxEntries',
		group: 'Result cache',
		type: 'number',
		label: 'Disk cache entries',
		description: 'The number of results in the browser disk cache (OPFS).',
		min: 1,
		max: 500,
		step: 1,
		unit: 'results'
	},
	{
		key: 'diskCacheMaxTotalBytes',
		group: 'Result cache',
		type: 'number',
		label: 'Disk cache size',
		description: 'The total size of the compressed results on disk.',
		min: 64,
		max: 65_536,
		step: 64,
		unit: 'MiB',
		scale: 1024 * 1024
	},
	{
		key: 'diskCacheMaxAgeMs',
		group: 'Result cache',
		type: 'number',
		label: 'Disk cache lifetime',
		description: 'The age at which a result on disk becomes stale. A stale result goes away.',
		min: 1,
		max: 720,
		step: 1,
		unit: 'hours',
		scale: 60 * 60 * 1000
	},
	{
		key: 'mapStyleUrl',
		group: 'Map',
		type: 'text',
		label: 'Base map style URL',
		description: 'The MapLibre style URL of the base map. A change applies to the next map.',
		placeholder: 'https://example.com/style.json'
	},
	{
		key: 'mapGroupByDecimals',
		group: 'Map',
		type: 'number',
		label: 'Map group decimals',
		description:
			'The decimals that the map groups coordinates by. 4 = 11 m, 3 = 111 m, 2 = 1111 m, 1 = 11111 m, 0 = 111111 m.',
		min: 0,
		max: 6,
		step: 1,
		unit: 'decimals'
	},
	{
		key: 'crossSectionWidthKm',
		group: 'Map',
		type: 'number',
		label: 'Cross section width',
		description: 'The width of a new cross section band.',
		min: 0.1,
		max: 500,
		step: 0.1,
		unit: 'km'
	},
	{
		key: 'sampleAfterRows',
		group: 'Plot',
		type: 'number',
		label: 'Plot sample threshold',
		description: 'The number of rows after which a plot samples the data. A lower value keeps the browser stable.',
		min: 10_000,
		max: 10_000_000,
		step: 10_000,
		unit: 'rows'
	},
	{
		key: 'systemInfoUpdateIntervalMs',
		group: 'System',
		type: 'number',
		label: 'System info refresh',
		description: 'The period between two reads of the system info page.',
		min: 0.5,
		max: 60,
		step: 0.5,
		unit: 'seconds',
		scale: 1000
	}
];

/** The definition of one key, or undefined for an unknown key. */
export function definitionOf(key: SettingKey): SettingDefinition | undefined {
	return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}

/**
 * Fill the gaps of a stored object with the defaults, and drop a value of the
 * wrong type. A new app version can add a key, and an old stored object has no
 * value for it.
 */
function normalize(stored: Partial<BeaconStudioSettings> | null | undefined): BeaconStudioSettings {
	const result = { ...DEFAULT_SETTINGS };
	if (!stored) return result;

	for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
		const value = stored[key];
		const fallback = DEFAULT_SETTINGS[key];

		if (typeof value !== typeof fallback) continue;
		if (typeof value === 'number' && !Number.isFinite(value)) continue;

		// TypeScript cannot see that key, value and fallback share one type.
		(result as Record<string, unknown>)[key] = value;
	}

	return result;
}

/** Keep a number inside the range of its definition. The range uses display units. */
function clamp(key: SettingKey, value: number): number {
	const definition = definitionOf(key);
	if (!definition || definition.type !== 'number') return value;

	const scale = definition.scale ?? 1;
	return Math.min(definition.max * scale, Math.max(definition.min * scale, value));
}

const store = persisted<BeaconStudioSettings>(STORAGE_KEY, DEFAULT_SETTINGS);

/**
 * The persisted settings. Use `$settings` in a component.
 *
 * The store passes every value through {@link normalize}, so a component always
 * reads a complete object. A stored object of an older app version can miss a
 * key.
 */
export const settings: Readable<BeaconStudioSettings> = derived(store, (value) => normalize(value));

/** A snapshot of the settings, for plain modules. Call it at the point of use. */
export function getSettings(): BeaconStudioSettings {
	return normalize(get(store));
}

/** Write one setting. A number goes through the range of its definition. */
export function setSetting<K extends SettingKey>(key: K, value: BeaconStudioSettings[K]): void {
	let next = value;
	if (typeof next === 'number') {
		next = clamp(key, next) as BeaconStudioSettings[K];
	}

	// `getSettings` reads the stored object first. A plain `update` would start
	// from the initial value while no component subscribes, and overwrite storage.
	store.set({ ...getSettings(), [key]: next });
}

/** Put one setting back to its default. */
export function resetSetting(key: SettingKey): void {
	setSetting(key, DEFAULT_SETTINGS[key]);
}

/** Put every setting back to its default. */
export function resetSettings(): void {
	store.set({ ...DEFAULT_SETTINGS });
}
