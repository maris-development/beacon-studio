<!--
	The plot list of one query, as a row of tabs above the plot.

	A query holds many plots, and a user compares them by switching. Tabs make
	that one click, and they show at a glance how many plots a query carries.

	The last tab has no close button. The page has nothing to show without a plot,
	so the controller refuses to remove it.
-->
<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import XIcon from '@lucide/svelte/icons/x';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import type { ChartExplorerController } from './ChartExplorerController.svelte';

	let {
		controller,
		onExport
	}: {
		controller: ChartExplorerController;
		/** Write the active plot to a PNG file. Absent while the canvas is not ready. */
		onExport?: (() => void) | null;
	} = $props();

	const canClose = $derived(controller.plots.length > 1);
</script>

<div class="plot-tabs">
	<div class="tabs" role="tablist">
		{#each controller.plots as plot (plot.id)}
			<div class="tab" class:selected={plot.id === controller.activePlot?.id}>
				<button
					type="button"
					role="tab"
					aria-selected={plot.id === controller.activePlot?.id}
					class="name"
					onclick={() => controller.selectPlot(plot.id)}
				>
					{plot.name}
				</button>

				{#if canClose}
					<button
						type="button"
						class="close"
						title="Remove {plot.name}"
						aria-label="Remove {plot.name}"
						onclick={() => controller.removePlot(plot.id)}
					>
						<XIcon size={12} />
					</button>
				{/if}
			</div>
		{/each}

		<button type="button" class="action" title="Add a plot" onclick={() => controller.addPlot()}>
			<PlusIcon size={14} />
			<span>Add plot</span>
		</button>

		<button
			type="button"
			class="action"
			title="Duplicate the current plot"
			onclick={() => controller.duplicateActivePlot()}
		>
			<CopyIcon size={14} />
			<span>Duplicate</span>
		</button>
	</div>

	{#if onExport}
		<button type="button" class="action export" title="Export this plot as PNG" onclick={onExport}>
			<DownloadIcon size={14} />
			<span>Export PNG</span>
		</button>
	{/if}
</div>

<style lang="scss">
	.plot-tabs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid var(--border, #e5e7eb);

		.tabs {
			display: flex;
			align-items: center;
			gap: 0.25rem;
			flex-grow: 1;
			min-width: 0;
			overflow-x: auto;
		}

		.tab {
			display: flex;
			align-items: center;
			flex-shrink: 0;
			border: 1px solid transparent;
			border-bottom: 0;
			border-radius: 0.375rem 0.375rem 0 0;

			&:hover {
				background-color: var(--accent, #f3f4f6);
			}

			&.selected {
				border-color: var(--border, #e5e7eb);
				background-color: var(--background, #ffffff);
				// Cover the strip border below, so the tab joins the plot area.
				margin-bottom: -1px;
				padding-bottom: 1px;
			}

			.name {
				padding: 0.4375rem 0.5rem;
				background: none;
				border: 0;
				font-size: 0.8125rem;
				max-width: 12rem;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				cursor: pointer;
			}

			&.selected .name {
				font-weight: 600;
			}

			.close {
				display: flex;
				align-items: center;
				padding: 0.25rem;
				margin-right: 0.25rem;
				border: 0;
				border-radius: 0.25rem;
				background: none;
				color: var(--muted-foreground, #6b7280);
				cursor: pointer;

				&:hover {
					background-color: var(--destructive, #fee2e2);
					color: #991b1b;
				}
			}
		}

		.action {
			display: flex;
			align-items: center;
			gap: 0.3125rem;
			flex-shrink: 0;
			padding: 0.375rem 0.5rem;
			border: 0;
			border-radius: 0.375rem;
			background: none;
			font-size: 0.8125rem;
			color: var(--muted-foreground, #4b5563);
			cursor: pointer;

			&:hover {
				background-color: var(--accent, #f3f4f6);
			}

			&.export {
				margin-bottom: 0.25rem;
			}
		}
	}
</style>
