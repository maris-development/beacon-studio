import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTheme } from "../theme";
import { SETTINGS_STORAGE_KEY } from "@/stores/settings";

describe("resolveTheme", () => {
    it("takes light and dark as they are", () => {
        expect(resolveTheme("light", true)).toBe("light");
        expect(resolveTheme("dark", false)).toBe("dark");
    });

    it("follows the OS for system", () => {
        expect(resolveTheme("system", true)).toBe("dark");
        expect(resolveTheme("system", false)).toBe("light");
    });

    it("follows the OS for an unknown value", () => {
        expect(resolveTheme("purple", true)).toBe("dark");
        expect(resolveTheme("", false)).toBe("light");
    });
});

// The inline script of app.html sets the theme before the first paint. It must apply the same rule.
describe("the theme script in app.html", () => {
    const html = readFileSync(join(process.cwd(), "src", "app.html"), "utf8");
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

    function runScript(stored: string | null, prefersDark: boolean) {
        localStorage.clear();
        if (stored !== null) localStorage.setItem(SETTINGS_STORAGE_KEY, stored);
        vi.stubGlobal("matchMedia", () => ({ matches: prefersDark }));

        const root = document.documentElement;
        root.classList.remove("dark");
        root.style.colorScheme = "";
        new Function(script)();
        return { dark: root.classList.contains("dark"), colorScheme: root.style.colorScheme };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it("exists", () => {
        expect(script).toContain(SETTINGS_STORAGE_KEY);
    });

    for (const theme of ["system", "light", "dark", "purple"]) {
        for (const prefersDark of [false, true]) {
            it(`matches resolveTheme for ${theme} with an OS that prefers ${prefersDark ? "dark" : "light"}`, () => {
                const expected = resolveTheme(theme, prefersDark);
                expect(runScript(JSON.stringify({ theme }), prefersDark)).toEqual({
                    dark: expected === "dark",
                    colorScheme: expected
                });
            });
        }
    }

    it("follows the OS without stored settings", () => {
        expect(runScript(null, true)).toEqual({ dark: true, colorScheme: "dark" });
    });

    it("does not throw on broken JSON", () => {
        expect(() => runScript("{not json", true)).not.toThrow();
    });
});
