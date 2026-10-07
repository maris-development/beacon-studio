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

	import { formatDate, formatTime, t } from '@/i18n';

	const label: string = $derived(GIT_COMMIT_SHORT || $t('build.unknown'));
	const builtAt: string = $derived(
		`${$formatDate(new Date(BUILD_TIME))} ${$formatTime(new Date(BUILD_TIME))}`
	);
	const tooltip: string = $derived(
		[
			GIT_COMMIT ? $t('build.commit', { commit: GIT_COMMIT }) : $t('build.commitUnknown'),
			GIT_BRANCH ? $t('build.branch', { branch: GIT_BRANCH }) : null,
			GIT_DIRTY ? $t('build.dirty') : null,
			$t('build.built', { time: builtAt })
		]
			.filter(Boolean)
			.join('\n')
	);
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
