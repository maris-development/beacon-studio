<script lang="ts">
	import Button from '@/components/buttons/Button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import LoadingIcon from '@lucide/svelte/icons/loader-2';
	import { DOWNLOAD_FORMATS, type DownloadFormat } from '@/sql/download';

	let {
		disabled,
		busy,
		onDownload
	}: { disabled: boolean; busy: boolean; onDownload: (format: DownloadFormat) => void } = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger disabled={disabled || busy}>
		<Button variant="outline" disabled={disabled || busy}>
			{#if busy}
				<LoadingIcon class="animate-spin" />
			{:else}
				<DownloadIcon />
			{/if}
			Download
		</Button>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="w-40">
		{#each DOWNLOAD_FORMATS as format (format.label)}
			<DropdownMenu.Item onclick={() => onDownload(format)}>{format.label}</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
