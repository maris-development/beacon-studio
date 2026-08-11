import prettier from 'eslint-config-prettier';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

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
		// `beacon-api` is not listed. It imports `stores/config`, `stores/toasts` and
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
	}
);
