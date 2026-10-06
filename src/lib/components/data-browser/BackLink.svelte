<!-- "← Tables": back to the list the user came from, or to the plain list. -->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { backTarget } from '@/data-browser/back';

	let { label, fallback }: { label: string; fallback: string } = $props();

	// The base path without its trailing slash.
	const prefix = resolve('/').replace(/\/$/, '');

	let href = $derived(backTarget(page.url.searchParams.get('back'), prefix, fallback));
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- backTarget accepts only a resolved path -->
<a class="back-link" {href}>
	<ArrowLeftIcon class="size-4" />
	{label}
</a>

<style lang="scss">
	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		color: var(--muted-foreground);
		text-decoration: none;

		&:hover {
			color: var(--foreground);
			text-decoration: underline;
		}
	}
</style>
