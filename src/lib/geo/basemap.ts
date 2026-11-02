/**
 * The base map of the theme.
 *
 * The default base map has a dark version. A custom style URL of the user stays
 * the same in both themes.
 *
 * `map.setStyle` removes every source and layer that the app added. Terra Draw
 * and the area preview then lose their sources, and Terra Draw throws on its next
 * update. {@link keepAppLayers} copies them into the new style. A new MapLibre
 * source needs an id with one of {@link APP_LAYER_PREFIXES}, or a theme switch
 * deletes it.
 */

import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Readable } from "svelte/store";
import { DEFAULT_SETTINGS, type ResolvedTheme } from "@/stores/settings";

/** The dark version of the default base map. */
export const DARK_MAP_STYLE_URL =
    "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

/** The source of the drawn area. `MapDrawTools` adds it, with its layers. */
export const SELECTION_PREVIEW_SOURCE = "spatial-selection-preview";

/** The id prefixes of the sources and layers that the app adds. `td-` is Terra Draw. */
export const APP_LAYER_PREFIXES = ["td-", "spatial-selection-"] as const;

/** The style URL of the base map for a theme. */
export function basemapUrl(styleUrl: string, theme: ResolvedTheme): string {
    if (theme === "dark" && styleUrl === DEFAULT_SETTINGS.mapStyleUrl) return DARK_MAP_STYLE_URL;
    return styleUrl;
}

function isAppId(id: string): boolean {
    return APP_LAYER_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * A MapLibre `transformStyle`: copy the sources and layers of the app from the
 * previous style to the top of the next one. deck.gl adds its own layers again.
 */
export function keepAppLayers(
    previous: StyleSpecification | undefined,
    next: StyleSpecification
): StyleSpecification {
    if (!previous) return next;

    const sources = Object.entries(previous.sources).filter(([id]) => isAppId(id));
    const layers = previous.layers.filter(
        (layer) => isAppId(layer.id) && !next.layers.some((own) => own.id === layer.id)
    );

    return {
        ...next,
        sources: { ...next.sources, ...Object.fromEntries(sources) },
        layers: [...next.layers, ...layers]
    };
}

/**
 * Switch the base map of `map` when the theme changes. `styleUrl` is the setting
 * that the map started with. Returns the stop function.
 */
export function followBasemapTheme(
    map: MapLibreMap,
    styleUrl: string,
    theme: Readable<ResolvedTheme>
): () => void {
    let current: string | null = null;

    return theme.subscribe((value) => {
        const next = basemapUrl(styleUrl, value);
        // The first call reports the theme that the map started with.
        if (current !== null && next !== current) {
            map.setStyle(next, { transformStyle: keepAppLayers });
        }
        current = next;
    });
}
