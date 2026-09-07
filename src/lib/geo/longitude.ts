/**
 * Longitude helpers.
 *
 * A dataset uses the convention of its producer. Model output often uses
 * 0..360, where 185 means -175. A ring that the user draws after a pan to the
 * east holds values over 180 in the same way.
 *
 * The map draws one world, from -180 to 180. deck.gl puts a point at the raw
 * longitude, so a point at 185 lands outside that world, and the map drops it
 * as soon as the viewport no longer covers the second copy. Every longitude
 * therefore needs a canonical value before it reaches the map, the bounds of a
 * fit, or a comparison with a drawn shape.
 */

/** Degrees in one turn of the globe. */
const TURN = 360;

/** The value of `longitude` in -180..180. A value of 180 becomes -180. */
export function wrapLongitude(longitude: number): number {
    if (!Number.isFinite(longitude)) return longitude;
    return ((((longitude + 180) % TURN) + TURN) % TURN) - 180;
}

/**
 * The copy of `longitude` that lies closest to `reference`.
 *
 * Use it to compare a point with a shape. Both must sit in the same copy of the
 * world, or a point at 185 misses a box that the user drew at -175.
 */
export function alignLongitude(longitude: number, reference: number): number {
    if (!Number.isFinite(longitude) || !Number.isFinite(reference)) return longitude;
    return longitude - TURN * Math.round((longitude - reference) / TURN);
}

/** The west and east edge of a group of longitudes. `east` can be over 180. */
export type LongitudeExtent = {
    west: number;
    east: number;
};

/**
 * Collects longitudes and reports the extent that holds them all.
 *
 * The extent of a group over the antimeridian is not the extent of its wrapped
 * values: data from 170 to 190 wraps to -180..180, the whole world. The class
 * therefore keeps the range in two frames, -180..180 and 0..360, and reports
 * the narrower of the two. The second frame answers for a group over the
 * antimeridian, the first for a group over the prime meridian.
 */
export class LongitudeRange {
    private minWrapped = Infinity;
    private maxWrapped = -Infinity;
    private minPositive = Infinity;
    private maxPositive = -Infinity;

    add(longitude: number): void {
        const wrapped = wrapLongitude(longitude);
        if (!Number.isFinite(wrapped)) return;

        if (wrapped < this.minWrapped) this.minWrapped = wrapped;
        if (wrapped > this.maxWrapped) this.maxWrapped = wrapped;

        const positive = wrapped < 0 ? wrapped + TURN : wrapped;
        if (positive < this.minPositive) this.minPositive = positive;
        if (positive > this.maxPositive) this.maxPositive = positive;
    }

    /** The extent, or null when the class received no finite longitude. */
    extent(): LongitudeExtent | null {
        if (this.minWrapped === Infinity) return null;

        const wrappedSpan = this.maxWrapped - this.minWrapped;
        const positiveSpan = this.maxPositive - this.minPositive;

        if (positiveSpan < wrappedSpan) {
            return { west: this.minPositive, east: this.maxPositive };
        }

        return { west: this.minWrapped, east: this.maxWrapped };
    }
}
