<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
    import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
    
	import TableIcon from '@lucide/svelte/icons/table';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
    import MapIcon from '@lucide/svelte/icons/map';
    import VisualiseIcon from '@lucide/svelte/icons/eye';
	import LoadingIcon from '@lucide/svelte/icons/loader-2';

	let {
        visualiseTable,
        visualiseChart,
        visualiseMap,
        disabled = false,
        title = ''
	}: {
		visualiseTable: () => void|Promise<void>;
        visualiseChart: () => void|Promise<void>;
        visualiseMap: () => void|Promise<void>;
        disabled?: boolean;
        title?: string;
	} = $props();

	let isLoading = $state(false);

    async function handleVisualise(visualise:  () => void|Promise<void>){
        if (isLoading) return;
        isLoading = true;
        try {
            await visualise();
        } finally {
            isLoading = false;
        }
    }

</script>


<DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={isLoading || disabled}>
        <Button disabled={isLoading || disabled} {title}>
        {#if isLoading}
            <LoadingIcon class="animate-spin" />
            Executing...

        {:else}
            <VisualiseIcon />
            Visualise Query
        {/if}
        </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="w-48">
        <DropdownMenu.Item onclick={() => handleVisualise(visualiseMap)}>
            <MapIcon class="text-muted-foreground" />
            <span>Map</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => handleVisualise(visualiseTable)}>
            <TableIcon class="text-muted-foreground" />
            <span>Table</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => handleVisualise(visualiseChart)}>
            <ChartPieIcon class="text-muted-foreground" />
            <span>Chart</span>
        </DropdownMenu.Item>        
    </DropdownMenu.Content>
</DropdownMenu.Root>