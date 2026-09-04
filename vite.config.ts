import tailwindcss from '@tailwindcss/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

const DEFAULT_REPO_URL = 'https://github.com/maris-development/beacon-studio';

function git(command: string): string {
	return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim();
}

// Remote URLs come in ssh and `.git` forms. The commit link needs the https form.
function toHttpsUrl(remote: string): string {
	const cleaned = remote.replace(/\.git$/, '');
	const ssh = /^git@([^:]+):(.+)$/.exec(cleaned);
	if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
	return cleaned;
}

// CI runners often check out without git metadata, so the env vars come first.
function buildInfo() {
	const env = process.env;
	let commit = env.GIT_COMMIT ?? env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? '';
	let branch = env.GIT_BRANCH ?? env.GITHUB_REF_NAME ?? env.CI_COMMIT_REF_NAME ?? '';
	let repoUrl = env.GIT_REPO_URL ?? '';
	let dirty = false;

	try {
		if (!commit) commit = git('rev-parse HEAD');
		if (!branch) branch = git('rev-parse --abbrev-ref HEAD');
		if (!repoUrl) repoUrl = toHttpsUrl(git('remote get-url origin'));
		dirty = git('status --porcelain') !== '';
	} catch {
		// No git repository and no env vars: the app shows an unknown commit.
	}

	return {
		__GIT_COMMIT__: JSON.stringify(commit),
		__GIT_BRANCH__: JSON.stringify(branch),
		__GIT_DIRTY__: JSON.stringify(dirty),
		__GIT_REPO_URL__: JSON.stringify(repoUrl || DEFAULT_REPO_URL),
		__BUILD_TIME__: JSON.stringify(new Date().toISOString())
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devtoolsJson()],
	define: buildInfo(),
	resolve: {
		extensions: ['.mjs', '.js', '.ts', '.svelte', '.json'],
		dedupe: ['apache-arrow']
	},
	optimizeDeps: {
		esbuildOptions: {
			target: 'esnext',
			supported: { 'top-level-await': true }
		}
	},
	esbuild: {
		target: 'esnext',
		supported: { 'top-level-await': true }
	},
	build: {
		target: 'esnext'
	},
	css: {
		devSourcemap: true
	}
});
