/**
 * The colour theme of the app: light or dark.
 *
 * The `theme` setting holds `system`, `light` or `dark`. `system` follows the
 * colour scheme of the OS, also when the OS changes it while the app runs.
 *
 * This module owns the `.dark` class and `color-scheme` on `<html>`. The inline
 * script in `app.html` applies the same rule before the first paint, so a reload
 * in dark mode shows no light flash. Keep the two in step.
 *
 * CSS follows the class through the tokens in `tailwind.css`. Code that paints
 * its own colours (Monaco, the map, the plots) reads {@link resolvedTheme}.
 */

import { derived, readable, type Readable } from "svelte/store";
import { settings, type ResolvedTheme } from "@/stores/settings";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** `light` and `dark` win. Any other value, `system` included, follows the OS. */
export function resolveTheme(setting: string, prefersDark: boolean): ResolvedTheme {
    if (setting === "light" || setting === "dark") return setting;
    if (prefersDark) return "dark";
    return "light";
}

function darkQuery(): MediaQueryList | null {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
    return window.matchMedia(DARK_QUERY);
}

/** True while the OS asks for a dark colour scheme. */
const prefersDark = readable(darkQuery()?.matches ?? false, (set) => {
    const query = darkQuery();
    if (!query) return;

    const onChange = (event: MediaQueryListEvent) => set(event.matches);
    query.addEventListener("change", onChange);
    set(query.matches);

    return () => query.removeEventListener("change", onChange);
});

/** The theme that the app shows now. */
export const resolvedTheme: Readable<ResolvedTheme> = derived(
    [settings, prefersDark],
    ([$settings, $prefersDark]) => resolveTheme($settings.theme, $prefersDark)
);

/** Put the theme on `<html>`. Returns the stop function. */
export function startTheme(): () => void {
    return resolvedTheme.subscribe((theme) => {
        if (typeof document === "undefined") return;

        const root = document.documentElement;
        root.classList.toggle("dark", theme === "dark");
        root.style.colorScheme = theme;
    });
}
