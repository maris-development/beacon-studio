import * as monaco from "monaco-editor";
import { get } from "svelte/store";
import { resolvedTheme } from "@/services/theme";
import type { ResolvedTheme } from "@/stores/settings";

const DARK_THEME = "beacon-dark";

// Monaco takes only hex colours. These values match the dark tokens in tailwind.css.
monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
        "editor.background": "#17171b",
        "editor.foreground": "#fafafa",
        "editor.lineHighlightBackground": "#20222c",
        "editor.lineHighlightBorder": "#20222c",
        "editor.selectionBackground": "#262938",
        "editorGutter.background": "#17171b",
        "editorLineNumber.foreground": "#a1a1aa",
        "editorWidget.background": "#17171b",
        "editorWidget.border": "#2c2c30",
        "editorSuggestWidget.background": "#17171b",
        "editorSuggestWidget.border": "#2c2c30",
        "editorSuggestWidget.selectedBackground": "#262938"
    }
});

function themeName(theme: ResolvedTheme): string {
    if (theme === "dark") return DARK_THEME;
    return "vs";
}

/** The Monaco theme for a new editor. */
export function monacoTheme(): string {
    return themeName(get(resolvedTheme));
}

// The theme of Monaco is global, so one subscription switches every editor.
resolvedTheme.subscribe((theme) => monaco.editor.setTheme(themeName(theme)));
