/**
 * The colour palettes of the app. The chart explorer paints its Z axis with
 * them, and the map viewer paints its points.
 *
 * The palettes come from `colormaps.json`, which holds the cmocean set. Those
 * maps are built for ocean data: each one is perceptually uniform, so an equal
 * step in value is an equal step in apparent colour, and most stay readable in
 * greyscale and for the common colour vision types.
 *
 * A colormap is a list of stops. A stop is a position from 0 to 1 and an RGB
 * triple. Two interpolation modes exist:
 *   - `lab`     blend two stops in CIELAB. This is the perceptually even path.
 *   - `nearest` no blend. The colour steps at each stop.
 *
 * The file is 130 kB, and most pages of the app draw no data. Therefore it loads
 * through a dynamic import, which keeps it in its own chunk. Call
 * {@link loadColormaps} once before the first draw. Every read below is
 * synchronous, because neither a canvas nor a deck.gl accessor can await a
 * colour. A read before the load gets {@link FALLBACK_COLORMAP}.
 *
 * A colour table is quantised to {@link TABLE_SIZE} steps and cached per
 * colormap, as CSS strings for a canvas and as bytes for deck.gl. Neither
 * renderer can show more steps than that, and the cache turns a redraw into a
 * lookup per point instead of an interpolation.
 */
import { interpolateLab } from 'd3-interpolate';

export type ColormapInterpolation = 'lab' | 'nearest';

/** A position from 0 to 1, and the colour at it. */
export interface ColormapStop {
	position: number;
	rgb: [number, number, number];
}

export interface Colormap {
	id: string;
	label: string;
	description: string;
	interpolation: ColormapInterpolation;
	stops: ColormapStop[];
	/** True when every stop holds the same colour. The palette picker groups these. */
	solid: boolean;
}

/** A palette is stored as its id alone. An unknown id falls back to the default. */
export type PaletteId = string;

export const DEFAULT_PALETTE_ID: PaletteId = 'thermal';

/** How many steps a cached colour table holds. */
const TABLE_SIZE = 256;

/**
 * The palette used before `colormaps.json` arrives, and when it fails to load.
 * It is the coarse form of viridis, so a plot drawn in this state still reads
 * correctly.
 */
export const FALLBACK_COLORMAP: Colormap = {
	id: 'fallback',
	label: 'Viridis',
	description: 'The built-in palette. Used while the colormap file loads.',
	interpolation: 'lab',
	solid: false,
	stops: [
		{ position: 0, rgb: [68, 1, 84] },
		{ position: 0.25, rgb: [59, 82, 139] },
		{ position: 0.5, rgb: [33, 145, 140] },
		{ position: 0.75, rgb: [94, 201, 98] },
		{ position: 1, rgb: [253, 231, 37] }
	]
};

// -- loading -----------------------------------------------------------------

/** The shape of `colormaps.json`. */
type ColormapFile = {
	colormaps: Array<{
		name: string;
		description?: string;
		interpolation?: string;
		scale: Array<[number, [number, number, number]]>;
	}>;
};

let registry: Map<string, Colormap> | null = null;
let loading: Promise<void> | null = null;

function toColormap(raw: ColormapFile['colormaps'][number]): Colormap | null {
	if (!raw?.name || !Array.isArray(raw.scale) || raw.scale.length === 0) return null;

	const stops: ColormapStop[] = [];

	for (const entry of raw.scale) {
		if (!Array.isArray(entry) || entry.length < 2) continue;

		const [position, rgb] = entry;
		if (typeof position !== 'number' || !Array.isArray(rgb) || rgb.length < 3) continue;

		stops.push({ position, rgb: [Number(rgb[0]), Number(rgb[1]), Number(rgb[2])] });
	}

	if (stops.length === 0) return null;

	stops.sort((a, b) => a.position - b.position);

	const first = stops[0].rgb;
	const solid = stops.every(
		(stop) => stop.rgb[0] === first[0] && stop.rgb[1] === first[1] && stop.rgb[2] === first[2]
	);

	let interpolation: ColormapInterpolation = 'lab';
	if (raw.interpolation === 'nearest') interpolation = 'nearest';

	return {
		id: raw.name,
		label: labelFor(raw.name),
		description: raw.description ?? '',
		interpolation,
		stops,
		solid
	};
}

