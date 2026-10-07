import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

const TRANSLATE_HINT = 'Put user-visible text in src/lib/i18n/locales/en.json and read it with $t.';

// User-visible text must come from the catalog, see AGENTS.md "Translations".
const NO_LITERAL_MARKUP_TEXT = [
	{
		selector:
			'SvelteText[value=/[A-Za-z]{2,}/]:not(SvelteStyleElement > SvelteText, SvelteScriptElement > SvelteText)',
		message: `Literal text in markup. ${TRANSLATE_HINT}`
	},
	{
		selector:
			'SvelteAttribute[key.name=/^(title|placeholder|aria-label|alt|label)$/] > SvelteLiteral[value=/[A-Za-z]{2,}/]',
		message: `Literal text in a user-visible attribute. ${TRANSLATE_HINT}`
	}
];

const NO_LITERAL_TOAST_TEXT = [
	{
		selector:
			'CallExpression[callee.name=/^(addToast|askConfirm|askAlert)$/] Property[key.name=/^(message|title|note|confirmLabel|cancelLabel)$/] > Literal[value=/[A-Za-z]{2,}/]',
		message: `Literal text in a toast or a question. Use a key. ${TRANSLATE_HINT}`
	},
	{
		selector:
			'CallExpression[callee.name=/^(addToast|askConfirm|askAlert)$/] Property[key.name=/^(message|title|note|confirmLabel|cancelLabel)$/] > TemplateLiteral:has(TemplateElement[value.raw=/[A-Za-z]{2,}/])',
		message: `Literal text in a toast or a question. Use a key. ${TRANSLATE_HINT}`
	}
];

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-undef': 'off',
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	// Layer rule, see AGENTS.md. Imports point one way only:
	// beacon-api -> query / geo -> stores -> components -> routes.
	// Without this guard the rule decays: a type gets declared in a .svelte file,
	// and the domain layer reaches up into a component to import it.
	{
		// `beacon-api` is not listed. It imports `stores/toasts` and
		// `stores/query-store` today, so the rule would fail on existing code. Untangle
		// that separately, then add it here.
		files: ['src/lib/query/**', 'src/lib/geo/**', 'src/lib/stores/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@/components/*', '**/components/*'],
							message:
								'Layer violation: this file sits below the component layer. Move the shared type or function into src/lib/query or src/lib/geo instead of importing a component.'
						}
					]
				}
			]
		}
	},
	{
		files: ['src/**/*.svelte'],
		// A developer page with no link to it.
		ignores: ['src/routes/test/**'],
		rules: {
			'no-restricted-syntax': ['error', ...NO_LITERAL_MARKUP_TEXT, ...NO_LITERAL_TOAST_TEXT]
		}
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-syntax': ['error', ...NO_LITERAL_TOAST_TEXT]
		}
	},
	// The translation layer sits at the bottom. Every layer imports it, so it imports none.
	{
		files: ['src/lib/i18n/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@/*', '$lib/*', '../*', '!@/i18n', '!@/i18n/*'],
							message:
								'Layer violation: src/lib/i18n imports only svelte-i18n and its catalogs. Every other layer imports it.'
						}
					]
				}
			]
		}
	}
);
