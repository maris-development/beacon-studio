<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { type ActionCallback } from '@/components/query-builder/query-selection-actions';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as QueryFunctions from '@/components/query-builder/query-functions';
	import type { CompiledQuery } from "@/beacon-api/types";

    // icons
	import ShareIcon from '@lucide/svelte/icons/share';
	import ShareIcon2 from '@lucide/svelte/icons/share-2';
    import DownloadIcon from '@lucide/svelte/icons/download';
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
	


	let {
		// dataTable,
		// columns,
		// filters,
		// selection,
		// outputFormat,
		compileQuery,
		downloadData,
		visualiseTable,
		visualiseChart,
		visualiseMap,
		saveQuery,
		savedQueries,
		reset
	}: {
		// dataTable?: string;
		// columns?: number;
		// filters?: number;
		// selection?: number;
		// outputFormat?: string;
		compileQuery?: (() => CompiledQuery) | undefined;
		downloadData?: ActionCallback;
		visualiseTable?: ActionCallback;
		visualiseChart?: ActionCallback;
		visualiseMap?: ActionCallback;
		saveQuery?: ActionCallback;
		savedQueries?: ActionCallback;
		reset?: ActionCallback;
	} = $props();
</script>

<div class="query-action-bar">
	<!-- <div class="selection-status-group">
		{#if dataTable}
			<Badge>
				<TableIcon />
				{dataTable}
			</Badge>
		{/if}

		<Badge>
			{columns ?? 0} columns
		</Badge>

		<Badge>
			{filters ?? 0} filters
		</Badge>

		<Badge>
			Selection: {selection ?? 0}
		</Badge>

		{#if outputFormat}
			<Badge>
				Output: {outputFormat}
			</Badge>
		{/if}
	</div> -->

	<div class="query-action-group">

		<Button onclick={downloadData}>
			<DownloadIcon />
			Download Data
		</Button>

		<!-- dropdown for visualisations -->
        <DropdownMenu.Root>
			<DropdownMenu.Trigger>
                <Button onclick={downloadData}>
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
                <Button onclick={downloadData}>
			        <ShareIcon2 />
			        Copy Query
		        </Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-48">
				<DropdownMenu.Item onclick={() => QueryFunctions.copyUrl(compileQuery)}>
					<UrlIcon class="text-muted-foreground" />
					<span>URL</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => QueryFunctions.copyJSON(compileQuery)}>
					<CopyIcon class="text-muted-foreground" />
					<span>JSON</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => QueryFunctions.copyPython(compileQuery)}>
					<CopyIcon class="text-muted-foreground" />
					<span>Python</span>
				</DropdownMenu.Item>
				<!-- <DropdownMenu.Separator /> -->
				<DropdownMenu.Item onclick={() => QueryFunctions.copySQL(compileQuery)}>
					<CopyIcon class="text-muted-foreground" />
					<span>SQL</span>
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
				<!-- <DropdownMenu.Separator /> -->
				<DropdownMenu.Item onclick={() => QueryFunctions.downloadSQL(compileQuery)}>
					<SQLIcon class="text-muted-foreground" />
					<span>Download SQL</span>
				</DropdownMenu.Item>

			</DropdownMenu.Content>
		</DropdownMenu.Root>
		{/if}
		

		<Button onclick={saveQuery}>
			<SaveIcon />
			Save query
		</Button>

		<!-- dropdown for saved queries? -->
		<!-- <DropdownMenu.Root>
			<DropdownMenu.Trigger>
                <Button onclick={savedQueries}>
					<ListIcon />
					Saved (count of saved queries here)
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-48">
				foreach loop here
				<DropdownMenu.Item onclick={loadsavedqueryfunction}}>
					<SavedIcon class="text-muted-foreground" />
					<span>saved query num or name</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root> -->

		<Button onclick={reset}>
			<ResetIcon />
			Reset
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



