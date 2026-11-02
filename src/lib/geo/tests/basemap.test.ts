import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import {
    basemapUrl,
    DARK_MAP_STYLE_URL,
    followBasemapTheme,
    keepAppLayers,
    SELECTION_PREVIEW_SOURCE
} from "../basemap";
import { DEFAULT_SETTINGS, type ResolvedTheme } from "@/stores/settings";

const DEFAULT_URL = DEFAULT_SETTINGS.mapStyleUrl;
const CUSTOM_URL = "https://example.com/style.json";

function style(sources: string[], layers: LayerSpecification[]): StyleSpecification {
    return {
        version: 8,
        sources: Object.fromEntries(
            sources.map((id) => [
                id,
                { type: "geojson", data: { type: "FeatureCollection", features: [] } }
            ])
        ),
        layers
    };
}

function lineLayer(id: string, source: string): LayerSpecification {
    return { id, type: "line", source };
}

describe("basemapUrl", () => {
    it("uses the dark version of the default map in dark mode", () => {
        expect(basemapUrl(DEFAULT_URL, "dark")).toBe(DARK_MAP_STYLE_URL);
        expect(basemapUrl(DEFAULT_URL, "light")).toBe(DEFAULT_URL);
    });

    it("keeps a custom map in both themes", () => {
        expect(basemapUrl(CUSTOM_URL, "dark")).toBe(CUSTOM_URL);
        expect(basemapUrl(CUSTOM_URL, "light")).toBe(CUSTOM_URL);
    });
});

describe("keepAppLayers", () => {
    const previous = style(
        ["carto", "td-polygon", SELECTION_PREVIEW_SOURCE],
        [
            lineLayer("roads", "carto"),
            lineLayer("td-polygon-outline", "td-polygon"),
            lineLayer(`${SELECTION_PREVIEW_SOURCE}-line`, SELECTION_PREVIEW_SOURCE)
        ]
    );
    const next = style(["carto"], [lineLayer("water", "carto")]);

    it("copies the Terra Draw and preview sources and layers to the top of the new style", () => {
        const result = keepAppLayers(previous, next);
        expect(Object.keys(result.sources)).toEqual([
            "carto",
            "td-polygon",
            SELECTION_PREVIEW_SOURCE
        ]);
        expect(result.layers.map((layer) => layer.id)).toEqual([
            "water",
            "td-polygon-outline",
            `${SELECTION_PREVIEW_SOURCE}-line`
        ]);
        expect(result.sources.carto).toBe(next.sources.carto);
    });

    it("copies no base map layer of the previous style", () => {
        const ids = keepAppLayers(previous, next).layers.map((layer) => layer.id);
        expect(ids).not.toContain("roads");
    });

    it("returns the new style when there is no previous style", () => {
        expect(keepAppLayers(undefined, next)).toBe(next);
    });
});

describe("followBasemapTheme", () => {
    function fakeMap() {
        return { setStyle: vi.fn() } as unknown as Parameters<typeof followBasemapTheme>[0] & {
            setStyle: ReturnType<typeof vi.fn>;
        };
    }

    it("switches the default map when the theme changes", () => {
        const theme = writable<ResolvedTheme>("light");
        const map = fakeMap();
        const stop = followBasemapTheme(map, DEFAULT_URL, theme);

        expect(map.setStyle).not.toHaveBeenCalled();
        theme.set("dark");
        expect(map.setStyle).toHaveBeenCalledWith(DARK_MAP_STYLE_URL, {
            transformStyle: keepAppLayers
        });

        stop();
        theme.set("light");
        expect(map.setStyle).toHaveBeenCalledTimes(1);
    });

    it("leaves a custom map alone", () => {
        const theme = writable<ResolvedTheme>("light");
        const map = fakeMap();
        followBasemapTheme(map, CUSTOM_URL, theme);
        theme.set("dark");
        expect(map.setStyle).not.toHaveBeenCalled();
    });
});
