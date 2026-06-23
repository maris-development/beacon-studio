import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// NOTE: `experimental.async` makes Svelte flush effects inside async-derived
	// reaction contexts. Newer bits-ui/runed perform floating-ui $state writes
	// during those flushes, which triggers `state_unsafe_mutation`. Disable until
	// the bits-ui + Svelte async interaction is resolved upstream.
	// compilerOptions: {
	// 	experimental: {
	// 		async: true
	// 	}
	// },
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			fallback: 'index.html',
			pages: 'build',
			assets: 'build',
			precompress: false,
			strict: false
		}),
		paths: {
			base: (process.env.BASE_PATH ?? '').trim(), // Replace with your subdirectory
		},
		alias: {
			// when you write `@/foo` → load from `./src/lib/foo`
			'@/*': './src/lib/*'
		}
	}
};

// console.error(config);

export default config;
