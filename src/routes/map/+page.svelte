<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import wasmInit, { readParquet } from 'parquet-wasm';
	import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
	import type { PickingInfo } from '@deck.gl/core';
	import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
	import * as arrow from 'apache-arrow';
	import {
		Table,
		tableFromIPC,
		Schema,
		Vector,
		makeVector,
		RecordBatch,
		vectorFromArray,
		type TypeMap,
		tableFromArrays,

		makeTable

	} from 'apache-arrow';

	import * as d3 from 'd3';
	import { interpolateViridis, interpolateBrBG } from 'd3-scale-chromatic';
	import { scaleSequential, scaleOrdinal } from 'd3-scale';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	const GEOARROW_POINT_DATA = '/rws4.parquet';
	const PARQUET_WASM_URL = '/parquet_wasm_bg.wasm';

	let map;
	let table: Table | null = null;
	let onClickInfo: PickingInfo | null = null;
	let onClickClose: boolean = false;

	const colorScale = scaleSequential(interpolateBrBG).domain([40, -5]);

	onMount(async () => {
		if (!browser) return;

		await wasmInit(PARQUET_WASM_URL);

		table = await fetchData(new Request(PARQUET_WASM_URL), true);

		map = new maplibregl.Map({
			container: 'deck-gl-map',
			style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
			center: [0.45, 51.47],
			zoom: 4,
			bearing: 0,
			pitch: 0
		});

		const deckOverlay = new DeckOverlay({
			interleaved: true,
			layers: [
				new GeoArrowScatterplotLayer({
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

						const value = row['Waarde'];
						// Check if value if a number
						if (typeof value !== 'number' || isNaN(value)) {
							return [0, 0, 0, 0]; // Default to transparent black if value is not a number
						}
						const color = d3.color(colorScale(value))?.rgb(); // returns RGB object
						// console.log('Color for value', value, ':', color);
						if (!color) {
							return [0, 0, 0, 0]; // Default to black if color is not defined
						}
						return [color.r, color.g, color.b, 255];
					},
					getRadius: 50000,
					radiusMaxPixels: 10,
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
					}
				})
			]
		});

		map.addControl(deckOverlay);
		map.addControl(new maplibregl.NavigationControl());
	});

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
			dedupColumns[name] = (vectorFromArray(values, field.type))
		}

		const deduped = tableFromArrays(dedupColumns);

		(deduped as any).schema = table.schema; // Preserve original schema

		// console.log('Deduplicated table schema:', deduped.schema);

		
		return deduped; //ignore ts errors

	}
</script>

<svelte:head>
	<title>Map - Beacon Studio</title>
</svelte:head>

<div id="deck-gl-map"></div>

<style>
	#deck-gl-map {
		flex-grow: 1;
	}
</style>
