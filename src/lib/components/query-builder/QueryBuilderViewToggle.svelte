<!--
	The one button that switches a selector between cards and a list. The label
	names the view that the button switches to.
-->
<script lang="ts" module>
	export type ViewMode = 'cards' | 'list';
</script>

<script lang="ts">
	import GridIcon from '@lucide/svelte/icons/grid';
	import ListIcon from '@lucide/svelte/icons/list';
	import Button from '../buttons/Button.svelte';
	import { t } from '@/i18n';

	let { mode = $bindable<ViewMode>('cards') }: { mode?: ViewMode } = $props();

	function toggle(): void {
		if (mode === 'cards') {
			mode = 'list';
		} else {
			mode = 'cards';
		}
	}
</script>

<Button variant="outline" onclick={toggle}>
	{#if mode === 'cards'}
		{$t('query.view.list')}
		<ListIcon />
	{:else}
		{$t('query.view.cards')}
		<GridIcon />
	{/if}
</Button>
