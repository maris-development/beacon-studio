/**
 * CoordinateColumns — find the latitude and longitude columns of a result set,
 * and work out whether their values are actually WGS84 degrees.
 *
 * Two separate problems live here, and they fail in different ways.
 *
 * 1. *Which* columns hold the position. Names vary wildly across datasets:
 *    `LATITUDE`, `lat_dd`, `nav_lat`, `y_wgs84`, `deploy_lat_deg`, `NORTHING`.
 *    A substring test for "latitude" also matches `latitude_qc` and
 *    `latitude_uncertainty`, which are not positions at all.
 *
 * 2. *What unit* those columns are in. This is the dangerous one. The server
 *    filter is a point-in-polygon test in degrees (see `geo_json.rs`), so a
 *    column of UTM metres compiles into a valid query that quietly matches
 *    zero rows. Detection must therefore report the coordinate system, and the
 *    caller must refuse to build a filter when it is not degrees.
 *
 * Names alone can never settle problem 2, so {@link detectCoordinateColumns}
 * takes optional sample values. Without them it reports `unknown` rather than
 * assuming degrees.
 */

/** How the numbers in a coordinate column are encoded. */
export type CoordinateSystem =
	/** Plain WGS84 decimal degrees. The only system the geo filter accepts. */
	| 'degrees'
	/** Degrees scaled to integers, e.g. 48.6112 stored as 486112000. */
	| 'scaled-degrees'
	/** Radians. Only reported when degrees are ruled out. */
	| 'radians'
	/** Packed degrees and minutes, e.g. 4836.672 for 48° 36.672'. */
	| 'degrees-minutes'
	/** EPSG:3857 metres. Invertible with pure arithmetic. */
	| 'web-mercator'
	/** UTM or another projection in metres. Needs a real reprojection library. */
	| 'projected-metres'
	/** No sample values were supplied, or the values make no sense. */
	| 'unknown';

export type CoordinateColumn = {
	name: string;
	/** 0..1. Above 0.7 the name is explicit; below 0.5 it is a guess. */
	confidence: number;
	/** Why this column was picked. Useful in a tooltip or a log line. */
	evidence: string[];
};

export type CoordinateDetection = {
	latitude: CoordinateColumn | null;
	longitude: CoordinateColumn | null;
	system: CoordinateSystem;
	/** Scale factor for `scaled-degrees`. 1 for every other system. */
	scale: number;
	/**
	 * True only when both columns are known AND their values are degrees.
	 * Callers must gate the geo filter on this, not on the two names.
	 */
	usableForGeoFilter: boolean;
	warnings: string[];
};

/** Sample values for one column. Strings are fine; they get coerced. */
export type ColumnSamples = Record<string, ReadonlyArray<unknown>>;

/**
 * Field metadata, when the schema carries it. CF conventions name the axis
 * outright, which beats every heuristic below, so it is checked first.
 */
export type ColumnMetadata = {
	/** CF `units`, e.g. "degrees_north". */
	units?: string | null;
	/** CF `standard_name`, e.g. "latitude". */
	standardName?: string | null;
	/** CF `axis`, "X" or "Y". */
	axis?: string | null;
};

type Axis = 'lat' | 'lon';

/* ------------------------------------------------------------------ names */

/**
 * Tokens that turn a coordinate-looking name into something else: an error
 * bar, a flag, a bounding box edge. They only apply once a coordinate token
 * has matched, so an unrelated column named `qc_flag` is unaffected.
 */
const DISQUALIFYING = [
	'qc',
	'flag',
	'quality',
	'error',
	'err',
	'uncert',
	'stddev',
	'std_dev',
	'sigma',
	'variance',
	'count',
	'bounds',
	'bnds',
	'_min',
	'_max',
	'delta',
	'offset',
	'resolution',
	'accuracy',
	'long_name',
	'units',
	'unit'
];

/**
 * Name rules, strongest first. Each returns a confidence for its axis.
 * `northing`/`easting` score lower because they usually mean projected metres,
 * which the value check then confirms or denies.
 */
