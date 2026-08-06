<script lang="ts">
	/**
	 * MapDrawTools — draw an area on the map, then apply it to the query.
	 *
	 * Three tools produce one closed ring:
	 *   Polygon        free shape
	 *   Box            axis aligned rectangle
	 *   Cross section  a line plus a width in kilometres
	 *
	 * Terra Draw draws the shape. After the shape is complete this component takes
	 * the coordinates, clears Terra Draw, and shows the result in its own MapLibre
	 * source. So a shape that comes back from a saved query looks the same as a
	 * shape that the user just drew.
	 *
	 * The preview uses MapLibre layers, not deck.gl layers. The map page replaces
	 * the whole deck.gl layer array on every data change, and would remove a
	 * deck.gl preview with it.
	 */
	import maplibregl from 'maplibre-gl';
	import { onDestroy } from 'svelte';
	import {
		TerraDraw,
		TerraDrawLineStringMode,
		TerraDrawPolygonMode,
		TerraDrawRectangleMode,
		TerraDrawRenderMode
	} from 'terra-draw';
	import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
	import PentagonIcon from '@lucide/svelte/icons/pentagon';
	import SquareIcon from '@lucide/svelte/icons/square';
	import SplineIcon from '@lucide/svelte/icons/spline';
	import FilterIcon from '@lucide/svelte/icons/filter';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import {
		defaultCrossSectionWidthKm,
		describeSelection,
		isUsableSelection,
		makeCrossSectionSelection,
		makeRingSelection,
		type LngLat,
		type SpatialSelection,
		type SpatialSelectionMode
	} from '@/geo/spatial-selection';

	let {
		map = null,
		selection = $bindable<SpatialSelection | null>(null),
		onApply,
		canApply = true,
		disabledReason = '',
		onDrawingChange
	}: {
		map: maplibregl.Map | null;
		selection?: SpatialSelection | null;
		/** Called when the user presses Apply filter. */
		onApply?: () => void;
		/** False while the query cannot take an area, for example without lat/lon. */
		canApply?: boolean;
		/** Shown as the button title when `canApply` is false. */
		disabledReason?: string;
		/** Reports a running draw action, so the page can stop the point picking. */
		onDrawingChange?: (drawing: boolean) => void;
	} = $props();

	/**
	 * The mode that Terra Draw parks in when no tool is active.
	 *
	 * Terra Draw has a built-in static mode, but `setMode` only accepts a mode
	 * that the constructor received, and the static mode is not exported. A
	 * render mode draws nothing and takes no input, so it does the same work.
	 */
	const IDLE_MODE = 'idle';

	const PREVIEW_SOURCE = 'spatial-selection-preview';
	const PREVIEW_FILL_LAYER = `${PREVIEW_SOURCE}-fill`;
	const PREVIEW_LINE_LAYER = `${PREVIEW_SOURCE}-line`;

	/** The Terra Draw mode name for each tool. */
	const DRAW_MODES: Record<SpatialSelectionMode, string> = {
		polygon: 'polygon',
		box: 'rectangle',
		'cross-section': 'linestring'
	};

	let draw: TerraDraw | null = null;
	/** True after Terra Draw runs. The tool buttons wait for it. */
	let ready = $state(false);
	let activeTool: SpatialSelectionMode | null = $state(null);
	let widthKm = $state(defaultCrossSectionWidthKm());

	const shapeStyle = {
		fillColor: '#2563eb' as const,
		fillOpacity: 0.15,
		outlineColor: '#2563eb' as const,
		outlineWidth: 2
	};

	$effect(() => {
		const target = map;
		if (!target || draw) return;

		// Terra Draw and the preview both add layers, so the style must be there.
		if (target.isStyleLoaded()) {
			initDraw(target);
		} else {
			target.once('load', () => initDraw(target));
		}
	});

	// Keep the preview in step with the selection, whoever set it: this component,
	// or the page after it loaded a saved query.
	$effect(() => {
		renderPreview(selection);
	});

	onDestroy(() => {
		draw?.stop();
		draw = null;
		ready = false;
	});

	function initDraw(target: maplibregl.Map) {
		draw = new TerraDraw({
			adapter: new TerraDrawMapLibreGLAdapter({ map: target }),
			modes: [
				new TerraDrawRenderMode({ modeName: IDLE_MODE, styles: {} }),
				new TerraDrawPolygonMode({ styles: shapeStyle }),
				new TerraDrawRectangleMode({ styles: shapeStyle }),
				new TerraDrawLineStringMode({
					styles: { lineStringColor: shapeStyle.outlineColor, lineStringWidth: 2 }
				})
			]
		});

		draw.start();
		draw.setMode(IDLE_MODE);
		draw.on('finish', onShapeFinished);

		ensurePreviewLayers(target);
		renderPreview(selection);
		ready = true;
	}

	function onShapeFinished(id: string | number) {
		if (!draw || !activeTool) return;

		const feature = draw.getSnapshotFeature(id);
		const geometry = feature?.geometry;

		if (geometry?.type === 'Polygon') {
			const ring = geometry.coordinates[0] as LngLat[];
			selection = makeRingSelection(activeTool === 'box' ? 'box' : 'polygon', ring);
		} else if (geometry?.type === 'LineString') {
			selection = makeCrossSectionSelection(geometry.coordinates as LngLat[], widthKm);
		}

		// The preview takes over from here, so one shape stays on the map.
		draw.clear();
		stopDrawing();
	}

	function selectTool(tool: SpatialSelectionMode) {
		if (!draw) return;

		if (activeTool === tool) {
			stopDrawing();
			return;
		}

		draw.clear();
		activeTool = tool;
		draw.setMode(DRAW_MODES[tool]);
		onDrawingChange?.(true);
	}

	function stopDrawing() {
		activeTool = null;
		draw?.setMode(IDLE_MODE);
		onDrawingChange?.(false);
	}

	function clearSelection() {
		draw?.clear();
		stopDrawing();
		selection = null;
	}

	/** A new width re-derives the band around the same centre line. */
	function applyWidth(value: number) {
		widthKm = value;

		if (selection?.mode === 'cross-section' && selection.line) {
			selection = makeCrossSectionSelection(selection.line, value);
		}
	}

	function ensurePreviewLayers(target: maplibregl.Map) {
		if (target.getSource(PREVIEW_SOURCE)) return;

		target.addSource(PREVIEW_SOURCE, {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		target.addLayer({
			id: PREVIEW_FILL_LAYER,
			type: 'fill',
			source: PREVIEW_SOURCE,
			paint: { 'fill-color': shapeStyle.fillColor, 'fill-opacity': shapeStyle.fillOpacity }
		});

		target.addLayer({
			id: PREVIEW_LINE_LAYER,
			type: 'line',
			source: PREVIEW_SOURCE,
			paint: { 'line-color': shapeStyle.outlineColor, 'line-width': shapeStyle.outlineWidth }
		});
	}

	function renderPreview(current: SpatialSelection | null) {
		const source = map?.getSource(PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
		if (!source) return;

		if (!isUsableSelection(current)) {
			source.setData({ type: 'FeatureCollection', features: [] });
			return;
		}

		source.setData({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: { type: 'Polygon', coordinates: [current!.ring] }
				}
			]
		});
	}

	const applyTitle = $derived(canApply ? 'Filter the query on this area' : disabledReason);
</script>

<div class="map-draw-tools">
	<div class="tool-row">
		<Button
			variant={activeTool === 'polygon' ? 'default' : 'outline'}
			title="Draw a polygon. Click each corner. Click the first point again to finish."
			disabled={!ready}
			onclick={() => selectTool('polygon')}
		>
			<PentagonIcon size={16} />
			Polygon
		</Button>
		<Button
			variant={activeTool === 'box' ? 'default' : 'outline'}
			title="Click one corner of the box, then the opposite corner."
			disabled={!ready}
			onclick={() => selectTool('box')}
		>
			<SquareIcon size={16} />
			Box
		</Button>
		<Button
			variant={activeTool === 'cross-section' ? 'default' : 'outline'}
			title="Draw a line. The line becomes a band with the width below."
			disabled={!ready}
			onclick={() => selectTool('cross-section')}
		>
			<SplineIcon size={16} />
			Cross section
		</Button>
	</div>

	{#if activeTool === 'cross-section' || selection?.mode === 'cross-section'}
		<label class="width-row">
			<span>Width</span>
			<Input
				type="number"
				min="0.1"
				step="0.1"
				value={widthKm}
				oninput={(event) => applyWidth(Number(event.currentTarget.value))}
			/>
			<span>km</span>
		</label>
	{/if}

	{#if selection}
		<p class="selection-label">{describeSelection(selection)}</p>
	{/if}

	<div class="tool-row">
		<Button
			variant="outline"
			title="Remove the area"
			disabled={!selection && !activeTool}
			onclick={clearSelection}
		>
			<Trash2Icon size={16} />
			Clear
		</Button>
		<Button
			variant="default"
			title={applyTitle}
			disabled={!canApply || !isUsableSelection(selection)}
			onclick={() => onApply?.()}
		>
			<FilterIcon size={16} />
			Apply filter
		</Button>
	</div>
</div>

<style lang="scss">
	.map-draw-tools {
		// The chrome copies the MapLibre control group, like .my-ctrl-group on the
		// map page. A scoped class of the page cannot reach this component.
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: fit-content;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
		background-color: white;
		padding: 0.5rem;
		margin: 0.5rem;

		.tool-row {
			display: flex;
			flex-direction: row;
			gap: 0.5rem;
		}

		.width-row {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.85rem;

			:global(input) {
				width: 6rem;
			}
		}

		.selection-label {
			font-size: 0.85rem;
			color: var(--muted-foreground);
		}
	}
</style>
