import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const STYLE_FILE = /\.(svelte|scss|css)$/;

// The rem base in app.scss, and the @font-face names in font.scss.
const ALLOWED = new Set(['app.scss: font-size: 14px', "font.scss: font-family: 'Manrope'"]);

const FONT_SIZE = /(?<![-\w])font-size\s*:\s*([^;"}]+)/g;
const FONT_FAMILY = /(?<![-\w])font-family\s*:\s*([^;"}]+)/g;
const TAILWIND_ARBITRARY = /\b(text-\[[^\]]+\]|font-\[[^\]]+\])/g;

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

function violations(pattern: RegExp, token: RegExp): string[] {
	const found: string[] = [];
	for (const file of styleFiles(SRC)) {
		const name = relative(SRC, file).replaceAll('\\', '/');
		const lines = readFileSync(file, 'utf8').split('\n');
		lines.forEach((line, index) => {
			for (const match of line.matchAll(pattern)) {
				const value = match[1].trim();
				if (token.test(value) || value === 'inherit') {
					continue;
				}
				if (ALLOWED.has(`${name}: ${match[0].trim()}`)) {
					continue;
				}
				found.push(`${name}:${index + 1}  ${match[0].trim()}`);
			}
		});
	}
	return found;
}

describe('typography tokens', () => {
	it('sets every font-size with a --font-size-* token', () => {
		expect(violations(FONT_SIZE, /^var\(--font-size-[\w-]+\)$/)).toEqual([]);
	});

	it('sets every font-family with a --font-family-* token', () => {
		expect(violations(FONT_FAMILY, /^var\(--font-family-[\w-]+\)$/)).toEqual([]);
	});

	it('uses no arbitrary Tailwind font values', () => {
		const found = styleFiles(SRC).flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(TAILWIND_ARBITRARY)].map(
				(match) => `${relative(SRC, file)}  ${match[0]}`
			)
		);
		expect(found).toEqual([]);
	});
});
