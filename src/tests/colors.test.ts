import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const STYLE_FILE = /\.(svelte|scss|css)$/;

// tailwind.css defines the tokens. A brand theme overrides them.
const SKIPPED = [/^tailwind\.css$/, /^brands\//];

// `--ring` has no definition yet (see AGENTS.md), so these fallbacks apply. The badge and the dialog overlay hold in both themes.
const ALLOWED = new Set([
    "lib/components/plots/PlotConfigPanel.svelte: #2563eb",
    "lib/components/plots/PlotTabs.svelte: #9ca3af",
    "lib/components/plots/PlotTypeCards.svelte: #93c5fd",
    "lib/components/ui/badge/badge.svelte: text-white",
    "lib/components/ui/dialog/dialog-overlay.svelte: bg-black"
]);

const HEX = /(?<![\w&])#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const NAMED =
    /(?<![-\w$.])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|IndianRed|MediumSeaGreen|SkyBlue)(?![-\w])/g;
const TAILWIND =
    /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|decoration|accent|caret)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|\[(?:#|rgb|hsl|oklch))/g;

function styleFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return styleFiles(path);
        }
        if (STYLE_FILE.test(entry.name)) {
            return [path];
        }
        return [];
    });
}

function isComment(line: string): boolean {
    return /^\s*(\/\/|\/\*|\*|<!--)/.test(line);
}

function report(found: string[], name: string, index: number, matches: Iterable<RegExpMatchArray>) {
    for (const match of matches) {
        if (ALLOWED.has(`${name}: ${match[0]}`)) {
            continue;
        }
        found.push(`${name}:${index + 1}  ${match[0]}`);
    }
}

/** Colour values in style rules: the `<style>` block of a component, or a whole stylesheet. */
function styleViolations(): string[] {
    const found: string[] = [];
    for (const file of styleFiles(SRC)) {
        const name = relative(SRC, file).replaceAll("\\", "/");
        if (SKIPPED.some((pattern) => pattern.test(name))) {
            continue;
        }

        let inStyle = !name.endsWith(".svelte");
        readFileSync(file, "utf8")
            .split("\n")
            .forEach((line, index) => {
                if (/<style[\s>]/.test(line)) inStyle = true;
                if (/<\/style>/.test(line)) inStyle = false;
                // A shadow stays black in both themes.
                if (!inStyle || isComment(line) || line.includes("shadow")) {
                    return;
                }

                const code = line.replace(/\s\/\/\s.*$/, "");
                report(found, name, index, code.matchAll(HEX));
                report(found, name, index, code.matchAll(COLOR_FUNCTION));
                report(found, name, index, code.matchAll(NAMED));
            });
    }
    return found;
}

describe("colour tokens", () => {
    it("sets every colour in a style rule with a token", () => {
        expect(styleViolations()).toEqual([]);
    });

    it("uses no fixed Tailwind colours", () => {
        const found: string[] = [];
        for (const file of styleFiles(SRC)) {
            const name = relative(SRC, file).replaceAll("\\", "/");
            if (SKIPPED.some((pattern) => pattern.test(name))) {
                continue;
            }
            readFileSync(file, "utf8")
                .split("\n")
                .forEach((line, index) => {
                    if (!isComment(line)) report(found, name, index, line.matchAll(TAILWIND));
                });
        }
        expect(found).toEqual([]);
    });
});
