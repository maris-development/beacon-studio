import { describe, expect, it } from "vitest";
import {
    DEFAULT_STYLE,
    normalisePlotConfig,
    PLOT_THEME_COLORS,
    resolvePlotColors
} from "../plot-config";

function storedStyle(style: Record<string, unknown>) {
    return normalisePlotConfig({ id: "p1", name: "Plot", type: "scatter", style })?.style;
}

describe("plot colours", () => {
    it("follow the theme by default", () => {
        expect(DEFAULT_STYLE.backgroundColor).toBe("");
        expect(DEFAULT_STYLE.gridlineColor).toBe("");
        expect(DEFAULT_STYLE.textColor).toBe("");
    });

    it("read the old light defaults as the theme colours", () => {
        const style = storedStyle({
            backgroundColor: "#FFFFFF",
            gridlineColor: "#1f2937",
            textColor: "#1F2937"
        });
        expect(style).toMatchObject({ backgroundColor: "", gridlineColor: "", textColor: "" });
    });

    it("keep a colour that the user picked", () => {
        const style = storedStyle({
            backgroundColor: "#000000",
            gridlineColor: "#ff0000",
            textColor: "#00ff00"
        });
        expect(style).toMatchObject({
            backgroundColor: "#000000",
            gridlineColor: "#ff0000",
            textColor: "#00ff00"
        });
    });

    it("resolve to the colours of the theme", () => {
        expect(resolvePlotColors(DEFAULT_STYLE, "light")).toEqual(PLOT_THEME_COLORS.light);
        expect(resolvePlotColors(DEFAULT_STYLE, "dark")).toEqual(PLOT_THEME_COLORS.dark);
    });

    it("resolve a picked colour to itself in both themes", () => {
        const style = { backgroundColor: "#123456", gridlineColor: "", textColor: "" };
        expect(resolvePlotColors(style, "dark")).toEqual({
            backgroundColor: "#123456",
            gridlineColor: PLOT_THEME_COLORS.dark.gridlineColor,
            textColor: PLOT_THEME_COLORS.dark.textColor
        });
    });
});
