<script lang="ts">
	/**
	 * SpatialFilterMap — a basemap with no data on it.
	 *
	 * The query builder draws an area before the query runs, so it has no result
	 * to paint. This component therefore holds a plain MapLibre map: no deck.gl
	 * overlay, no popup, no Arrow table. `MapDrawTools` takes the map instance and
	 * adds the draw tools to it.
	 *
	 * The map viewer keeps `MapViewController`, which owns the data layers.
	 */
	import maplibregl, { NavigationControl } from 'maplibre-gl';
	// Required. See the note in MapViewController.
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onDestroy } from 'svelte';
	import { getSettings } from '@/stores/settings';
	import type { Bounds } from '@/geo/spatial-selection';

	let {
		map = $bindable<maplibregl.Map | null>(null),
		bounds = null
	}: {
		/** The map, for the draw tools. It is null until the map exists. */
		map?: maplibregl.Map | null;
		/** The area to show at the start. Null shows the whole world. */
		bounds?: Bounds | null;
	} = $props();

	/** Padding around {@link bounds}, in pixels. */
	const FIT_PADDING = 40;

	let container: HTMLDivElement | null = $state(null);

	/**
	 * The map and its observer, as plain handles.
	 *
	 * The effect below reads them to build the map one time. A rune would make
	 * that read a dependency, and the write would run the effect again.
	 */
	let instance: maplibregl.Map | null = null;
	let observer: ResizeObserver | null = null;

	$effect(() => {
		const target = container;
		if (!target || instance) return;

		const created = new maplibregl.Map({
			container: target,
			style: getSettings().mapStyleUrl,
			center: [0.45, 51.47],
			zoom: 1,
			attributionControl: false
		});

		created.addControl(new NavigationControl());

		if (bounds) {
			created.fitBounds(
				[
					[bounds.minLon, bounds.minLat],
					[bounds.maxLon, bounds.maxLat]
				],
				{ padding: FIT_PADDING, animate: false }
			);
		}

		// A dialog animates its size, so the map first reads a container that is
		// smaller than the one it gets. The observer corrects the canvas at every
		// step. It lives until the component goes, and not until the next run.
		observer = new ResizeObserver(() => created.resize());
		observer.observe(target);

		instance = created;
		map = created;
	});

	onDestroy(() => {
		observer?.disconnect();
		observer = null;
		instance?.remove();
		instance = null;
		map = null;
	});
</script>

<div bind:this={container} class="spatial-filter-map"></div>

<style lang="scss">
	.spatial-filter-map {
		width: 100%;
		height: 100%;
		border-radius: 0.5rem;
		overflow: hidden;
	}
</style>
