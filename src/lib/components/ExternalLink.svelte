<script lang="ts">
	import { openExternalLink } from '$lib/external-link';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { t } from '@/i18n';

	interface Props extends HTMLAnchorAttributes {
		href: string;
		children?: Snippet;
		openInSystemBrowser?: boolean;
		class?: string;
	}

	let {
		href,
		target = '_blank',
		rel = 'noopener noreferrer',
        title,
		openInSystemBrowser = true,
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<a
	{href}
	class={className ? `external-link ${className}` : 'external-link'}
    title={title ?? $t('misc.externalLink')}
	{target}
	{rel}
	onclick={(event) => (openInSystemBrowser ? openExternalLink(event, href) : undefined)}
	{...restProps}
>
	{@render children?.()}
</a>
