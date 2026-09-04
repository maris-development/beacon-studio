<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
    import DownloadIcon from '@lucide/svelte/icons/download';
	import LoadingIcon from '@lucide/svelte/icons/loader-2';


	let {
		downloadData,
		disabled = false,
		title = ''
	}: {
		downloadData: () => void|Promise<void>;
		disabled?: boolean;
		title?: string;
	} = $props();

	let isLoading = $state(false);

    async function handleDownloadData(){
        if (isLoading || disabled) return;
        isLoading = true;
        try {
            await downloadData();
        } finally {
            isLoading = false;
        }
    }

</script>

<Button onclick={handleDownloadData} disabled={isLoading || disabled} {title}>
	{#if isLoading}
		<LoadingIcon class="animate-spin" />
    	Downloading...

	{:else}
		<DownloadIcon />
    	Download Data
		
	{/if}
</Button>