const NAME_RULES: ReadonlyArray<{ axis: Axis; pattern: RegExp; score: number; why: string }> = [
	{ axis: 'lat', pattern: /^lat(itude)?$/, score: 1, why: 'name is exactly "latitude"' },
	{ axis: 'lon', pattern: /^lon(g|gitude)?$/, score: 1, why: 'name is exactly "longitude"' },

	{ axis: 'lat', pattern: /(^|[^a-z])latitude([^a-z]|$)/, score: 0.9, why: 'contains "latitude"' },
	{ axis: 'lon', pattern: /(^|[^a-z])longitude([^a-z]|$)/, score: 0.9, why: 'contains "longitude"' },

	{ axis: 'lat', pattern: /(^|[_\- ])lat([_\- ]|$)/, score: 0.85, why: 'has a "lat" token' },
	{ axis: 'lon', pattern: /(^|[_\- ])(lon|lng|long)([_\- ]|$)/, score: 0.85, why: 'has a "lon" token' },

	{ axis: 'lat', pattern: /^lat[_\- ]?(dd|deg|degs|degrees|d|n)$/, score: 0.85, why: 'lat with a degree suffix' },
	{ axis: 'lon', pattern: /^(lon|lng|long)[_\- ]?(dd|deg|degs|degrees|d|e)$/, score: 0.85, why: 'lon with a degree suffix' },

	{ axis: 'lat', pattern: /northing/, score: 0.55, why: 'named "northing", usually projected' },
	{ axis: 'lon', pattern: /easting/, score: 0.55, why: 'named "easting", usually projected' },

	{ axis: 'lat', pattern: /^y([_\- ].*)?$|[_\- ]y$/, score: 0.35, why: 'y axis by convention' },
	{ axis: 'lon', pattern: /^x([_\- ].*)?$|[_\- ]x$/, score: 0.35, why: 'x axis by convention' }
];

/** CF metadata is authoritative. Nothing else comes close. */
function scoreMetadata(meta: ColumnMetadata | undefined, axis: Axis): { score: number; why: string } | null {
	if (!meta) return null;

	const units = meta.units?.toLowerCase().trim() ?? '';
	const standardName = meta.standardName?.toLowerCase().trim() ?? '';

	if (standardName === (axis === 'lat' ? 'latitude' : 'longitude')) {
		return { score: 1, why: `standard_name is "${standardName}"` };
	}

	const unitMatch = axis === 'lat' ? /^degrees?_?n(orth)?$/ : /^degrees?_?e(ast)?$/;
	if (unitMatch.test(units)) {
		return { score: 1, why: `units are "${meta.units}"` };
	}

	return null;
}

/** Strip the axis token out of a name, so a pair can be matched on the rest. */
function stem(name: string): string {
	return name
		.toLowerCase()
		.replace(/latitude|longitude|lat|lng|lon|long|northing|easting/g, '')
		.replace(/[_\- ]+/g, '');
}

function scoreName(name: string, axis: Axis): { score: number; evidence: string[] } {
	const lower = name.toLowerCase();
	const best = NAME_RULES.filter((rule) => rule.axis === axis && rule.pattern.test(lower)).sort(
		(a, b) => b.score - a.score
	)[0];

	if (!best) return { score: 0, evidence: [] };

	/* A disqualifying token means the column describes a coordinate rather than
	 * being one: `latitude_qc`, `lat_uncertainty`, `lon_bnds`. */
	const blocked = DISQUALIFYING.find((token) => lower.includes(token));
	if (blocked) return { score: 0, evidence: [`rejected: name contains "${blocked}"`] };

	return { score: best.score, evidence: [best.why] };
}

/* ----------------------------------------------------------------- values */

function toNumbers(values: ReadonlyArray<unknown> | undefined): number[] {
	if (!values) return [];
	const numbers: number[] = [];
	for (const value of values) {
		const parsed = typeof value === 'number' ? value : Number(String(value).trim());
		if (Number.isFinite(parsed)) numbers.push(parsed);
	}
	return numbers;
}

/** True when every value could be a packed ddmm.mmm, i.e. minutes below 60. */
function looksLikeDegreesMinutes(values: number[], limit: number): boolean {
	if (values.length === 0) return false;
	return values.every((value) => {
		const absolute = Math.abs(value);
		return absolute <= limit && absolute % 100 < 60;
	});
}

/**
 * Work out the coordinate system from the value ranges of both columns.
 *
 * The order of the checks matters: plain degrees is the common case and must
 * win before the scaled and packed forms, which have wider ranges.
 */
