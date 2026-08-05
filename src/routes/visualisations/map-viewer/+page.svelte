<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount, unmount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { MapboxOverlay } from '@deck.gl/mapbox';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import { color as d3Color } from 'd3-color';
	import maplibregl, { NavigationControl } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import LoadingSpinner from '@/components/loading-overlay/LoadingSpinner.svelte';
	import { addToast } from '@/stores/toasts';
	import { Utils } from '@/utils';
	import * as ApacheArrow from 'apache-arrow';
	import type { CompiledQuery, Select as QuerySelect } from '@/beacon-api/types';
	import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
	import MapPopupContent from '@/components/MapPopupContent.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import Legend, { SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from '@/components/legend/Legend.svelte';

	import { ApacheArrowUtils } from '@/arrow-utils';
	import type { Rendered } from '@/util-types';
	import type { ScaleSequential } from 'd3-scale';
	import { resolveUrlQuery } from '@/stores/query-library';
	import QuerySelectorHeader from '@/components/query-builder/QuerySelectorHeader.svelte';
	import { QueryWorkspace } from '@/components/query-builder/QueryWorkspace.svelte';
	import type { StoredQuery } from '@/stores/stored-query';
	import { currentBeaconInstance } from '@/stores/config';
	import { getDefaultQueryActions } from '@/components/query-builder/QueryActions';
	import VisualisationTabs from '@/components/visualisation/VisualisationTabs.svelte';

	const GROUP_BY_DECIMALS = 3; // Number of decimals to group by for lat/lon (4 = 11m, 3 = 111m, 2 = 1111m, 1 = 11111m, 0 = 111111m)

	let mapContainer: HTMLDivElement | null = null;
	let map: maplibregl.Map | null = null;
	let layer: GeoArrowScatterplotLayer | null = null;
	let mapOverlay: MapboxOverlay | null = null;
	let mapPopup: maplibregl.Popup | null = null;
	let mapPopupContent: Rendered;

	let entry = $state.raw<DatasetEntry | null>(null);
	let amountOfRows: number = $derived(entry?.rowCount ?? 0);
	let queryDurationMs: number | null = $derived(entry?.duration ?? 0);
	let originalTable: ApacheArrow.Table | null = $derived(entry?.table ?? null); // raw query result
	let table: ApacheArrow.Table | null = null; // display table (de-duplicated by lat/lon + geometry)

	let isLoading = $state(true);
	let availableColumnNames: string[] = $state([]);
	let selectedDataColumnName: string = $state(undefined);
	let latitudeColumnName = 'latitude';
	let longitudeColumnName = 'longitude';

	let colorScaleMin: number = $state(-1000);
	let colorScaleMax: number = $state(1000);
	let colorScale: ScaleSequential<string, never> = $state(undefined);

	const workspace = $state(new QueryWorkspace());
	let client: BeaconClient | null = $state(null);

	onMount(() => {
		const instance = $currentBeaconInstance;
		if (instance) client = BeaconClient.new(instance);

		// A deep-link opens one more block. `?q=` comes from "open in workbench"
		// and brings the saved builder state. `?query=` comes from a share link.
		workspace.openFromUrl(resolveUrlQuery(page.url));

		return () => workspace.destroy();
	});

	const queryActions = $derived(getDefaultQueryActions(workspace, client));

	// `workspace.activeBlock` is a new object on every write to the block
	// collection — including our own `markBlockRun` below. Tracking that object
	// (or `compiledQuery` derived from it) as an effect dependency would re-fire
	// the effect after every run, forever. Track primitives instead: the block id
	// and a content key for the compiled query.
	const activeBlockId = $derived(workspace.activeBlockId);
	const compiledQuery: CompiledQuery | null = $derived(QueryWorkspace.getQuery(workspace.activeBlock));
	const queryKey = $derived(compiledQuery ? JSON.stringify(compiledQuery) : null);

	let lastRunKey: string | null = $state(null);

	$effect(() => {
		if (colorScale && layer) {
			layer.setNeedsRedraw();
			addGeoArrowLayer(true);
		}
	});

	$effect(() => {
		if (selectedDataColumnName) {
			addGeoArrowLayer();
		}
	});

	// Re-run only when the selected block, or its compiled query content, actually changes.
	$effect(() => {
		const blockId = activeBlockId;
		const key = queryKey;

		if (!blockId || !key) {
			entry = null;
			isLoading = false;
			lastRunKey = null;
			return;
		}

		const runKey = `${blockId}:${key}`;
		if (runKey === lastRunKey) return;
		lastRunKey = runKey;

		// Read the live block/query untracked: we only want blockId+key above to
		// drive re-runs, not every downstream write this triggers.
		const { block, query } = untrack(() => ({
			block: workspace.activeBlock,
			query: compiledQuery
		}));
		if (!block || !query) return;

		// Show a cached result at once if the block already has one.
		entry = BeaconClient.peekQueryByKey(block.datasetKey) ?? null;

		executeAndDisplayQuery(block, query);
	});

	onMount(() => {
		if (!browser) return;

		initMap();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	function initMap() {
		map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
			center: [0.45, 51.47],
			zoom: 1,
			bearing: 0,
			pitch: 0
		});

		map.addControl(new NavigationControl());
		// map.addControl(new GlobeControl(), 'top-right'); //doesnt work with deck.gl overlay...

		mapOverlay = new MapboxOverlay({
			interleaved: true,
			layers: []
		});

		map.addControl(mapOverlay);

		mapPopup = new maplibregl.Popup({
			closeButton: true,
			closeOnClick: false,
			className: 'map-popup',
			maxWidth: 'none'
		});
	}

	async function executeAndDisplayQuery(block: StoredQuery, query: CompiledQuery) {
		isLoading = true;
		workspace.markBlockRunning(block.id, true);

		try {
			deriveColumnNames(query);

			entry = await BeaconClient.ensureQuery(query, block.id);
			workspace.markBlockRun(block.id, entry.rowCount);

			if (entry.rowCount === 0) {
				isLoading = false;
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}

			await prepareTableForDisplay();
		} catch (error) {
			console.error('Failed to execute query:', error);
			isLoading = false;
			workspace.markBlockRunning(block.id, false);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${error.message}`
			});
		}
	}

	function deriveColumnNames(query: CompiledQuery) {
		// console.log('Deriving column names from query parameters...', query);

		availableColumnNames = query.query_parameters.map((param: QuerySelect) => {
			return param.alias ?? param.column;
		});

		let latitudeColumnSelect = query.query_parameters.find((param: QuerySelect) => {
			return (param.alias ?? param.column).toLowerCase().includes('latitude');
		});

		let longitudeColumnSelect = query.query_parameters.find((param: QuerySelect) => {
			return (param.alias ?? param.column).toLowerCase().includes('longitude');
		});

		if (!latitudeColumnSelect || !longitudeColumnSelect) {
			throw new Error(
				'Query must contain Latitude and Longitude columns (or columns containing these words (case insensitive))'
			);
		}

		latitudeColumnName = latitudeColumnSelect.alias ?? latitudeColumnSelect.column;
		longitudeColumnName = longitudeColumnSelect.alias ?? longitudeColumnSelect.column;
	}

	async function prepareTableForDisplay() {
		if (!entry || !originalTable) {
			addToast({
				type: 'error',
				message: 'No table data available to display.'
			});
			return;
		}

		try {
			table = await BeaconClient.queryMapTable(
				entry,
				latitudeColumnName,
				longitudeColumnName,
				GROUP_BY_DECIMALS
			);
		} catch (error) {
			addToast({
				type: 'error',
				message: `Failed to group dataset by lat/lon: ${error.message}`
			});
			return;
		}

		isLoading = false;

		if (!selectedDataColumnName) {
			addToast({
				type: 'info',
				message: 'Select a data column to display on the map.'
			});
		}
	}

	let currentDataColumnName: string | undefined = undefined;

	async function addGeoArrowLayer(force: boolean = false) {
		if (!selectedDataColumnName) return;

		if (selectedDataColumnName === currentDataColumnName && !force) {
			// console.log('Selected data column is the same as before, skipping layer update.');
			return;
		} else {
			currentDataColumnName = selectedDataColumnName;
		}

		// console.log('Adding GeoArrow layer to map...', selectedDataColumnName);

		isLoading = true;

		layer = await createGeoArrowLayer();
		mapOverlay.setProps({ layers: [layer] }); // <-- instead of remove/re-add

		const tableBounds = ApacheArrowUtils.getTableGeometryBounds(
			table,
			latitudeColumnName,
			longitudeColumnName
		);

		map.fitBounds(tableBounds, {
			padding: { top: 50, bottom: 50, left: 50, right: 50 }
		});

		isLoading = false;

		// console.log('GeoArrow layer added successfully');
	}

	async function createGeoArrowLayer(): Promise<GeoArrowScatterplotLayer> {
		if (!table) {
			throw new Error('Table is not loaded');
		}

		if (
			entry &&
			selectedDataColumnName &&
			colorScaleMin == SCALE_DEFAULT_MIN &&
			colorScaleMax == SCALE_DEFAULT_MAX
		) {
			const minMax = await BeaconClient.queryColumnMinMax(entry, selectedDataColumnName);
			colorScaleMin = minMax.min;
			colorScaleMax = minMax.max;
		}

		return new GeoArrowScatterplotLayer({
			id: 'geoarrow-points',
			data: table,
			// Pre-computed colors in the original table
			opacity: 1,
			radiusMinPixels: 3,
			radiusUnits: 'meters',
			getFillColor: getFillColor,
			onClick: onPointClick,

			getRadius: 100,
			radiusMaxPixels: 20,
			pickable: true,
			autoHighlight: true,
			highlightColor: [255, 255, 0, 128], // Yellow highlight color
			updateTriggers: {
				getFillColor: [colorScale, selectedDataColumnName]
			}
		});
	}

	function onPointClick(info) {
		if (!entry || !originalTable) return;

		// console.log('Point clicked:', info.coordinate);

		destroyMapPopupContent();
		mapPopup.remove();

		//get current HTML
		mapPopupContent = Utils.renderComponent(MapPopupContent, {
			rowData: info.object.toArray(),
			table: originalTable,
			datasetKey: entry.key,
			latitudeColumnName,
			longitudeColumnName,
			groupByDecimals: GROUP_BY_DECIMALS
		});

		mapPopup.setDOMContent(mapPopupContent.element);
		mapPopup.setLngLat(info.coordinate);
		mapPopup.addTo(map);

		mapPopup.off('close', destroyMapPopupContent);
		mapPopup.on('close', destroyMapPopupContent);
	}

	function destroyMapPopupContent() {
		if (mapPopupContent) {
			unmount(mapPopupContent.handle);
			mapPopupContent = null;
		}
	}

	function getFillColor(d): [number, number, number, number] {
		const row = d.data.data.get(d.index);

		if (!row) {
			return [0, 0, 0, 0]; // Default to transparent black if row is undefined
		}

		const value = row[selectedDataColumnName];

		// Check if value if a number
		if (typeof value !== 'number' || isNaN(value)) {
			return [0, 0, 0, 0]; // Default to transparent black if value is not a number
		}

		const scale = colorScale(value);
		const color = d3Color(scale)?.rgb(); // returns RGB object

		if (!color) {
			return [0, 0, 0, 0]; // Default to black if color is not defined
		}

		return [color.r, color.g, color.b, 192];
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
							<p>
								{amountOfRows} rows selected in {Utils.formatSecondsToReadableTime(
									queryDurationMs / 1000
								)}.
							</p>

							<Select.Root type="single" name="dataColumn" bind:value={selectedDataColumnName}>
								<Select.Trigger
									>{selectedDataColumnName || 'Select a data column to display'}</Select.Trigger
								>
								<Select.Content>
									<Select.Group>
										<Select.Label>Available columns</Select.Label>
										{#each availableColumnNames as column, index (index)}
											<Select.Item value={column} label={column}>
												{column}
											</Select.Item>
										{/each}
									</Select.Group>
								</Select.Content>
							</Select.Root>

							<br />

							<Legend bind:colorScaleMin bind:colorScaleMax bind:colorScale />
						</div>
					</div>
				{/if}

				{#if !compiledQuery}
					<div class="loading-overlay">
						<p>Select a valid query above to see it on the map.</p>
					</div>
				{:else if isLoading}
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
			grid-template-columns: 1fr;
			grid-template-rows: 1fr;

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
					padding: 0.5rem;
					margin: 0.5rem;
				}
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
