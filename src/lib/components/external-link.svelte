<script lang="ts">
	import { openExternalLink } from '$lib/external-link';
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

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
        title = 'Open link in external browser',
		openInSystemBrowser = true,
		class: className,
		children,
		...restProps
	}: Props = $props();
</script>

<a
	{href}
	class={className ? `external-link ${className}` : 'external-link'}
    {title}
	{target}
	{rel}
	onclick={(event) => (openInSystemBrowser ? openExternalLink(event, href) : undefined)}
	{...restProps}
>
	{@render children?.()}
</a>