export function detectCoordinateSystem(
	latValues: number[],
	lonValues: number[]
): { system: CoordinateSystem; scale: number; warnings: string[] } {
	const warnings: string[] = [];

	if (latValues.length === 0 || lonValues.length === 0) {
		return { system: 'unknown', scale: 1, warnings: ['No sample values, so the unit is unverified.'] };
	}

	const maxLat = Math.max(...latValues.map(Math.abs));
	const maxLon = Math.max(...lonValues.map(Math.abs));

	if (maxLat <= 90 && maxLon <= 180) {
		/* Radians cannot be excluded here: a survey inside 1.57 degrees of the
		 * equator produces the same range. Degrees is far more common, so it
		 * wins, but a caller showing a map should surface the note. */
		if (maxLat <= Math.PI / 2 && maxLon <= Math.PI) {
			warnings.push(
				'Values also fit radians. Degrees assumed, which is wrong if the extent is really global.'
			);
		}
		return { system: 'degrees', scale: 1, warnings };
	}

	/* Packed degrees and minutes is checked before scaling, because a ddmm value
	 * also divides down into a plausible degree. The minutes-below-60 rule is
	 * structural, so it is much harder to satisfy by accident. */
	if (looksLikeDegreesMinutes(latValues, 9060) && looksLikeDegreesMinutes(lonValues, 18060)) {
		return {
			system: 'degrees-minutes',
			scale: 1,
			warnings: ['Values look like packed degrees and minutes (ddmm.mmm).']
		};
	}

	/* Scaling is unidentifiable from range alone: UTM metres divide down into a
	 * plausible degree just as well. The tell is that scaled degrees are stored
	 * as integers, because the whole point is to avoid a float. Projected
	 * coordinates in metres almost always keep a fractional part. */
	const allIntegers =
		latValues.every((value) => Number.isInteger(value)) &&
		lonValues.every((value) => Number.isInteger(value));

	if (allIntegers) {
		for (const scale of [1e7, 1e6, 1e5]) {
			if (maxLat / scale <= 90 && maxLon / scale <= 180 && maxLat / scale > 0.01) {
				return {
					system: 'scaled-degrees',
					scale,
					warnings: [`Values look like degrees scaled by ${scale.toExponential(0)}.`]
				};
			}
		}
	}

	/* Web Mercator is bounded by the equator circumference. UTM northings stop
	 * at 10 000 000 and eastings sit between 160 000 and 834 000, so a large
	 * "longitude" is the tell for Mercator. */
	const MERCATOR_LIMIT = 20037509;
	if (maxLat <= MERCATOR_LIMIT && maxLon <= MERCATOR_LIMIT && maxLon > 834000) {
		return {
			system: 'web-mercator',
			scale: 1,
			warnings: ['Values look like EPSG:3857 metres.']
		};
	}

	return {
		system: 'projected-metres',
		scale: 1,
		warnings: [
			'Values are metres in an unknown projection, probably UTM. The zone is not recoverable from the data, so these cannot be converted here.'
		]
	};
}

/**
 * Convert a coordinate pair to WGS84 degrees.
 *
 * Returns null for `projected-metres` and `unknown`, which need the projection
 * definition. Every other system is pure arithmetic.
 */
export function toDegrees(
	latitude: number,
	longitude: number,
	system: CoordinateSystem,
	scale = 1
): [number, number] | null {
	if (system === 'degrees') {
		return [latitude, longitude];
	}

	if (system === 'scaled-degrees') {
		return [latitude / scale, longitude / scale];
	}

	if (system === 'radians') {
		return [(latitude * 180) / Math.PI, (longitude * 180) / Math.PI];
	}

	if (system === 'degrees-minutes') {
		const unpack = (value: number): number => {
			const sign = Math.sign(value) || 1;
			const absolute = Math.abs(value);
			const degrees = Math.floor(absolute / 100);
			const minutes = absolute - degrees * 100;
			return sign * (degrees + minutes / 60);
		};
		return [unpack(latitude), unpack(longitude)];
	}

	if (system === 'web-mercator') {
		const HALF_CIRCUMFERENCE = 20037508.34;
		const lon = (longitude / HALF_CIRCUMFERENCE) * 180;
		const raw = (latitude / HALF_CIRCUMFERENCE) * 180;
		const lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((raw * Math.PI) / 180)) - Math.PI / 2);
		return [lat, lon];
	}

	return null;
}

