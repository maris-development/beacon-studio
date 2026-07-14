<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { type ActionCallback } from '@/components/query-builder/query-selection-actions';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

    // icons
	import FolderIcon from '@lucide/svelte/icons/folder';
	import ShareIcon from '@lucide/svelte/icons/share';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
    import DownloadIcon from '@lucide/svelte/icons/download';
	import TableIcon from '@lucide/svelte/icons/table';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ResetIcon from '@lucide/svelte/icons/refresh-ccw';
	import ListIcon from '@lucide/svelte/icons/list';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import JsonIcon from '@lucide/svelte/icons/file-json';
    import PythonIcon from '@lucide/svelte/icons/file-code-corner';
    import SQLIcon from '@lucide/svelte/icons/database';
    import UrlIcon from '@lucide/svelte/icons/link-2';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
    import MapIcon from '@lucide/svelte/icons/map';
    import VisualiseIcon from '@lucide/svelte/icons/eye';
    import RunIcon from '@lucide/svelte/icons/play';

	let {
		dataTable,
		columns,
		filters,
		selection,
		outputFormat,
		// compileQuery,
		runQuery,
		downloadData,
		copyJson,
		copyPython,
		copySql,
		copyUrl,
		visualiseTable,
		visualiseChart,
		visualiseMap,
		saveQuery,
		savedQueries,
		reset
	}: {
		dataTable?: string;
		columns?: number;
		filters?: number;
		selection?: number;
		outputFormat?: string;
		// compileQuery?: ActionCallback;
		runQuery?: ActionCallback;
		downloadData?: ActionCallback;
		copyJson?: ActionCallback;
		copyPython?: ActionCallback;
		copySql?: ActionCallback;
		copyUrl?: ActionCallback;
		visualiseTable?: ActionCallback;
		visualiseChart?: ActionCallback;
		visualiseMap?: ActionCallback;
		saveQuery?: ActionCallback;
		savedQueries?: ActionCallback;
		reset?: ActionCallback;
	} = $props();
</script>

<div class="query-selection-status-bar">
	<div class="selection-status-group">
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
	</div>

	<div class="selection-status-group">

        <!-- compile and run query are the same -->
        <!-- make a action for this that adds a  -->
		<!-- <Button onclick={compileQuery}>Compile Query</Button> -->
		<Button onclick={runQuery}>
            <RunIcon />
            Run Query
        </Button>

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
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
                <Button onclick={downloadData}>
			        <CopyIcon />
			        Copy Query
		        </Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-48">
				<DropdownMenu.Item onclick={copyJson}>
					<JsonIcon class="text-muted-foreground" />
					<span>JSON</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={copyPython}>
					<PythonIcon class="text-muted-foreground" />
					<span>Python</span>
				</DropdownMenu.Item>
				<!-- <DropdownMenu.Separator /> -->
				<DropdownMenu.Item onclick={copySql}>
					<SQLIcon class="text-muted-foreground" />
					<span>SQL</span>
				</DropdownMenu.Item>
                <DropdownMenu.Item onclick={copyUrl}>
					<UrlIcon class="text-muted-foreground" />
					<span>URL</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Button onclick={saveQuery}>
			<SaveIcon />
			Save query
		</Button>

		<!-- dropdown for saved queries? -->
		<Button onclick={savedQueries}>
			<ListIcon />
			Saved (0)
		</Button>

		<Button onclick={reset}>
			<ResetIcon />
			Reset
		</Button>
	</div>
</div>

<style lang="scss">
	.query-selection-status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.selection-status-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
