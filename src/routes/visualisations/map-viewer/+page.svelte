<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import LoadingSpinner from '@/components/loading-overlay/LoadingSpinner.svelte';
	import { Utils } from '@/utils';
	import type { CompiledQuery } from '@/beacon-api/types';
	import * as Select from '$lib/components/ui/select/index.js';
	import Legend from '@/components/legend/Legend.svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { resolveUrlQuery } from '@/stores/query-library';
	import QuerySelectorHeader from '@/components/query-builder/QuerySelectorHeader.svelte';
	import { QueryWorkspace } from '@/components/query-builder/QueryWorkspace.svelte';
	import { getDefaultQueryActions } from '@/components/query-builder/QueryActions';
	import VisualisationTabs from '@/components/visualisation/VisualisationTabs.svelte';
	import MapDrawTools from '@/components/visualisation/MapDrawTools.svelte';
	import { MapViewController } from '@/components/visualisation/MapViewController.svelte';
	import {
		selectionColumns,
		withColumns,
		type SpatialSelection
	} from '@/geo/spatial-selection';
	import { addToast } from '@/stores/toasts';
	import { runBlockReason } from '@/query/query-guard';
	import { settings } from '@/stores/settings';

	let mapContainer: HTMLDivElement | null = null;

	const workspace = $state(new QueryWorkspace());

	// The controller owns the map, the deck.gl overlay and the query result. The
	// page keeps only the query effect, the area selection and the markup.
	const map = new MapViewController(
		// The controller names the block of its run. The active block can change
		// while a query runs, so the callbacks must not read the selection.
		(id) => workspace.beginBlockRun(id),
		(id, token) => workspace.endBlockRun(id, token),
		(id, rows) => workspace.markBlockRun(id, rows)
	);

	/** The area drawn on the map. Applied to the query by the Apply filter button. */
	let selection: SpatialSelection | null = $state(null);

	onMount(() => {
		// A deep-link opens one more block. `?q=` comes from "open in workbench"
		// and brings the saved builder state. `?query=` comes from a share link.
		const resolved = resolveUrlQuery(page.url);
		workspace.openFromUrl(resolved);

		return () => workspace.destroy();
	});

	onMount(() => {
		if (!browser || !mapContainer) return;
		map.init(mapContainer);
	});

	onDestroy(() => map.destroy());

	const queryActions = $derived(getDefaultQueryActions(workspace));

	// `workspace.activeBlock` is a new object on every write to the block
	// collection — including our own `markBlockRun` below. Tracking that object
	// (or `compiledQuery` derived from it) as an effect dependency would re-fire
	// the effect after every run, forever. Track primitives instead: the block id
	// and a content key for the compiled query.
	const activeBlockId = $derived(workspace.activeBlockId);
	const compiledQuery: CompiledQuery | null = $derived(
		QueryWorkspace.getQuery(workspace.activeBlock)
	);
	const queryKey = $derived(compiledQuery ? JSON.stringify(compiledQuery) : null);

	// The node of the active block. A block owns its node, so a switch of block
	// switches the node. The URL is a primitive, so the run effect below can track
	// it. It is null while the block names no node, and while the instance list
	// holds no node for its ref. The effect then runs nothing.
	//
	// The URL also belongs in the run key. A user can add a node that a share link
	// asked for. The query must then run, with no other change to the block.
	const activeInstanceUrl = $derived(workspace.activeInstance?.url ?? null);

	let lastRunKey: string | null = $state(null);
	/**
	 * The query that the safeguard stopped last. It keeps the warning to one
	 * toast: this effect writes `lastRunKey`, which makes it run a second time.
	 */
	let lastBlockedKey: string | null = $state(null);
	/** The block of the last run. A new block may move the camera; a re-run may not. */
	let lastRunBlockId: string | null = $state(null);

	// The safeguard blocks a query with no filter. It belongs in the run key, so
	// the query runs after the user turns the safeguard off.
	const requireFilters = $derived($settings.requireQueryFilters);

	// Repaint when the Legend changes the palette or the range. The reads below
	// are the dependencies; the redraw itself rebuilds the colour table.
	$effect(() => {
		void [map.palette, map.paletteReverse, map.colorScaleMin, map.colorScaleMax];
		map.redrawColors();
	});

	$effect(() => {
		if (map.selectedDataColumnName) {
			map.showDataColumn();
		}
	});

	// Re-run only when the selected block, or its compiled query content, actually changes.
	$effect(() => {
		const blockId = activeBlockId;
		const key = queryKey;
		const instanceUrl = activeInstanceUrl;

		if (!blockId || !key || !instanceUrl) {
			map.clearQueryResult();
			lastRunKey = null;
			return;
		}

		// The safeguard stops a query with no filter. Show nothing, and run nothing.
		// The run key stays empty, so a revert of the edit runs the query again.
		const blocked = runBlockReason(untrack(() => compiledQuery));
		if (blocked) {
			const blockedKey = `${blockId}:${instanceUrl}:${key}`;
			if (blockedKey !== lastBlockedKey) {
				lastBlockedKey = blockedKey;
				addToast({ type: 'warning', message: blocked });
			}

			map.clearQueryResult();
			lastRunKey = null;
			return;
		}

		lastBlockedKey = null;

		const runKey = `${blockId}:${instanceUrl}:${key}:${requireFilters}`;
		if (runKey === lastRunKey) return;

		const isSameBlock = blockId === lastRunBlockId;
		lastRunKey = runKey;
		lastRunBlockId = blockId;

		// Read the live block/query untracked: we only want blockId+key above to
		// drive re-runs, not every downstream write this triggers.
		const { block, query, instance } = untrack(() => ({
			block: workspace.activeBlock,
			query: compiledQuery,
			instance: workspace.activeInstance
		}));
		if (!block || !query || !instance) return;

		// The saved area and the saved map view of this block belong on the map
		// again. A block with no saved view gets the defaults back.
		if (!isSameBlock) {
			selection = block.draft?.spatialFilter ?? null;
			map.applyViewState(block.id, block.view?.map);
		}

		// Show a cached result at once if the block already has one.
		map.showQueryFromCache(block.datasetKey);

		// An edit of the same block keeps the camera where the user put it.
		map.runAndShowQuery(query, instance, block.id, isSameBlock);
	});

	// Keep the display state of the map with the block: the painted column, the
	// range of the legend and the camera. Therefore a visit to the table or the
	// chart page, and a reload, bring the same map back.
	//
	// `viewStateFor` returns null while the map still holds the state of another
	// block. The write goes untracked: it replaces the block object, and a
	// tracked read of that object would run this effect again.
	$effect(() => {
		const state = map.viewStateFor(activeBlockId);
		if (!state) return;
		untrack(() => workspace.updateActiveMapView(state));
	});

	/**
	 * Write the drawn area into the query. The effect above then re-runs it.
	 *
	 * The area names the two columns it tests. The builder can pick another pair
	 * than the detection finds, for example `x` and `y`. A redraw here must keep
	 * that pair, so the columns come from the area of the block.
	 */
	function applyAreaFilter() {
		if (!selection) {
			workspace.updateActiveSpatialFilter(null);
			return;
		}

		const stored = workspace.activeBlock?.draft?.spatialFilter ?? selection;
		const columns = selectionColumns(stored, map.availableColumnNames);

		workspace.updateActiveSpatialFilter(withColumns(selection, columns));
	}
