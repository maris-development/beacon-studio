import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import {
    basemapUrl,
    basemapUrlsOf,
    followBasemapTheme,
    keepAppLayers,
    SELECTION_PREVIEW_SOURCE,
    type BasemapUrls
} from "../basemap";
import { DEFAULT_SETTINGS, type ResolvedTheme } from "@/stores/settings";

const LIGHT_URL = "https://example.com/light.json";
const DARK_URL = "https://example.com/dark.json";
const URLS: BasemapUrls = { light: LIGHT_URL, dark: DARK_URL };

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

describe("basemapUrlsOf", () => {
    it("reads the default URL of each theme", () => {
        expect(basemapUrlsOf(DEFAULT_SETTINGS)).toEqual({
            light: DEFAULT_SETTINGS.mapStyleUrl,
            dark: DEFAULT_SETTINGS.mapStyleUrlDark
        });
    });

    it("trims each URL", () => {
        expect(
            basemapUrlsOf({ mapStyleUrl: ` ${LIGHT_URL} `, mapStyleUrlDark: ` ${DARK_URL}\n` })
        ).toEqual(URLS);
    });

    it("uses the light map in dark mode when the dark URL is empty", () => {
        expect(basemapUrlsOf({ mapStyleUrl: LIGHT_URL, mapStyleUrlDark: " " })).toEqual({
            light: LIGHT_URL,
            dark: LIGHT_URL
        });
    });

    it("uses the default light map when the light URL is empty", () => {
        expect(basemapUrlsOf({ mapStyleUrl: "", mapStyleUrlDark: "" })).toEqual({
            light: DEFAULT_SETTINGS.mapStyleUrl,
            dark: DEFAULT_SETTINGS.mapStyleUrl
        });
    });
});

describe("basemapUrl", () => {
    it("gives the URL of the theme", () => {
        expect(basemapUrl(URLS, "light")).toBe(LIGHT_URL);
        expect(basemapUrl(URLS, "dark")).toBe(DARK_URL);
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

    it("switches the map when the theme changes", () => {
        const theme = writable<ResolvedTheme>("light");
        const map = fakeMap();
        const stop = followBasemapTheme(map, URLS, theme);

        expect(map.setStyle).not.toHaveBeenCalled();
        theme.set("dark");
        expect(map.setStyle).toHaveBeenCalledWith(DARK_URL, {
            transformStyle: keepAppLayers
        });

        stop();
        theme.set("light");
        expect(map.setStyle).toHaveBeenCalledTimes(1);
    });

    it("leaves the map alone when both themes use one URL", () => {
        const theme = writable<ResolvedTheme>("light");
        const map = fakeMap();
        followBasemapTheme(map, { light: LIGHT_URL, dark: LIGHT_URL }, theme);
        theme.set("dark");
        expect(map.setStyle).not.toHaveBeenCalled();
    });
});
