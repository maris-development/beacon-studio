<script lang="ts">
	import LoadingSpinner from '$lib/components/ui/loading-spinner.svelte';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import wasmInit, { readParquet } from 'parquet-wasm';
	import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
	import type { PickingInfo } from '@deck.gl/core';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import {
		Table,
		tableFromIPC,
		vectorFromArray,
		type TypeMap,
		tableFromArrays
	} from 'apache-arrow';
	import * as d3 from 'd3';
	import {
		interpolateBrBG,
		interpolatePuOr,
		interpolateRdYlBu,
		interpolateViridis,
		interpolateMagma
	} from 'd3-scale-chromatic';
	import { scaleSequential } from 'd3-scale';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import BeaconMapQueryModal from '@/components/modals/BeaconMapQueryModal.svelte';
	import { QueryControl } from '@/components/map-controls/query-control/QueryControl';
	import { add } from 'date-fns';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';

	const GEOARROW_POINT_DATA = '/era5.geoparquet';
	const PARQUET_WASM_URL = '/parquet_wasm_bg.wasm';

	let map: maplibregl.Map | null = null;
	let deckOverlay: DeckOverlay | null = null;
	let loading = $state(true);
	let table: Table | null = null;
	let onClickInfo: PickingInfo | null = null;
	let onClickClose: boolean = false;
	let showQueryModal = $state(false);
	let beaconQuery = $state({
		query_parameters: [
			{
				column_name: '',
				alias: 'Value'
			},
			{
				column_name: '',
				alias: 'Time'
			},
			{
				column_name: '',
				alias: 'Depth'
			},
			{
				column_name: '',
				alias: 'Latitude'
			},
			{
				column_name: '',
				alias: 'Longitude'
			}
		],
		filters: [
			{
				for_query_parameter: 'Time',
				min: 1577836800, // Example min timestamp (2020-01-01)
				max: Date.now() / 1000 // Use current time as max
			},
			{
				for_query_parameter: 'Depth',
				min: 0,
				max: 5
			}
		],
		output: {
			format: {
				geoparquet: {
					longitude_column: 'Longitude',
					latitude_column: 'Latitude'
				}
			}
		}
	});

	const colorScale = scaleSequential(interpolatePuOr).domain([273, 313]);

	onMount(() => {
		onAsyncMount();

		return () => {
			if (map) {
				map.remove();
				map = null;
			}
		};
	});

	async function onAsyncMount() {
		if (!browser) return;

		await wasmInit(PARQUET_WASM_URL);

		map = new maplibregl.Map({
			container: 'deck-gl-map',
			style: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
			center: [0.45, 51.47],
			zoom: 1,
			bearing: 0,
			pitch: 0
		});

		const editQueryControl = new QueryControl({
			onEditClick: () => {
				showQueryModal = !showQueryModal;
			},
			onReRunClick: () => {
				// Handle re-run click
			}
		});

		map.addControl(editQueryControl);
		map.addControl(new maplibregl.NavigationControl());
		map.once('load', () => {
			addGeoArrowLayer();
		});
	}

	async function addGeoArrowLayer() {
		console.log('Adding GeoArrow layer to map...');

		let layer = await createGeoArrowLayer();

		deckOverlay = new DeckOverlay({
			interleaved: true,
			layers: [layer]
		});

		map.addControl(deckOverlay);

		// const tableBounds = getTableGeometryBounds(table);

		// setTimeout(() => {
		// 	map.fitBounds(tableBounds, {
		// 		padding: { top: 50, bottom: 50, left: 50, right: 50 }
		// 	});

		// 	loading = false;
		// }, 150);
		loading = false;
		console.log('GeoArrow layer added successfully');
	}

	async function createGeoArrowLayer(): Promise<GeoArrowScatterplotLayer> {
		table = await fetchData(new Request(GEOARROW_POINT_DATA), false);

		if (!table) {
			throw new Error('Table is not loaded');
		}

		return new GeoArrowScatterplotLayer({
			id: 'geoarrow-points',
			data: table,
			// Pre-computed colors in the original table
			opacity: 1,
			radiusUnits: 'meters',

			getFillColor: (d) => {
				const row = d.data.data.get(d.index);
				if (!row) {
					return [0, 0, 0, 0]; // Default to transparent black if row is undefined
				}

				const value = row['t2m'];
				// Check if value if a number
				if (typeof value !== 'number' || isNaN(value)) {
					return [0, 0, 0, 0]; // Default to transparent black if value is not a number
				}
				const color = d3.color(colorScale(value))?.rgb(); // returns RGB object
				// console.log('Color for value', value, ':', color);
				if (!color) {
					return [0, 0, 0, 0]; // Default to black if color is not defined
				}
				return [color.r, color.g, color.b, 192];
			},
			getRadius: 50000,
			radiusMaxPixels: 2,
			pickable: false,
			autoHighlight: false,
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
			}
		});
	}

	async function loadParquetFile<T extends TypeMap = any>(
		url: string | URL | Request,
		init: RequestInit = null
	): Promise<Table<T>> {
		const data = await fetch(url, init);
		const databuffer = await data.arrayBuffer();
		const parquet_file = await readParquet(new Uint8Array(databuffer), {
			batchSize: 128 * 1024
		});
		const arrow_stream = parquet_file.intoIPCStream();
		const table: Table<T> = tableFromIPC<T>(arrow_stream);

		return table;
	}

	async function fetchData<T extends TypeMap = any>(
		url: string | URL | Request,
		dedupe: boolean = true
	): Promise<Table<T>> {
		const table = await loadParquetFile<T>(url);

		// return table;
		if (!dedupe) {
			return table;
		}

		return deduplicateTable<T>(table);
	}

	function getTableGeometryBounds<T extends TypeMap = any>(
		table: Table<T> | null
	): [[number, number], [number, number]] {
		if (!table) {
			//return world bounds:
			return [
				[-180, -90],
				[180, 90]
			];
		}
		const latCol = table.getChild('Latitude');
		const lonCol = table.getChild('Longitude');

		if (!latCol || !lonCol) {
			throw new Error('Table must contain Latitude and Longitude columns');
		}

		let minLat = Infinity;
		let maxLat = -Infinity;
		let minLon = Infinity;
		let maxLon = -Infinity;
		for (let i = 0; i < table.numRows; i++) {
			const lat = latCol.get(i);
			const lon = lonCol.get(i);
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
		}

		return [
			[minLon, minLat],
			[maxLon, maxLat]
		];
	}

	function deduplicateTable<T extends TypeMap = any>(
		table: Table<T>,
		latitudeColumn: string = 'Latitude',
		longitudeColumn: string = 'Longitude'
	): Table<T> {
		console.log('Deduplicating table:', table.schema);

		const latCol = table.getChild(latitudeColumn);
		const lonCol = table.getChild(longitudeColumn);

		const seen = new Set<string>();
		const keepIndexes: number[] = [];

		console.log(`Deduplicating ${table.numRows} rows based on Latitude and Longitude`);

		// Efficiently iterate column-wise
		for (let i = 0; i < table.numRows; i++) {
			const lat: number = latCol?.get(i);
			const lon: number = lonCol?.get(i);

			// Optional: round coordinates to avoid floating-point noise
			const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

			if (!seen.has(key)) {
				seen.add(key);
				keepIndexes.push(i);
			}
		}

		console.log(`Deduplicated from ${table.numRows} to ${keepIndexes.length} rows`);

		// 3. Rebuild each column as a JS array of the kept values
		const dedupColumns: Record<string, any> = {};

		for (const field of table.schema.fields) {
			const name = field.name;
			const col = table.getChild(name)!;
			const values = keepIndexes.map((idx) => col.get(idx));
			// For every row‐index in keepIdx, pull out col.get(idx)
			dedupColumns[name] = vectorFromArray(values, field.type);
		}

		const deduped = tableFromArrays(dedupColumns);

		(deduped as any).schema = table.schema; // Preserve original schema

		// console.log('Deduplicated table schema:', deduped.schema);

		return (deduped as unknown as Table<T>); //ignore ts errors
	}

	$inspect('Beacon query: ', beaconQuery);
</script>

<svelte:head>
	<title>Map - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[
	{ label: 'Visualisations', href: '/visualisations' },
	{ label: 'Map viewer', href: '/visualisations/map-viewer' }
]} />

<div class="map-wrapper">
	<div id="deck-gl-map" class="map"></div>
	{#if loading}
		<div class="loading-overlay">
			<LoadingSpinner></LoadingSpinner>
			<h3>Loading...</h3>
		</div>
	{/if}

	{#if showQueryModal}
		<BeaconMapQueryModal bind:query={beaconQuery} onClose={() => (showQueryModal = false)} />
	{/if}
</div>

<style lang="scss">
	.map-wrapper {
		flex-grow: 1;
		position: relative;
		width: 100%;
		height: 100%;

		.map {
			z-index: 9;
			height: 100%;
			width: 100%;
			border-radius: 0 0  calc(0.625rem + 4px) calc(0.625rem + 4px);
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