</script>

<svelte:head>
	<title>Map - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Visualisations', href: '/visualisations' },
		{ label: 'Map viewer', href: '/visualisations/map-viewer' }
	]}
/>

<div class="page-wrapper">
	<QuerySelectorHeader {workspace} {queryActions} mode="view" />

	<div class="vertical-tabs-wrapper">
		<VisualisationTabs />

		<div class="content page-container">
			<div class="map-wrapper">
				<div bind:this={mapContainer} class="map"></div>

				{#if compiledQuery}
					<div class="map-info-wrapper">
						<div class="my-ctrl-group">
							<p class="summary">
								{map.rowCount} rows selected in {Utils.formatSecondsToReadableTime(
									map.durationMs / 1000
								)}.
							</p>

							<div class="field">
								<Label size="sm" for="dataColumn">Data column</Label>

								<Select.Root
									type="single"
									name="dataColumn"
									bind:value={map.selectedDataColumnName}
								>
									<Select.Trigger id="dataColumn" class="full-width"
										>{map.selectedDataColumnName || 'Select a column'}</Select.Trigger
									>
									<Select.Content>
										<Select.Group>
											<Select.Label>Available columns</Select.Label>
											{#each map.dataColumnOptions as column, index (index)}
												<Select.Item value={column} label={column}>
													{column}
												</Select.Item>
											{/each}
										</Select.Group>
									</Select.Content>
								</Select.Root>
							</div>

							<Legend
								bind:colorScaleMin={map.colorScaleMin}
								bind:colorScaleMax={map.colorScaleMax}
								bind:palette={map.palette}
								bind:paletteReverse={map.paletteReverse}
							/>
						</div>
					</div>

					<div class="map-draw-wrapper">
						<MapDrawTools
							map={map.mapInstance}
							bind:selection
							onApply={applyAreaFilter}
							canApply={map.hasCoordinates}
							disabledReason="The query must select a latitude and a longitude column."
							onDrawingChange={(drawing) => map.setPicking(!drawing)}
							countFeatures={(ring) => map.countFeaturesInRing(ring)}
							countKey={map.datasetKey}
						/>
					</div>
				{/if}

				{#if !compiledQuery}
					<div class="loading-overlay">
						<p>Select a valid query above to see it on the map.</p>
					</div>
				{:else if map.isLoading}
					<div class="loading-overlay">
						<LoadingSpinner></LoadingSpinner>
						<h3>Loading...</h3>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="scss">
	.page-wrapper {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.vertical-tabs-wrapper {
		flex-grow: 1;
		min-height: 0;
		display: flex;
		flex-direction: row;
		gap: 1rem;

		.content.page-container {
			padding: 0;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		.content {
			flex-grow: 1;
		}

		.map-wrapper {
			flex-grow: 1;
			min-height: 0; // let the grid fill the flex parent instead of growing past it
			display: grid;
			// minmax(0, 1fr), not 1fr. A plain `1fr` is `minmax(auto, 1fr)`, so the
			// height of a child can push the row, and the map is 100% of that row.
			// A zero minimum keeps the map inside its parent.
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);

			> * {
				// stack every child in the same cell instead of position: absolute
				grid-column: 1;
				grid-row: 1;
			}

			.map-info-wrapper {
				justify-self: start;
				align-self: start;
				max-height: 100%;
				overflow-x: hidden;
				overflow-y: auto;
				z-index: 4; // Ensure it overlays the map

				.my-ctrl-group {
					// largely copied from maplibregl's ctrl group
					border-radius: 0.5rem;
					border: 1px solid var(--border);
					background-color: white;
					padding: 0.75rem;
					margin: 0.5rem;

					// The box floats over the map, so it takes a fixed width. Without
					// one a long column name or a raw data value stretches it across
					// the map.
					width: 17rem;
					display: flex;
					flex-direction: column;
					gap: 0.625rem;

					.summary {
						font-size: 0.8125rem;
						color: var(--muted-foreground, #6b7280);
						margin: 0;
					}

					.field {
						display: flex;
						flex-direction: column;
						gap: 0.1875rem;
						min-width: 0;
					}

					// The select trigger sizes to its content by default, which leaves
					// it ragged beside the palette picker.
					:global(.full-width) {
						width: 100%;
					}
				}
			}

			.map-draw-wrapper {
				justify-self: start;
				align-self: end;
				max-height: 100%;
				z-index: 4; // Ensure it overlays the map
			}

			.map {
				z-index: 3;
				height: 100%;
				width: 100%;
				border-radius: 0.5rem;
			}

			.loading-overlay {
				width: 100%;
				height: 100%;
				display: flex;
				flex-direction: column;
				gap: 1rem;
				align-items: center;
				justify-content: center;

				background-color: rgba(255, 255, 255, 0.5);
				z-index: 5; // Ensure it overlays the map
			}
		}
	}
</style>
