/**
 * The default range of the map legend.
 *
 * These live in their own module, and not in `Legend.svelte`, because
 * `MapViewController` needs them too. A `.svelte.ts` controller that imports a
 * constant from a component drags the whole component into its module graph.
 *
 * The range is deliberately wide. The controller replaces it with the real range
 * of the column as soon as it paints one. See `createLayer`.
 */
export const SCALE_DEFAULT_MIN = -1000;
export const SCALE_DEFAULT_MAX = 1000;

/** How many blocks the legend strip is built from. */
export const COLOR_SCALE_BLIPS = 100;
