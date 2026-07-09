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

	type ActionCallback = (() => void | Promise<void>) | undefined;

	let {
		dataTable,
		columns,
		filters,
		selection,
		outputFormat,
		saveQuery,
		savedQueries,
        reset
	}: {
        dataTable?: string,
		columns?: number,
		filters?: number,
		selection?: number,
		outputFormat?: string,
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
		<Button onclick={saveQuery}>
			<SaveIcon />
			Save query
		</Button>

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