<script lang="ts">
	import ExternalLink from '../ExternalLink.svelte';
	import {
		BUILD_TIME,
		GIT_BRANCH,
		GIT_COMMIT,
		GIT_COMMIT_SHORT,
		GIT_DIRTY,
		commitUrl
	} from '$lib/build-info';

	const label: string = GIT_COMMIT_SHORT || 'unknown';
	const builtAt: string = new Date(BUILD_TIME).toLocaleString();
	const tooltip: string = [
		GIT_COMMIT ? `Commit ${GIT_COMMIT}` : 'Commit unknown',
		GIT_BRANCH ? `Branch ${GIT_BRANCH}` : null,
		GIT_DIRTY ? 'Uncommitted changes' : null,
		`Built ${builtAt}`
	]
		.filter(Boolean)
		.join('\n');
</script>

<div class="build-version">
	<ExternalLink href={commitUrl()} title={tooltip} class="build-link">
		{label}{#if GIT_DIRTY}+{/if}
	</ExternalLink>
</div>

<style lang="scss">
	// Floats over the layout so the link claims no space.
	.build-version {
		position: fixed;
		bottom: 0;
		left: 0;
		z-index: 9999;
		padding: 0;
		font-size: 0.625rem;
		line-height: 1;
		font-family: ui-monospace, monospace;
		pointer-events: none;

		:global(.build-link) {
			pointer-events: auto;
			color: var(--muted-foreground);
			text-decoration: none;
			opacity: 0.7;

			&:hover {
				opacity: 1;
				text-decoration: underline;
			}
		}
	}
</style>
