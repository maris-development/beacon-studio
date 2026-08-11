/**
 * AlongLine — the distance of a point along a cross section line.
 *
 * The cross section plot puts this distance on its X axis. A row therefore lands
 * where the ship crossed the line, and not where the row sits in the result. The
 * value is stable: it does not depend on the row order, and two rows at the same
 * place get the same X.
 *
 * The math works in the same local equirectangular frame as
 * {@link crossSectionRing} in `spatial-selection.ts`: kilometres relative to the
 * first point of the line, with the longitude scale taken at the mean latitude of
 * the line. Over the width of one cross section that frame is accurate enough,
 * and it makes the projection a plain 2D dot product.
 *
 * A point projects onto the nearest segment of the line. The distance is the
 * length of the line up to that segment, plus the run along it. A point beside
 * the end of the line clamps to the end.
 */
import type { LngLat } from './spatial-selection';

/** Kilometres in one degree of latitude. */
const KM_PER_DEGREE = 111.32;

type Segment = {
	/** Start of the segment, in local kilometres. */
	x: number;
	y: number;
	/** The segment vector. */
	dx: number;
	dy: number;
	/** `1 / (dx² + dy²)`. Zero for a segment of no length. */
	inverseLengthSquared: number;
	length: number;
	/** The length of the line before this segment. */
	distanceBefore: number;
};

export interface AlongLineProjection {
	/** The distance of a point along the line, in kilometres. */
	distanceKm: (longitude: number, latitude: number) => number;
	/** The total length of the line, in kilometres. */
	totalKm: number;
}

/**
 * Build the projector for one line.
 *
 * The setup runs once and the returned function runs per row. Therefore the
 * segment table below is worth building, also for a short line.
 *
 * Returns null when the line has less than two usable points.
 */
export function makeAlongLineProjection(
	line: ReadonlyArray<LngLat> | null | undefined
): AlongLineProjection | null {
	if (!line || line.length < 2) return null;

	const points = line.filter(
		([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)
	) as LngLat[];

	if (points.length < 2) return null;

	const centreLat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
	const kmPerDegreeLon = KM_PER_DEGREE * Math.cos((centreLat * Math.PI) / 180);

	// Guard the poles, where a degree of longitude collapses to nothing.
	const lonScale = Math.max(kmPerDegreeLon, 1e-6);
	const origin = points[0];

	const toLocal = (lon: number, lat: number): [number, number] => [
		(lon - origin[0]) * lonScale,
		(lat - origin[1]) * KM_PER_DEGREE
	];

	const segments: Segment[] = [];
	let distanceBefore = 0;

	for (let i = 0; i < points.length - 1; i++) {
		const [x, y] = toLocal(points[i][0], points[i][1]);
		const [nextX, nextY] = toLocal(points[i + 1][0], points[i + 1][1]);

		const dx = nextX - x;
		const dy = nextY - y;
		const lengthSquared = dx * dx + dy * dy;

		let inverseLengthSquared = 0;
		if (lengthSquared > 0) inverseLengthSquared = 1 / lengthSquared;

		const length = Math.sqrt(lengthSquared);

		segments.push({ x, y, dx, dy, inverseLengthSquared, length, distanceBefore });
		distanceBefore += length;
	}

	const totalKm = distanceBefore;

	function distanceKm(longitude: number, latitude: number): number {
		if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return NaN;

		const [px, py] = toLocal(longitude, latitude);

		let bestDistance = 0;
		let bestOffsetSquared = Number.POSITIVE_INFINITY;

		for (const segment of segments) {
			const toPointX = px - segment.x;
			const toPointY = py - segment.y;

			// The position along the segment, clamped to its two ends.
			let t = 0;
			if (segment.inverseLengthSquared > 0) {
				t = (toPointX * segment.dx + toPointY * segment.dy) * segment.inverseLengthSquared;
				if (t < 0) t = 0;
				if (t > 1) t = 1;
			}

			const offsetX = toPointX - t * segment.dx;
			const offsetY = toPointY - t * segment.dy;
			const offsetSquared = offsetX * offsetX + offsetY * offsetY;

			if (offsetSquared < bestOffsetSquared) {
				bestOffsetSquared = offsetSquared;
				bestDistance = segment.distanceBefore + t * segment.length;
			}
		}

		return bestDistance;
	}

	return { distanceKm, totalKm };
}