/** "solid_black" reads as "Solid black", "haline" as "Haline". */
function labelFor(name: string): string {
	const words = name.replace(/_/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Load the colormap file. Safe to call many times: the first call does the work
 * and every later call gets the same promise.
 *
 * A failure is not fatal. The registry stays empty, every lookup returns
 * {@link FALLBACK_COLORMAP}, and the plots still draw.
 */
export function loadColormaps(): Promise<void> {
	if (loading) return loading;

	loading = import('./colormaps.json')
		.then((module) => {
			const file = (module.default ?? module) as unknown as ColormapFile;
			const loaded = new Map<string, Colormap>();

			for (const raw of file.colormaps ?? []) {
				const colormap = toColormap(raw);
				if (colormap) loaded.set(colormap.id, colormap);
			}

			registry = loaded;
		})
		.catch((error) => {
			console.error('Failed to load the colormaps:', error);
			registry = new Map();
		});

	return loading;
}

/** True once {@link loadColormaps} has finished. */
export function colormapsReady(): boolean {
	return registry !== null;
}

/** Every colormap, in the order of the file. Empty before the load. */
export function listColormaps(): Colormap[] {
	if (!registry) return [];
	return [...registry.values()];
}

/** The colormap with this id, or the fallback. */
export function getColormap(id: string | null | undefined): Colormap {
	if (!registry) return FALLBACK_COLORMAP;

	if (id) {
		const found = registry.get(id);
		if (found) return found;
	}

	return registry.get(DEFAULT_PALETTE_ID) ?? FALLBACK_COLORMAP;
}

/** True when the id names a colormap that is loaded. */
export function isPaletteId(value: unknown): value is PaletteId {
	if (typeof value !== 'string') return false;
	if (!registry) return true; // Before the load, keep whatever storage holds.
	return registry.has(value);
}

// -- colour tables -----------------------------------------------------------

/** `rgb(r, g, b)` for one position in a colormap. */
function colorAt(colormap: Colormap, t: number): string {
	const stops = colormap.stops;

	let position = t;
	if (position < 0) position = 0;
	if (position > 1) position = 1;

	if (stops.length === 1) return rgbString(stops[0].rgb);

	// The first stop at or after the position. The pair around it does the blend.
	let upper = stops.findIndex((stop) => stop.position >= position);
	if (upper === -1) upper = stops.length - 1;
	if (upper === 0) return rgbString(stops[0].rgb);

	const before = stops[upper - 1];
	const after = stops[upper];

	if (colormap.interpolation === 'nearest') {
		return rgbString(before.rgb);
	}

	const span = after.position - before.position;
	if (span <= 0) return rgbString(after.rgb);

	const local = (position - before.position) / span;
	return interpolateLab(rgbString(before.rgb), rgbString(after.rgb))(local);
}

function rgbString(rgb: [number, number, number]): string {
	return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

const tableCache = new Map<string, string[]>();

/**
 * The colour table of a colormap: {@link TABLE_SIZE} colours from its start to
 * its end. Built once per colormap and kept.
 */
export function getColorTable(id: string | null | undefined): string[] {
	const colormap = getColormap(id);
	const cached = tableCache.get(colormap.id);
	if (cached) return cached;

	const table: string[] = new Array(TABLE_SIZE);

	for (let i = 0; i < TABLE_SIZE; i++) {
		table[i] = colorAt(colormap, i / (TABLE_SIZE - 1));
	}

	tableCache.set(colormap.id, table);
	return table;
}

const rgbTableCache = new Map<string, Uint8Array>();

/**
 * The colour table of a colormap as raw bytes: `TABLE_SIZE` colours, three
 * bytes each, so entry `i` is at `3 * i`.
 *
 * deck.gl wants an `[r, g, b]` per point, and the map calls its colour accessor
 * once for every row on every redraw. A CSS string there would mean a format and
 * a parse per point. This table makes it an array read.
 */
export function getRgbTable(id: string | null | undefined): Uint8Array {
	const colormap = getColormap(id);
	const cached = rgbTableCache.get(colormap.id);
	if (cached) return cached;

	const table = new Uint8Array(TABLE_SIZE * 3);
	const colors = getColorTable(colormap.id);

	for (let i = 0; i < TABLE_SIZE; i++) {
		const parsed = parseRgb(colors[i]);
		table[i * 3] = parsed[0];
		table[i * 3 + 1] = parsed[1];
		table[i * 3 + 2] = parsed[2];
	}

	rgbTableCache.set(colormap.id, table);
	return table;
}

/** Read the three numbers back out of an `rgb(r, g, b)` string. */
function parseRgb(value: string): [number, number, number] {
	const match = value.match(/-?\d+(\.\d+)?/g);
	if (!match || match.length < 3) return [0, 0, 0];

	return [clampByte(Number(match[0])), clampByte(Number(match[1])), clampByte(Number(match[2]))];
}

function clampByte(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value < 0) return 0;
	if (value > 255) return 255;
	return Math.round(value);
}

/**
 * The position of a value inside a range, as an index into a colour table.
 *
 * A value outside the range clamps to the end. A range of zero width has no
 * direction, so every value takes the middle.
 */
export function paletteIndex(value: number, min: number, max: number, reverse: boolean): number {
	const span = max - min;
	let t = 0.5;

	if (span !== 0) {
		t = (value - min) / span;
		if (!Number.isFinite(t)) t = 0;
		if (t < 0) t = 0;
		if (t > 1) t = 1;
	}

	if (reverse) t = 1 - t;
	return Math.round(t * (TABLE_SIZE - 1));
}

/**
 * The colour function of a palette over the range `[min, max]`.
 *
 * A value outside the range clamps to the end colour. It does not disappear.
 * Set `reverse` to turn the palette around, which a depth axis often needs.
 *
 * A range of zero width has no direction. Every value then takes the middle
 * colour.
 */
export function makePaletteScale(
	id: string | null | undefined,
	min: number,
	max: number,
	reverse = false
): (value: number) => string {
	const table = getColorTable(id);
	return (value: number) => table[paletteIndex(value, min, max, reverse)];
}

/** Evenly spaced sample colours. The colour bar and the palette picker use these. */
export function samplePalette(
	id: string | null | undefined,
	steps: number,
	reverse = false
): string[] {
	const table = getColorTable(id);
	const colors: string[] = new Array(steps);

	for (let i = 0; i < steps; i++) {
		let t = 0;
		if (steps > 1) t = i / (steps - 1);
		if (reverse) t = 1 - t;

		colors[i] = table[Math.round(t * (TABLE_SIZE - 1))];
	}

	return colors;
}