/* --------------------------------------------------------------- pairing */

type Candidate = { name: string; score: number; evidence: string[] };

function candidatesFor(
	names: string[],
	axis: Axis,
	metadata: Record<string, ColumnMetadata> | undefined
): Candidate[] {
	const found: Candidate[] = [];

	for (const name of names) {
		const fromMetadata = scoreMetadata(metadata?.[name], axis);
		if (fromMetadata) {
			found.push({ name, score: fromMetadata.score, evidence: [fromMetadata.why] });
			continue;
		}

		const fromName = scoreName(name, axis);
		if (fromName.score > 0) {
			found.push({ name, score: fromName.score, evidence: fromName.evidence });
		}
	}

	return found.sort((a, b) => b.score - a.score);
}

/**
 * Find the coordinate columns of a result set.
 *
 * Candidates are scored per axis, then paired. Pairing is what makes weak
 * names usable: `x_wgs84` and `y_wgs84` each score only 0.35 alone, but they
 * share a stem, so together they beat an unpaired `latitude_of_ship`.
 *
 * @param names   Every column name in the result.
 * @param samples Optional sample values per column. Without them the system is
 *                reported as `unknown` and the geo filter stays disabled.
 * @param metadata Optional CF field metadata per column. Beats every heuristic.
 */
export function detectCoordinateColumns(
	names: string[],
	samples?: ColumnSamples,
	metadata?: Record<string, ColumnMetadata>
): CoordinateDetection {
	const latCandidates = candidatesFor(names, 'lat', metadata);
	const lonCandidates = candidatesFor(names, 'lon', metadata);

	let best: { lat: Candidate; lon: Candidate; score: number } | null = null;

	for (const lat of latCandidates) {
		for (const lon of lonCandidates) {
			if (lat.name === lon.name) continue;

			/* A shared stem means the two names come from the same family, which
			 * is strong evidence even when each name on its own is weak. */
			const paired = stem(lat.name) === stem(lon.name);
			const score = lat.score + lon.score + (paired ? 0.5 : 0);

			if (!best || score > best.score) {
				best = { lat, lon, score };
			}
		}
	}

	if (!best) {
		return {
			latitude: null,
			longitude: null,
			system: 'unknown',
			scale: 1,
			usableForGeoFilter: false,
			warnings: ['No latitude and longitude columns found.']
		};
	}

	const paired = stem(best.lat.name) === stem(best.lon.name);
	const pairNote = paired ? ['paired with the other axis by name'] : [];

	let latitude: CoordinateColumn = {
		name: best.lat.name,
		confidence: Math.min(1, best.lat.score + (paired ? 0.15 : 0)),
		evidence: [...best.lat.evidence, ...pairNote]
	};

	let longitude: CoordinateColumn = {
		name: best.lon.name,
		confidence: Math.min(1, best.lon.score + (paired ? 0.15 : 0)),
		evidence: [...best.lon.evidence, ...pairNote]
	};

	let latValues = toNumbers(samples?.[latitude.name]);
	let lonValues = toNumbers(samples?.[longitude.name]);

	const warnings: string[] = [];

	/* A latitude beyond 90 next to a longitude within it means the two are the
	 * wrong way round. Only trust this when the ranges disagree clearly. */
	if (latValues.length > 0 && lonValues.length > 0) {
		const maxLat = Math.max(...latValues.map(Math.abs));
		const maxLon = Math.max(...lonValues.map(Math.abs));

		if (maxLat > 90 && maxLat <= 180 && maxLon <= 90) {
			[latitude, longitude] = [longitude, latitude];
			[latValues, lonValues] = [lonValues, latValues];
			warnings.push('The two columns were swapped: the value ranges say the axes are reversed.');
		}
	}

	const system = detectCoordinateSystem(latValues, lonValues);
	warnings.push(...system.warnings);

	return {
		latitude,
		longitude,
		system: system.system,
		scale: system.scale,
		usableForGeoFilter: system.system === 'degrees',
		warnings
	};
}
