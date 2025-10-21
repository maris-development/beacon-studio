<script lang="ts">
	import { browser } from '$app/environment';
	import {  onDestroy, onMount, unmount } from 'svelte';
	import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import { color as d3Color } from 'd3-color';
	import maplibregl, { Popup } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import LoadingSpinner from '@/components/loading-overlay/loading-spinner.svelte';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import { addToast } from '@/stores/toasts';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient, NoDataInResponseError } from '@/beacon-api/client';
	import { Utils } from '@/utils';
	import * as ApacheArrow from 'apache-arrow';
	import type { CompiledQuery, GeoParquetOutputFormat, QueryResponse, QueryResponseKind, Select as QuerySelect } from '@/beacon-api/types';
	import MapInfo from '@/components/map-info.svelte';
	import MapPopupContent from '@/components/map-popup-content.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { ArrowProcessingWorkerManager } from '@/workers/ArrowProcessingWorkerManager';
	import Legend, { SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from '@/components/legend/legend.svelte';
	
	import { ApacheArrowUtils } from '@/arrow-utils';
	import type { Rendered } from '@/util-types';
	import type { ScaleSequential } from 'd3-scale';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';

	const GROUP_BY_DECIMALS = 3; // Number of decimals to group by for lat/lon (4 = 11m, 3 = 111m, 2 = 1111m, 1 = 11111m, 0 = 111111m)
	
	let arrowWorker: ArrowProcessingWorkerManager;
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	let mapContainer: HTMLDivElement | null = null;
	let map: maplibregl.Map | null = null;
	let layer: GeoArrowScatterplotLayer | null = null;
	let deckOverlay: DeckOverlay | null = null;

	let originalTable: ApacheArrow.Table | null = null; // original query data table 
	let table: ApacheArrow.Table | null = null; // current data table that is being displayed (e.g. de-duplicated by lat/lon)
	let mapPopup: maplibregl.Popup | null = null;
	let mapPopupContent: Rendered;
	
	let query: CompiledQuery | undefined = $state(undefined);
	let table_kind: QueryResponseKind | null = $state(null);
	let amountOfRows: number = $state(0);
    let queryDurationMs: number | null = $state(null);
	let isLoading = $state(true);
	let firstLoad = $state(true);
	let editQueryModalOpen = $state(false);
	let noQueryAvailableModalOpen = $state(false);
	let editQueryString = $state('');
	let availableColumnNames: string[] = $state([]);
	let selectedDataColumnName: string = $state(undefined);
	let latitudeColumnName = 'latitude';
	let longitudeColumnName = 'longitude';

	let colorScaleMin: number = $state(-1000);
	let colorScaleMax: number = $state(1000);
	let colorScale: ScaleSequential<string, never> = $state(undefined);

	$effect(() =>{
		if(colorScale && layer) {
			layer.setNeedsRedraw();
		}
	});

	$effect(() => {
		if(selectedDataColumnName){
			addGeoArrowLayer();
		}
	});


	onMount(async () => {
		if (!browser) return;

		arrowWorker = new ArrowProcessingWorkerManager();
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		initMap();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
		arrowWorker.terminate();
	});

	function initMap(){
		map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
			center: [0.45, 51.47],
			zoom: 1,
			bearing: 0,
			pitch: 0
		});

		map.addControl(new maplibregl.NavigationControl());

		mapPopup = new maplibregl.Popup({
			closeButton: true,
			closeOnClick: false,
			className: 'map-popup',
			maxWidth: 'none'
		});

		map.once('load', () => {
			console.log('Map loaded successfully');
			getUrlSuppliedQuery();
		});
	}

	function getUrlSuppliedQuery() {
		query = Utils.getUrlSuppliedQuery();


		if (query) {
            query.output.format = 'parquet'; // Ensure the output format is set to parquet

			// Use the decoded query for your logic
			executeAndDisplayQuery();
		} else {
			// TODO: Ask user for query json
			isLoading = false;
			editQueryString = '{ "message": "Enter a JSON query" }';
			noQueryAvailableModalOpen = true;
		}
	}

	async function executeAndDisplayQuery() {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		try {
			changeQueryOutputToGeoparquet(); 

			await executeQuery(); 

			await prepareTableForDisplay();
			
		} catch (error) {

			if(error instanceof NoDataInResponseError){
				addToast({
					type: 'info',
					message: `Query executed successfully but returned no data.`
				});
				return;
			}
			
			console.error(error);
			isLoading = false;
			addToast({
				type: 'error',
				message: `Failed to execute query: ${error.message}`
			});
		}
		
	}

	function changeQueryOutputToGeoparquet(){
		
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
			throw new Error('Query must contain Latitude and Longitude columns (or columns containing these words (case insensitive))');
		}

		let newOutputFormat: GeoParquetOutputFormat = {
			geoparquet: {
				latitude_column: latitudeColumnSelect.alias ?? latitudeColumnSelect.column,
				longitude_column: longitudeColumnSelect.alias ?? longitudeColumnSelect.column
			}
		};

		latitudeColumnName = newOutputFormat.geoparquet.latitude_column;
		longitudeColumnName = newOutputFormat.geoparquet.longitude_column;

		console.log('changeQueryOutputToGeoparquet', {
			latitudeColumnName,
			longitudeColumnName,
		});

		query.output.format = newOutputFormat;
	}


	async function executeQuery() {

		const startTime = performance.now();
		const queryResponse = await client.query(query);
        const endTime = performance.now();
        
        queryDurationMs = endTime - startTime;
		
		originalTable = queryResponse.arrow_table;
		table_kind = queryResponse.kind;

		amountOfRows = originalTable.numRows;
	}


	async function prepareTableForDisplay(){
		if(!originalTable){
			addToast({
				type: 'error',
				message: 'No table data available to display.'
			});
			return;
		}

		try {
			table = await arrowWorker.deduplicateTable(originalTable, latitudeColumnName, longitudeColumnName, amountOfRows, GROUP_BY_DECIMALS);

		} catch(error) {
			addToast({
				type: 'error',
				message: `Failed to group dataset by lat/lon: ${error.message}`
			});
			return;
		}

		isLoading = false;

		if(!selectedDataColumnName){
			addToast({
				type: 'info',
				message: 'Select a data column to display on the map.'
			});
		}
	
	}

	let currentDataColumnName: string | undefined = undefined;

	async function addGeoArrowLayer() {

		if(!selectedDataColumnName) return;

		if(selectedDataColumnName === currentDataColumnName) {
			console.log('Selected data column is the same as before, skipping layer update.');
			return;
		} else {
			currentDataColumnName = selectedDataColumnName;
		}

		console.log('Adding GeoArrow layer to map...', selectedDataColumnName);

		isLoading = true;

		if (deckOverlay) {
			map.removeControl(deckOverlay);
			deckOverlay = null;
		}

		layer = await createGeoArrowLayer();

		deckOverlay = new DeckOverlay({
			interleaved: true,
			layers: [layer]
		});

		map.addControl(deckOverlay);

		const tableBounds = ApacheArrowUtils.getTableGeometryBounds(table, latitudeColumnName, longitudeColumnName);

		map.fitBounds(tableBounds, {
			padding: { top: 50, bottom: 50, left: 50, right: 50 }
		});

		isLoading = false;

		console.log('GeoArrow layer added successfully');
	}

	async function createGeoArrowLayer(): Promise<GeoArrowScatterplotLayer> {

		if (!table) {
			throw new Error('Table is not loaded');
		}

		if(selectedDataColumnName && colorScaleMin == SCALE_DEFAULT_MIN && colorScaleMax == SCALE_DEFAULT_MAX){
			const minMax = await arrowWorker.getColumnMinMax(originalTable, selectedDataColumnName);
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

	function onPointClick(info){

		console.log('Point clicked:', info.coordinate);

		destroyMapPopupContent();
		mapPopup.remove();
		
		//get current HTML
		mapPopupContent = Utils.renderComponent(MapPopupContent, {
			rowData: info.object.toArray(),
			table: originalTable,
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

	function getFillColor(d): [number, number, number, number]
	{
		const row = d.data.data.get(d.index);
	
		if (!row) {
			return [0, 0, 0, 0]; // Default to transparent black if row is undefined
		}

		const value = row[selectedDataColumnName];

		// Check if value if a number
		if (typeof value !== 'number' || isNaN(value)) {
			return [0, 0, 0, 0]; // Default to transparent black if value is not a number
		}

		const color = d3Color((colorScale(value) as any))?.rgb(); // returns RGB object

		if (!color) {
			return [0, 0, 0, 0]; // Default to black if color is not defined
		}

		return [color.r, color.g, color.b, 192];
	}


	function updateQuery(newQuery) {
		query = newQuery;
		
		firstLoad = true;
		isLoading = true;

		executeAndDisplayQuery();
	}

	function openEditQueryModal() {
		if(query) editQueryString = JSON.stringify(query, null, 2);
		editQueryModalOpen = true;
	}

	function closeEditQueryModal(save = true) {
		editQueryModalOpen = false;

		if (!save) {
			let confirmation = confirm('You have unsaved changes. Are you sure you want to close?');
			if (confirmation) {
				return;
			}
		}

		try {
			const parsedQuery = JSON.parse(editQueryString);
			updateQuery(parsedQuery);
		} catch (error) {
			addToast({
				type: 'error',
				message: `Failed to parse query JSON: ${error.message}`
			});
			return;
		}
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

<div class="map-wrapper">
	<div bind:this={mapContainer} class="map">
		
	</div>
	<div class="map-info-wrapper">
		<MapInfo onEditClick={openEditQueryModal} compiledQuery={query}>
			<p>
				{amountOfRows} rows selected in {Utils.formatSecondsToReadableTime(queryDurationMs / 1000)}.
			</p>

			<Select.Root type="single" name="dataColumn" bind:value={selectedDataColumnName}>
				<Select.Trigger>{selectedDataColumnName || 'Select a data column to display'}</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Label>Available columns</Select.Label>
						{#each availableColumnNames as column}
							<Select.Item value={column} label={column}>
								{column}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>

			<br>

			<Legend
				bind:colorScaleMin
				bind:colorScaleMax
				bind:colorScale
			/>


		</MapInfo>
	</div>

	{#if isLoading}
		<div class="loading-overlay">
			<LoadingSpinner></LoadingSpinner>
			<h3>Loading...</h3>
		</div>
	{/if}
</div>

{#if editQueryModalOpen}
	<EditQueryJsonModal bind:editQueryString onClose={closeEditQueryModal} />
{/if}


{#if noQueryAvailableModalOpen}
	<NoQueryAvailableModal onCancel={() => noQueryAvailableModalOpen = false} openQueryJsonEditor={() => { noQueryAvailableModalOpen = false; openEditQueryModal(); }} />
{/if}



<style lang="scss">
	.map-wrapper {
		flex-grow: 1;
		position: relative;
		width: 100%;
		height: 100%;

		.map-info-wrapper {
			position: absolute;
			top: 0;
			left: 0;
			overflow-x: hidden;
			overflow-y: auto;
			z-index: 4; // Ensure it overlays the map
		}

		.map {
			z-index: 3;
			height: 100%;
			width: 100%;
			border-radius: 0 0 calc(0.625rem + 4px) calc(0.625rem + 4px);
		}

		.loading-overlay {
			position: absolute;
			top: 0;
			left: 0;
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
</style>
