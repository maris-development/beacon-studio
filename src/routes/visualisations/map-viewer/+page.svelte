<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
	import type { PickingInfo } from '@deck.gl/core';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import * as d3 from 'd3';
	import { interpolatePuOr } from 'd3-scale-chromatic';
	import { scaleSequential, type ScaleSequential } from 'd3-scale';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';
	import LoadingSpinner from '@/components/loading-overlay/loading-spinner.svelte';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import { addToast } from '@/stores/toasts';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { page } from '$app/state';
	import { ApacheArrowUtils, Utils } from '@/utils';
	import * as ApacheArrow from 'apache-arrow';
	import type { CompiledQuery, GeoParquetOutputFormat, QueryResponse, QueryResponseKind, Select as QuerySelect } from '@/beacon-api/types';
	import MapInfo from '@/components/map-info.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { ArrowWorkerManager } from '@/workers/ArrowWorkerManagager';
	import Legend, { SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from '@/components/legend/legend.svelte';
	
	const arrowWorker: ArrowWorkerManager = new ArrowWorkerManager();
	

	let query: CompiledQuery | undefined = $state(undefined);
	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let map: maplibregl.Map | null = null;
	let layer: GeoArrowScatterplotLayer | null = null;
	let deckOverlay: DeckOverlay | null = null;
	let onClickInfo: PickingInfo | null = null;
	let onClickClose: boolean = false;
	let originalTable: ApacheArrow.Table | null = null; //current data table that is being displayed
	let table: ApacheArrow.Table | null = null; //current data table that is being displayed
	let table_kind: QueryResponseKind | null = $state(null);
	let amountOfRows: number = $state(0);
	let isLoading = $state(true);
	let firstLoad = $state(true);
	let editQueryModalOpen = $state(false);
	let editQueryString = $state('');
	let availableColumnNames: string[] = $state([]);
	let selectedDataColumnName: string = $state(undefined);
	let latitudeColumnName = 'latitude';
	let longitudeColumnName = 'longitude';

	let colorScaleMin: number = $state(-1000);
	let colorScaleMax: number = $state(1000);

	let colorScale: ScaleSequential<number, never> = $state(scaleSequential(interpolatePuOr).domain([-1000, 1000]));

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

		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		initMap();
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	function initMap(){
		map = new maplibregl.Map({
			container: 'deck-gl-map',
			style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
			center: [0.45, 51.47],
			zoom: 1,
			bearing: 0,
			pitch: 0
		});

		map.addControl(new maplibregl.NavigationControl());

		map.once('load', () => {
			getUrlSuppliedQuery();
		});
	}

	function getUrlSuppliedQuery() {
		const urlSuppliedQuery = page.url.searchParams.get('query');

		if (urlSuppliedQuery) {
			try {
				query = Utils.gzipStringToObject(urlSuppliedQuery);
				query.output.format = 'parquet';
			} catch (error) {
				console.error('Failed to decode query:', error);
			}
		}

		if (query) {
			// Use the decoded query for your logic
			executeAndDisplayQuery();
		} else {
			// TODO: Ask user for query json
			isLoading = false;
			editQueryString = '{ "message": "Enter a JSON query" }';
			editQueryModalOpen = true;
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

		latitudeColumnName= newOutputFormat.geoparquet.latitude_column;
		longitudeColumnName = newOutputFormat.geoparquet.longitude_column;

		console.log('changeQueryOutputToGeoparquet', {
			latitudeColumnName,
			longitudeColumnName,
		});

		query.output.format = newOutputFormat;
	}


	async function executeQuery() {

		const result = await client.query(query);

		if (result.isErr()) {
			console.error(result.unwrapErr());
			addToast({
				type: 'error',
				message: `Failed to execute query: ${result.unwrapErr()}`
			});
		}

		const queryResponse: QueryResponse = result.unwrap();

		if (queryResponse.kind == 'error') {
			console.error(queryResponse.error_message);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${queryResponse.error_message}`
			});
			return;
		}

		if (!('arrow_table' in queryResponse)) {
			console.error('Unexpected query result format:', queryResponse);
			addToast({
				type: 'error',
				message: `Unexpected query result format`
			});
			return;
		}
		
		originalTable = queryResponse.arrow_table;
		amountOfRows = originalTable.numRows;
		table_kind = queryResponse.kind;

		

		// console.log('Query result received successfully.', queryResponse.arrow_table.schema);
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
			table = await arrowWorker.deduplicateTable(originalTable, latitudeColumnName, longitudeColumnName, amountOfRows);

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
			getRadius: 100,
			radiusMaxPixels: 20,
			pickable: true,
			autoHighlight: true,
			highlightColor: [255, 255, 0, 128], // Yellow highlight color
			onClick: (info) => {
				console.log('Clicked on point:', info);
				if (!info.object) {
					onClickInfo = null;
					onClickClose = false;
					return;
				}
				onClickClose = true;
				onClickInfo = info;
			},
			updateTriggers: {
				getFillColor: [colorScale, selectedDataColumnName]
			}
		});
	}


	function getFillColor(d){
		const row = d.data.data.get(d.index);
		if (!row) {
			return [0, 0, 0, 0]; // Default to transparent black if row is undefined
		}

		const value = row[selectedDataColumnName];

		// Check if value if a number
		if (typeof value !== 'number' || isNaN(value)) {
			return [0, 0, 0, 0]; // Default to transparent black if value is not a number
		}

		const color = d3.color(colorScale(value))?.rgb(); // returns RGB object

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
		editQueryString = JSON.stringify(query, null, 2);
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
	<div id="deck-gl-map" class="map"></div>

	<div class="map-info-wrapper">
		<MapInfo onEditClick={openEditQueryModal}>
			<p>Rows: {amountOfRows}</p>

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

	{#if editQueryModalOpen}
		<EditQueryJsonModal bind:editQueryString onClose={closeEditQueryModal} />
	{/if}
</div>

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
			overflow-y: auto;
			z-index: 10; // Ensure it overlays the map
		}

		.map {
			z-index: 9;
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
			z-index: 10; // Ensure it overlays the map
		}
	}
</style>
