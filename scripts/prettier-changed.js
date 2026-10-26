// Checks the Prettier format of the src files that differ from the base branch only.
// The house style comes in step by step. See AGENTS.md "Formatting (Prettier)".

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PRETTIER = require.resolve("prettier/bin/prettier.cjs");
const BASES = [process.env.PRETTIER_BASE, "main", "origin/main"].filter(Boolean);

function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" });
}

function lines(text) {
    return text.split("\n").filter((line) => line.trim() !== "");
}

function baseRef() {
    for (const ref of BASES) {
        try {
            git("rev-parse", "--verify", "--quiet", ref);
            return ref;
        } catch {
            // Try the next ref.
        }
    }
    return null;
}

const base = baseRef();
if (!base) {
    console.error(
        `prettier-changed: no base branch found (${BASES.join(", ")}). Fetch main first.`
    );
    process.exit(1);
}

const files = new Set([
    ...lines(git("diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`, "--", "src")),
    ...lines(git("diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", "src")),
    ...lines(git("ls-files", "--others", "--exclude-standard", "--", "src"))
]);
const existing = [...files].filter((file) => existsSync(file));

if (existing.length === 0) {
    console.log(`prettier-changed: no changed files against ${base}.`);
    process.exit(0);
}

console.log(`prettier-changed: ${existing.length} files changed against ${base}.`);
const result = spawnSync(process.execPath, [PRETTIER, "--check", "--ignore-unknown", ...existing], {
    stdio: "inherit"
});
process.exit(result.status ?? 1);
