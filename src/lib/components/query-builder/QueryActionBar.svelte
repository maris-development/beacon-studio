<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import type { QuerySelectionActions } from '@/components/query-builder/QuerySelectionActions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as QueryFunctions from '@/components/query-builder/QueryFunctions';
	import CacheInfoModal from '@/components/modals/CacheInfoModal.svelte';
    // icons
	import ShareIcon2 from '@lucide/svelte/icons/share-2';
	import TableIcon from '@lucide/svelte/icons/table';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ResetIcon from '@lucide/svelte/icons/refresh-ccw';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import JsonIcon from '@lucide/svelte/icons/file-json-2';
    import PythonIcon from '@lucide/svelte/icons/file-code-corner';
    import SQLIcon from '@lucide/svelte/icons/database';
    import UrlIcon from '@lucide/svelte/icons/link-2';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
    import MapIcon from '@lucide/svelte/icons/map';
    import VisualiseIcon from '@lucide/svelte/icons/eye';
	import InfoIcon from '@lucide/svelte/icons/info';
	import DownloadDataButton from '../buttons/DownloadDataButton.svelte';
	


	let {
		compileQuery,
		downloadData,
		visualiseTable,
		visualiseChart,
		visualiseMap,
		saveQuery,
		resetQuery
	}: QuerySelectionActions = $props();

	let showInfoModal = $state(false);

	function showInfo(): void {
		showInfoModal = true;
	}

	function closeInfo(): void {
		showInfoModal = false;
	}
</script>

{#if showInfoModal}
	<CacheInfoModal onClose={() => closeInfo()} />
{/if}


<div class="query-action-bar">

	<div class="query-action-group">

		<DownloadDataButton {downloadData} />

		<!-- dropdown for visualisations -->
        <DropdownMenu.Root>
			<DropdownMenu.Trigger>
                <Button>
			        <VisualiseIcon />
			        Visualise Query
		        </Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-48">
				<DropdownMenu.Item onclick={visualiseTable}>
					<TableIcon class="text-muted-foreground" />
					<span>Table</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={visualiseChart}>
					<ChartPie class="text-muted-foreground" />
					<span>Chart</span>
				</DropdownMenu.Item>
				<!-- <DropdownMenu.Separator /> -->
				<DropdownMenu.Item onclick={visualiseMap}>
					<MapIcon class="text-muted-foreground" />
					<span>Map</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- dropdown for copy options -->
		{#if compileQuery}
			<!-- Add name of active query on top of dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="outline">
						<ShareIcon2 />
						Share
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-48">
					<DropdownMenu.Item onclick={() => QueryFunctions.copyUrl(compileQuery)}>
						<UrlIcon class="text-muted-foreground" />
						<span>Share URL</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copyJSON(compileQuery)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy JSON</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copyPython(compileQuery)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy Python</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copySQL(compileQuery)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy SQL</span>
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadJSON(compileQuery)}>
						<JsonIcon class="text-muted-foreground" />
						<span>Download JSON</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadPython(compileQuery)}>
						<PythonIcon class="text-muted-foreground" />
						<span>Download Python</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadSQL(compileQuery)}>
						<SQLIcon class="text-muted-foreground" />
						<span>Download SQL</span>
					</DropdownMenu.Item>

				</DropdownMenu.Content>
			</DropdownMenu.Root>
			
		{/if}

		{#if saveQuery}
			<Button variant="outline" onclick={saveQuery} title="Save query">
				<SaveIcon />
				Save Query
			</Button>
		{/if}	
		

		<Button onclick={resetQuery} variant="destructive" title="Reset query selection">
			<ResetIcon />
			Reset
		</Button>

		<Button variant="outline" onclick={() => showInfo()} title="Query caching information">
				<InfoIcon />
		</Button>
	</div>
</div>

<style lang="scss">
	.query-action-bar {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.query-action-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>



