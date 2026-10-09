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
import { TELEMETRY_BUILD_ENABLED } from '@/build-info';
import { AUTO_LANGUAGE, SUPPORTED_LOCALES, type MessageKey } from '@/i18n';

/** The localStorage key of the settings object. */
const STORAGE_KEY = 'beacon-studio.settings';

export interface BeaconStudioSettings {
	// -- general --------------------------------------------------------------
	/** The language code of the app, or `auto` for the browser language. */
	language: string;

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

	// -- telemetry ------------------------------------------------------------
	/** Sends pseudonymous usage events to beacon-datalake.org. A random install id groups them. */
	telemetryEnabled: boolean;
	/** Adds the content of a query to its events: the table, the columns and the filters. */
	telemetryQueryDetails: boolean;
	/** Adds `console.log` to the reported console output. Off by default: it is noisy, and a log line can hold a query. */
	telemetryConsoleLog: boolean;
}

export const DEFAULT_SETTINGS: BeaconStudioSettings = {
	language: AUTO_LANGUAGE,

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

	systemInfoUpdateIntervalMs: 1000,

	telemetryEnabled: true,
	telemetryQueryDetails: true,
	telemetryConsoleLog: false
};

/** The keys of one settings object. */
export type SettingKey = keyof BeaconStudioSettings;

/** The id of a group. The page shows `settings.group.<id>`. */
export type SettingGroup =
	| 'general'
	| 'queries'
	| 'resultCache'
	| 'map'
	| 'system'
	| 'plot'
	| 'telemetry';

/** The page shows `settings.field.<key>.label` and `.description` for each definition. */
interface BaseDefinition {
	key: SettingKey;
	group: SettingGroup;
}

export interface NumberSettingDefinition extends BaseDefinition {
	type: 'number';
	min: number;
	max: number;
	/** The step of the input, in display units. */
	step?: number;
	/** The unit of the display value. */
	unit?: MessageKey;
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
	/** `label` is a proper name and stays as it is. `labelKey` is translated. */
	options: Array<{ value: string; label?: string; labelKey?: MessageKey }>;
}

export type SettingDefinition =
	| NumberSettingDefinition
	| TextSettingDefinition
	| BooleanSettingDefinition
	| SelectSettingDefinition;

/** One entry per setting. The settings page builds its form from this list. */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
	{
		key: 'language',
		group: 'general',
		type: 'select',
		options: [
			{ value: AUTO_LANGUAGE, labelKey: 'language.auto' },
			...SUPPORTED_LOCALES.map((entry) => ({ value: entry.code, label: entry.name }))
		]
	},
	{
		key: 'defaultOutputFormat',
		group: 'queries',
		type: 'select',
		options: [
			{ label: 'Parquet', value: 'parquet' },
			{ label: 'CSV', value: 'csv' },
			{ label: 'Arrow', value: 'arrow' },
			{ label: 'NetCDF', value: 'netcdf' }
		]
	},
	{
		key: 'requireQueryFilters',
		group: 'queries',
		type: 'boolean'
	},
	{
		key: 'queryCellLimit',
		group: 'queries',
		type: 'number',
		min: 1,
		max: 1000,
		step: 1,
		unit: 'settings.unit.millionCells',
		scale: 1_000_000
	},
	{
		key: 'queryHistoryMax',
		group: 'queries',
		type: 'number',
		min: 1,
		max: 1000,
		step: 1,
		unit: 'settings.unit.entries'
	},
	{
		key: 'memoryCacheMaxEntries',
		group: 'resultCache',
		type: 'number',
		min: 1,
		max: 32,
		step: 1,
		unit: 'settings.unit.results'
	},
	{
		key: 'workerMaxLoadedTables',
		group: 'resultCache',
		type: 'number',
		min: 1,
		max: 8,
		step: 1,
		unit: 'settings.unit.tables'
	},
	{
		key: 'diskCacheMaxEntries',
		group: 'resultCache',
		type: 'number',
		min: 1,
		max: 500,
		step: 1,
		unit: 'settings.unit.results'
	},
	{
		key: 'diskCacheMaxTotalBytes',
		group: 'resultCache',
		type: 'number',
		min: 64,
		max: 65_536,
		step: 64,
		unit: 'settings.unit.mib',
		scale: 1024 * 1024
	},
	{
		key: 'diskCacheMaxAgeMs',
		group: 'resultCache',
		type: 'number',
		min: 1,
		max: 720,
		step: 1,
		unit: 'settings.unit.hours',
		scale: 60 * 60 * 1000
	},
	{
		key: 'mapStyleUrl',
		group: 'map',
		type: 'text',
		placeholder: 'https://example.com/style.json'
	},
	{
		key: 'mapGroupByDecimals',
		group: 'map',
		type: 'number',
		min: 0,
		max: 6,
		step: 1,
		unit: 'settings.unit.decimals'
	},
	{
		key: 'crossSectionWidthKm',
		group: 'map',
		type: 'number',
		min: 0.1,
		max: 500,
		step: 0.1,
		unit: 'settings.unit.km'
	},
	{
		key: 'sampleAfterRows',
		group: 'plot',
		type: 'number',
		min: 10_000,
		max: 10_000_000,
		step: 10_000,
		unit: 'settings.unit.rows'
	},
	{
		key: 'systemInfoUpdateIntervalMs',
		group: 'system',
		type: 'number',
		min: 0.5,
		max: 60,
		step: 0.5,
		unit: 'settings.unit.seconds',
		scale: 1000
	},
	{
		key: 'telemetryEnabled',
		group: 'telemetry',
		type: 'boolean'
	},
	{
		key: 'telemetryQueryDetails',
		group: 'telemetry',
		type: 'boolean'
	},
	{
		key: 'telemetryConsoleLog',
		group: 'telemetry',
		type: 'boolean'
	}
];

/** The definitions that the settings page shows. A build without telemetry hides that group. */
export const VISIBLE_SETTING_DEFINITIONS: SettingDefinition[] = SETTING_DEFINITIONS.filter(
	(definition) => TELEMETRY_BUILD_ENABLED || definition.group !== 'telemetry'
);

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
