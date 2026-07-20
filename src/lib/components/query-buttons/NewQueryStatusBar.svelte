<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

    // icons
	import TableIcon from '@lucide/svelte/icons/table';

	


	let {
		dataTable,
		columns,
		filters,
		selection,
		// outputFormat,
	}: {
		dataTable?: string;
		columns?: number;
		filters?: number;
		selection?: number;
		// outputFormat?: string;
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

		<!-- {#if outputFormat}
			<Badge>
				Output: {outputFormat}
			</Badge>
		{/if} -->
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



