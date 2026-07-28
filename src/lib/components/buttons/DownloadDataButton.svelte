<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
    import DownloadIcon from '@lucide/svelte/icons/download';
	import LoadingIcon from '@lucide/svelte/icons/loader-2';


	let {
		downloadData
	}: {
		downloadData: () => void|Promise<void>;
	} = $props();

	let isLoading = $state(false);

    async function handleDownloadData(){
        isLoading = true;
        try {
            await downloadData();
        } finally {
            isLoading = false;
        }
    }

</script>

<Button onclick={handleDownloadData}>
	{#if isLoading}
		<LoadingIcon class="animate-spin" />
    	Downloading...

	{:else}
		<DownloadIcon />
    	Download Data
		
	{/if}
</Button>