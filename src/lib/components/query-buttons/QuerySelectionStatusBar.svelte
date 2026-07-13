<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
    import {Badge} from '$lib/components/ui/badge/index.js';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import SearchCodeIcon from '@lucide/svelte/icons/search-code';
	import TestTubeIcon from '@lucide/svelte/icons/test-tube';
	import type { CompiledQuery } from '@/beacon-api/types';
	import CopyQueryJsonButton from './CopyQueryJsonButton.svelte';
	import CopyQueryPythonButton from './CopyQueryPythonButton.svelte';
    import TableIcon from '@lucide/svelte/icons/table';
    import SaveIcon from '@lucide/svelte/icons/save';
    import ResetIcon from '@lucide/svelte/icons/refresh-ccw';
    import ListIcon from '@lucide/svelte/icons/list';
    import { type ActionCallback } from '@/components/query-builder/query-selection-actions';
    import * as Select from '$lib/components/ui/select/index.js';


	let {
		dataTable,
		columns,
		filters,
		selection,
		outputFormat,
        compileQuery,
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
        dataTable?: string,
		columns?: number,
		filters?: number,
		selection?: number,
		outputFormat?: string,
        compileQuery?: ActionCallback,
        runQuery?: ActionCallback,
        downloadData?: ActionCallback,
        copyJson?: ActionCallback,
        copyPython?: ActionCallback,
        copySql?: ActionCallback,
        copyUrl?: ActionCallback,
        visualiseTable?: ActionCallback,
        visualiseChart?: ActionCallback,
        visualiseMap?: ActionCallback,
		saveQuery?: ActionCallback,
		savedQueries?: ActionCallback,
        reset?: ActionCallback
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

        <Button onclick={compileQuery}>

            Compile Query
        </Button>

        <Button onclick={runQuery}>
            Run Query

        </Button>

        <Button onclick={downloadData}>
            <DownloadIcon />
            Download Data
        </Button>

        <!-- dropdown for visualisations -->
        <Select.Root type="single" name="visualisation">
            <Select.Trigger class="w-[180px]">
                Visualise query
            </Select.Trigger>
            <Select.Content>
                <Select.Group>
                    <Select.Label>Tables</Select.Label>
                        <Select.Item value=0 label="Table" onclick={visualiseTable}>
                            Table
                        </Select.Item>
                        <Select.Item value=0 label="Chart" onclick={visualiseChart}>
                            Chart
                        </Select.Item>
                        <Select.Item value=0 label="Table" onclick={visualiseMap}>
                            Map
                        </Select.Item>
                </Select.Group>
            </Select.Content>
        </Select.Root>

        <!-- dropdown for copy options -->
        <Select.Root type="single" name="copy">
            <Select.Trigger class="w-[180px]">
                Copy query
            </Select.Trigger>
            <Select.Content>
                <Select.Group>
                    <Select.Label>Tables</Select.Label>
                        <Select.Item value=0 label="JSON" onclick={copyJson}>
                            JSON
                        </Select.Item>
                        <Select.Item value=0 label="Python" onclick={copyPython}>
                            Python
                        </Select.Item>
                        <Select.Item value=0 label="SQL" onclick={copySql}>
                            SQL
                        </Select.Item>
                        <Select.Item value=0 label="URL" onclick={copyUrl}>
                            URL
                        </Select.Item>
                </Select.Group>
            </Select.Content>
        </Select.Root>

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