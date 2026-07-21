<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount, unmount } from 'svelte';
	import { MapboxOverlay as MapboxOverlay } from '@deck.gl/mapbox';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import { color as d3Color } from 'd3-color';
	import maplibregl, { NavigationControl } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import LoadingSpinner from '@/components/loading-overlay/LoadingSpinner.svelte';
	import EditQueryJsonModal from '@/components/modals/EditQueryJsonModal.svelte';
	import { addToast } from '@/stores/toasts';
	import { Utils } from '@/utils';
	import * as ApacheArrow from 'apache-arrow';
	import type { CompiledQuery, Select as QuerySelect } from '@/beacon-api/types';
	import { queryStore, type DatasetEntry } from '@/stores/query-store.svelte';
	import MapInfo from '@/components/map-info.svelte';
	import MapPopupContent from '@/components/map-popup-content.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import Legend, { SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from '@/components/legend/Legend.svelte';

	import { ApacheArrowUtils } from '@/arrow-utils';
	import type { Rendered } from '@/util-types';
	import type { ScaleSequential } from 'd3-scale';
	import NoQueryAvailableModal from '@/components/modals/NoQueryAvailableModal.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const GROUP_BY_DECIMALS = 3; // Number of decimals to group by for lat/lon (4 = 11m, 3 = 111m, 2 = 1111m, 1 = 11111m, 0 = 111111m)

	let mapContainer: HTMLDivElement | null = null;
	let map: maplibregl.Map | null = null;
	let layer: GeoArrowScatterplotLayer | null = null;
	let mapOverlay: MapboxOverlay | null = null;
	let mapPopup: maplibregl.Popup | null = null;
	let mapPopupContent: Rendered;

	let query: CompiledQuery | undefined = $state(undefined);

	let entry = $state.raw<DatasetEntry | null>(null);
	let amountOfRows: number = $derived(entry?.rowCount ?? 0);
	let queryDurationMs: number | null = $derived(entry?.duration ?? 0);
	let originalTable: ApacheArrow.Table | null = $derived(entry?.table ?? null); // raw query result
	let table: ApacheArrow.Table | null = null; // display table (de-duplicated by lat/lon + geometry)

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

		map.once('load', () => {
			// console.log('Map loaded successfully');
			getUrlSuppliedQuery();
		});
	}

	function getUrlSuppliedQuery() {
		query = Utils.getUrlSuppliedQuery();

		if (query) {
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
			deriveColumnNames();

			entry = await queryStore.ensure(query);

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
			console.error(error);
			isLoading = false;
			addToast({
				type: 'error',
				message: `Failed to execute query: ${error.message}`
			});
		}
	}

	function deriveColumnNames() {
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
			table = await queryStore.mapTable(
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
			const minMax = await queryStore.minMax(entry, selectedDataColumnName);
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

	function updateQuery(newQuery) {
		query = newQuery;

		firstLoad = true;
		isLoading = true;

		executeAndDisplayQuery();
	}

	function openEditQueryModal() {
		if (query) editQueryString = JSON.stringify(query, null, 2);
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

	async function handleEditQuery() {
		if (!query) {
			addToast({
				type: 'error',
				message: 'No query available to edit.'
			});
			return;
		}

		const gzippedQuery = Utils.objectToGzipString(query);

		if (gzippedQuery) {
			goto(resolve('/queries/query-builder') + `?query=${encodeURIComponent(gzippedQuery)}`);
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
	<div bind:this={mapContainer} class="map"></div>
	<div class="map-info-wrapper">
		<MapInfo onEditClick={openEditQueryModal} onEditBuilderClick={handleEditQuery} compiledQuery={query}>
			<p>
				{amountOfRows} rows selected in {Utils.formatSecondsToReadableTime(queryDurationMs / 1000)}.
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
	<NoQueryAvailableModal
		onCancel={() => (noQueryAvailableModalOpen = false)}
		openQueryJsonEditor={() => {
			noQueryAvailableModalOpen = false;
			openEditQueryModal();
		}}
	/>
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
