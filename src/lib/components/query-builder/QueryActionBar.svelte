<script lang="ts">
	import Button from '$lib/components/buttons/Button.svelte';
	import type { QueryActions } from '@/components/query-builder/QueryActions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as QueryFunctions from '@/query/functions';
	import CacheInfoModal from '@/components/modals/CacheInfoModal.svelte';
	import DownloadDataButton from '../buttons/DownloadDataButton.svelte';
	import VisualiseDataButton from '../buttons/VisualiseDataButton.svelte';
    // icons
	import ShareIcon2 from '@lucide/svelte/icons/share-2';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ResetIcon from '@lucide/svelte/icons/refresh-ccw';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import JsonIcon from '@lucide/svelte/icons/file-json-2';
    import PythonIcon from '@lucide/svelte/icons/file-code-corner';
    import SQLIcon from '@lucide/svelte/icons/database';
    import UrlIcon from '@lucide/svelte/icons/link-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	


	let {
		queryActions
	}: { queryActions: QueryActions } = $props();

	let showingCacheInfoModal = $state(false);

	function showCacheInfoModal(): void {
		showingCacheInfoModal = true;
	}

	function closeCacheInfoModal(): void {
		showingCacheInfoModal = false;
	}

	
</script>

{#if showingCacheInfoModal}
	<CacheInfoModal onClose={() => closeCacheInfoModal()} />
{/if}


<div class="query-action-bar">

	<div class="query-action-group">

		<DownloadDataButton downloadData={queryActions.downloadData} />

		{#if queryActions.editQuery}
			<Button onclick={queryActions.editQuery} title="Edit query">
				<PencilIcon />
				Edit Query
			</Button>
		{:else}
			<VisualiseDataButton 
				visualiseTable={queryActions.visualiseTable}
				visualiseChart={queryActions.visualiseChart}
				visualiseMap={queryActions.visualiseMap}
			/>
		{/if}
		
	
		<!-- dropdown for copy options -->
		{#if queryActions.compileQuery}
			<!-- Add name of active query on top of dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="outline">
						<ShareIcon2 />
						Share
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-48">
					<DropdownMenu.Item onclick={() => QueryFunctions.copyUrl(queryActions.compileQuery)}>
						<UrlIcon class="text-muted-foreground" />
						<span>Share URL</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copyJSON(queryActions.compileQuery)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy JSON</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copyPython(queryActions.compileQuery, queryActions.getInstance?.() ?? null)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy Python</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.copySQL(queryActions.compileQuery)}>
						<CopyIcon class="text-muted-foreground" />
						<span>Copy SQL</span>
					</DropdownMenu.Item>

					<DropdownMenu.Separator />

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadJSON(queryActions.compileQuery)}>
						<JsonIcon class="text-muted-foreground" />
						<span>Download JSON</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadPython(queryActions.compileQuery, queryActions.getInstance?.() ?? null)}>
						<PythonIcon class="text-muted-foreground" />
						<span>Download Python</span>
					</DropdownMenu.Item>

					<DropdownMenu.Item onclick={() => QueryFunctions.downloadSQL(queryActions.compileQuery)}>
						<SQLIcon class="text-muted-foreground" />
						<span>Download SQL</span>
					</DropdownMenu.Item>

				</DropdownMenu.Content>
			</DropdownMenu.Root>
			
		{/if}

		{#if queryActions.saveQuery}
			<Button variant="outline" onclick={queryActions.saveQuery} title="Save query">
				<SaveIcon />
				Save Query
			</Button>
		{/if}	
		

		<Button onclick={queryActions.resetQuery} variant="destructive" title="Reset query selection">
			<ResetIcon />
			Reset
		</Button>

		<Button variant="outline" onclick={() => showCacheInfoModal()} title="Query caching information">
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



