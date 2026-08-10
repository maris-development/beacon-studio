/**
 * MapViewController — everything the map viewer does with MapLibre, deck.gl and
 * the query result. The page keeps only its markup, the query effect and the
 * bindings to this class.
 *
 * The class owns two kinds of state:
 *
 *   Plain fields   the map, the overlay, the deck.gl layer, the popup and the
 *                  display table. These are handles, not view data. Reactivity
 *                  on them would redraw the map for no reason.
 *   Rune fields    the row count, the column list, the chosen data column and
 *                  the colour scale. The page and the Legend bind to these.
 *
 * Notes that the code depends on:
 * - deck.gl writes an inline cursor on the MapLibre canvas on every frame, so
 *   CSS cannot change it. Use {@link setCursor}.
 * - `MapboxOverlay.setProps({ layers })` replaces the whole layer array. Any
 *   other overlay must therefore use MapLibre layers, not deck.gl layers.
 */
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoArrowScatterplotLayer } from '@geoarrow/deck.gl-layers';
import maplibregl, { NavigationControl } from 'maplibre-gl';
// Required. Without it the controls have no styling, the canvas stays in the
// normal flow (so the map grows on every resize), and the draw tools get the
// wrong pointer coordinates.
import 'maplibre-gl/dist/maplibre-gl.css';
import * as ApacheArrow from 'apache-arrow';
import { unmount } from 'svelte';
import { BeaconClient, type DatasetEntry } from '@/beacon-api/client';
import { queryStore } from '@/stores/query-store.svelte';
import type { CompiledQuery, Select as QuerySelect } from '@/beacon-api/types';
import { ApacheArrowUtils } from '@/arrow-utils';
import { getSettings } from '@/stores/settings';
import { addToast } from '@/stores/toasts';
import { Utils } from '@/utils';
import type { Rendered } from '@/util-types';
import MapPopupContent from '@/components/MapPopupContent.svelte';
import { SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from '@/components/legend/legend-defaults';
import { DEFAULT_PALETTE_ID, getRgbTable, loadColormaps, paletteIndex } from '@/colors/palettes';
import { detectCoordinateColumns } from '@/geo/coordinate-columns';
import type { MapCameraState, MapViewState } from '@/stores/stored-query';

/**
 * Decimals to group latitude and longitude by. The user sets the value on the
 * settings page. 4 = 11 m, 3 = 111 m, 2 = 1111 m, 1 = 11111 m, 0 = 111111 m.
 *
 * Read it at the point of use. A read at module load keeps the value of the
 * first page load for ever.
 */
function groupByDecimals(): number {
	return getSettings().mapGroupByDecimals;
}

/** Drop the float noise from a value that goes into a number field. */
function roundForDisplay(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Number(value.toPrecision(6));
}

export class MapViewController {
	/**
	 * The map handle is reactive, and only the handle. The draw tools take it as
	 * a prop, and mount before {@link init} runs. A plain field would keep them
	 * on the null of the first render for ever.
	 */
	private map = $state.raw<maplibregl.Map | null>(null);
	/** Non-reactive handles. */
	private overlay: MapboxOverlay | null = null;
	private layer: GeoArrowScatterplotLayer | null = null;
	private popup: maplibregl.Popup | null = null;
	private popupContent: Rendered = null;
	/** The display table: the result grouped by latitude and longitude. */
	private table: ApacheArrow.Table | null = null;
	/** The column that the current deck.gl layer paints. */
	private renderedColumn: string | undefined = undefined;
	/** False while a draw tool is active. See {@link setPicking}. */
	private pickingEnabled = true;

	/**
	 * The block that {@link viewStateFor} reports on. The page restores the view
	 * of a block, and writes the view of a block back. Both must name the same
	 * block. Without this id, the write of the old view could reach the new
	 * block, because the two effects of the page can run in any order.
	 */
	private viewBlockId: string | null = $state(null);
	/** The camera, followed with the map. Null before the first move. */
	private camera = $state.raw<MapCameraState | null>(null);
	/** A camera to apply as soon as the map exists. See {@link applyViewState}. */
	private pendingCamera: MapCameraState | null = null;
	/**
	 * True after a block restored its camera. The next run then keeps that
	 * camera, and does not fit the map to the data.
	 */
	private hasRestoredCamera = false;

	/** The raw query result. */
	entry = $state.raw<DatasetEntry | null>(null);
	isLoading = $state(true);
	availableColumnNames: string[] = $state([]);
	selectedDataColumnName: string | undefined = $state(undefined);

	colorScaleMin: number = $state(SCALE_DEFAULT_MIN);
	colorScaleMax: number = $state(SCALE_DEFAULT_MAX);
	/** The id of the colormap that paints the points. See `colors/palettes.ts`. */
	palette: string = $state(DEFAULT_PALETTE_ID);
	paletteReverse: boolean = $state(false);

	/**
	 * The colours of {@link palette}, as bytes. `getFillColor` runs once per row
	 * on every redraw, so it reads this table instead of building a colour.
	 *
	 * It is a plain field, not a rune: the layer is rebuilt through
	 * `updateTriggers`, and reactivity here would redraw the map twice.
	 */
	private rgbTable: Uint8Array = getRgbTable(DEFAULT_PALETTE_ID);

	/** Column names of the current query. Empty until a query runs. */
	latitudeColumnName = $state('latitude');
	longitudeColumnName = $state('longitude');

	readonly rowCount = $derived(this.entry?.rowCount ?? 0);
	/** The cache key of the current result. Changes with every new result. */
	readonly datasetKey = $derived(this.entry?.key ?? null);
	readonly durationMs = $derived(this.entry?.duration ?? 0);
	/** True when the query selects both a latitude and a longitude column. */
	readonly hasCoordinates = $derived.by(() => {
		const { latitude, longitude } = detectCoordinateColumns(this.availableColumnNames);
		return !!latitude && !!longitude;
	});

	constructor(
		private markRunning: (running: boolean) => void = () => {},
		private markRun: (rows: number) => void = () => {}
	) {}

	// ---------------------------------------------------------------- map setup

	init(container: HTMLDivElement): void {
		const map = new maplibregl.Map({
			container,
			style: getSettings().mapStyleUrl,
			center: [0.45, 51.47],
			zoom: 1,
			bearing: 0,
			pitch: 0
		});

		map.addControl(new NavigationControl());

		// Follow the camera, so the page can persist it. `moveend` fires one time
		// at the end of a pan, a zoom or a `fitBounds`, and not on every frame.
		map.on('moveend', () => this.readCamera(map));
		// A GlobeControl does not work with the deck.gl overlay.

		this.overlay = new MapboxOverlay({
			interleaved: true,
			layers: [],
			// deck.gl writes an inline cursor on the MapLibre canvas on every frame,
			// so CSS cannot win. A crosshair helps the user to select points.
			getCursor: () => 'crosshair'
		});

		map.addControl(this.overlay);

		this.popup = new maplibregl.Popup({
			closeButton: true,
			closeOnClick: false,
			className: 'map-popup',
			maxWidth: 'none'
		});

		// Publish the handle last, so a reader never sees a half built map.
		this.map = map;

		// A block may have restored its camera before the map existed.
		this.applyCamera();

		// The real palette arrives after the colormap file. Repaint then.
		loadColormaps().then(() => this.redrawColors());
	}

	destroy(): void {
		this.destroyPopupContent();
		this.map?.remove();
		this.map = null;
		this.overlay = null;
		this.layer = null;
	}

	/** The map instance, for the draw tools. Null before {@link init}. */
	get mapInstance(): maplibregl.Map | null {
		return this.map;
	}

	/**
	 * Stop the point picking while the user draws. Without this a click on the
	 * map opens the point popup instead of a vertex of the new shape.
	 */
	setPicking(enabled: boolean): void {
		if (this.pickingEnabled === enabled) return;
		this.pickingEnabled = enabled;

		if (!this.layer) return;
		this.showDataColumn(true, false);
	}

	// --------------------------------------------------------------- view state

	/**
	 * Restore the display state of a block: the painted column, the range of the
	 * legend and the camera.
	 *
	 * Call this method at every change of block, also for a block with no stored
	 * view. That block gets the defaults back, and does not keep the column of
	 * the block before it.
	 */
	applyViewState(blockId: string | null, view: MapViewState | null | undefined): void {
		this.viewBlockId = blockId;

		this.selectedDataColumnName = view?.dataColumn ?? undefined;
		this.colorScaleMin = view?.colorScaleMin ?? SCALE_DEFAULT_MIN;
		this.colorScaleMax = view?.colorScaleMax ?? SCALE_DEFAULT_MAX;
		// An unknown palette id is not repaired here. `getRgbTable` falls back to
		// the default for it, so an old record still paints.
		this.palette = view?.palette ?? DEFAULT_PALETTE_ID;
		this.paletteReverse = view?.paletteReverse === true;
		this.rgbTable = getRgbTable(this.palette);

		// The layer of the block before this one painted another column. Clear the
		// mark, so the next `showDataColumn` builds a new layer.
		this.renderedColumn = undefined;

		this.camera = view?.camera ?? null;
		this.pendingCamera = view?.camera ?? null;
		this.hasRestoredCamera = !!view?.camera;
		this.applyCamera();
	}

	/**
	 * The display state of a block, for the page to persist. Returns null when
	 * the map does not hold the state of that block now.
	 *
	 * The page reads this method from an effect, and writes the result to the
	 * active block. The two effects of the page can run in any order. Without the
	 * id test, a read before {@link applyViewState} would write the view of the
	 * block before this one onto the new block.
	 */
	viewStateFor(blockId: string | null): MapViewState | null {
		// Read every rune first. Therefore the effect of the caller depends on all
		// of them, also on a call that returns null.
		const state: MapViewState = {
			dataColumn: this.selectedDataColumnName ?? null,
			colorScaleMin: this.colorScaleMin,
			colorScaleMax: this.colorScaleMax,
			palette: this.palette,
			paletteReverse: this.paletteReverse,
			camera: this.camera
		};

		if (!blockId || blockId !== this.viewBlockId) return null;
		return state;
	}

	/** Copy the camera of the map into {@link camera}. */
	private readCamera(map: maplibregl.Map): void {
		const center = map.getCenter();
		this.camera = {
			center: [center.lng, center.lat],
			zoom: map.getZoom(),
			bearing: map.getBearing(),
			pitch: map.getPitch()
		};
	}

	/**
	 * Move the map to {@link pendingCamera}. The method does nothing before
	 * {@link init} builds the map. `init` calls it again at that moment.
	 */
	private applyCamera(): void {
		const camera = this.pendingCamera;
		if (!camera || !this.map) return;
		this.pendingCamera = null;
		this.map.jumpTo(camera);
	}

	// -------------------------------------------------------------- query cycle

	/**
	 * Run a query and show it. `keepCamera` is true for a re-run of the same
	 * block, for example after the user applied an area filter. The camera then
	 * stays where the user left it.
	 */
	async runAndShowQuery(query: CompiledQuery, blockId: string, keepCamera: boolean): Promise<void> {
		this.isLoading = true;
		this.markRunning(true);

		try {
			this.deriveColumnNames(query);

			this.entry = await BeaconClient.ensureQuery(query, blockId);
			this.markRun(this.entry.rowCount);

			if (this.entry.rowCount === 0) {
				this.isLoading = false;
				addToast({ type: 'info', message: 'Query executed successfully but returned no data.' });
				return;
			}

			await this.prepareTable(keepCamera);
		} catch (error) {
			console.error('Failed to execute query:', error);
			this.isLoading = false;
			this.markRunning(false);
			addToast({
				type: 'error',
				message: `Failed to execute query: ${(error as Error).message}`
			});
		}
	}

	/**
	 * Show the cached result of a query at once, before the run starts. The map
	 * stays empty when the cache has no result for this key.
	 */
	showQueryFromCache(datasetKey: string | null): void {
		this.entry = (datasetKey && BeaconClient.peekQueryByKey(datasetKey)) || null;
	}

	/** Remove the current result from the map. */
	clearQueryResult(): void {
		this.entry = null;
		this.table = null;
		this.isLoading = false;
	}

	private deriveColumnNames(query: CompiledQuery): void {
		this.availableColumnNames = query.query_parameters.map((param: QuerySelect) => {
			return param.alias ?? param.column;
		});

		const { latitude, longitude } = detectCoordinateColumns(this.availableColumnNames);

		if (!latitude || !longitude) {
			throw new Error(
				'Query must contain Latitude and Longitude columns (or columns containing these words (case insensitive))'
			);
		}

		this.latitudeColumnName = latitude.name;
		this.longitudeColumnName = longitude.name;
	}

	private async prepareTable(keepCamera: boolean): Promise<void> {
		if (!this.entry) {
			addToast({ type: 'error', message: 'No table data available to display.' });
			return;
		}

		try {
			this.table = await queryStore.mapTable(
				this.entry,
				this.latitudeColumnName,
				this.longitudeColumnName,
				groupByDecimals()
			);
		} catch (error) {
			addToast({
				type: 'error',
				message: `Failed to group dataset by lat/lon: ${(error as Error).message}`
			});
			return;
		}

		this.isLoading = false;

		// A block with a stored camera keeps it. Only a block with no stored
		// camera gets a map that fits the data.
		const fitCamera = !keepCamera && !this.hasRestoredCamera;
		this.hasRestoredCamera = false;

		// Keep the column that the user picked, if the new result still has it.
		// The user must not choose it again after every filter change.
		if (this.selectedDataColumnName) {
			if (this.availableColumnNames.includes(this.selectedDataColumnName)) {
				await this.showDataColumn(true, fitCamera);
				return;
			}

			this.selectedDataColumnName = undefined;
			this.renderedColumn = undefined;
		}

		addToast({ type: 'info', message: 'Select a data column to display on the map.' });
	}

	/**
	 * Count the rows of the current result inside a drawn area.
	 *
	 * The count comes from `entry.table`, the full result, not from the display
	 * table. The display table holds one row per grouped coordinate, so it would
	 * report fewer features than the filter selects.
	 *
	 * Returns null when no result is loaded. The work runs in the Arrow worker.
	 */
	async countFeaturesInRing(ring: [number, number][]): Promise<number | null> {
		if (!this.entry || ring.length < 4) return null;

		return queryStore.countInRing(
			this.entry,
			ring,
			this.latitudeColumnName,
			this.longitudeColumnName
		);
	}

	// ------------------------------------------------------------ deck.gl layer

	/**
	 * Paint the selected data column. The method does nothing when the column did
	 * not change, unless `force` is true.
	 */
	async showDataColumn(force = false, fitCamera = true): Promise<void> {
		if (!this.selectedDataColumnName || !this.table) return;

		if (this.selectedDataColumnName === this.renderedColumn && !force) return;
		this.renderedColumn = this.selectedDataColumnName;

		this.isLoading = true;

		this.layer = await this.createLayer();
		this.overlay?.setProps({ layers: [this.layer] });

		if (fitCamera) {
			this.fitToData();
		}

		this.isLoading = false;
	}

	fitToData(): void {
		if (!this.map || !this.table) return;

		const bounds = ApacheArrowUtils.getTableGeometryBounds(
			this.table,
			this.latitudeColumnName,
			this.longitudeColumnName
		);

		this.map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 50, right: 50 } });
	}

	private async createLayer() {
		if (!this.table) {
			throw new Error('Table is not loaded');
		}

		if (
			this.entry &&
			this.selectedDataColumnName &&
			this.colorScaleMin === SCALE_DEFAULT_MIN &&
			this.colorScaleMax === SCALE_DEFAULT_MAX
		) {
			const minMax = await queryStore.minMax(this.entry, this.selectedDataColumnName);

			// Round the range for the legend inputs. A float column gives values
			// like 27.856000900268555, which fills the field and tells the user
			// nothing. Six digits keep every range this app shows apart.
			this.colorScaleMin = roundForDisplay(minMax.min);
			this.colorScaleMax = roundForDisplay(minMax.max);
		}

		return new GeoArrowScatterplotLayer({
			id: 'geoarrow-points',
			data: this.table,
			opacity: 1,
			radiusMinPixels: 3,
			radiusUnits: 'meters',
			getFillColor: (d) => this.getFillColor(d),
			onClick: (info) => this.onPointClick(info),
			getRadius: 100,
			radiusMaxPixels: 20,
			pickable: this.pickingEnabled,
			autoHighlight: this.pickingEnabled,
			highlightColor: [255, 255, 0, 128],
			updateTriggers: {
				getFillColor: [
					this.palette,
					this.paletteReverse,
					this.colorScaleMin,
					this.colorScaleMax,
					this.selectedDataColumnName
				]
			}
		});
	}

	/**
	 * Redraw after the Legend changed the palette or the range.
	 *
	 * The colour table is rebuilt here, and not inside `getFillColor`, so the
	 * lookup per row stays a plain array read.
	 */
	redrawColors(): void {
		this.rgbTable = getRgbTable(this.palette);

		if (!this.layer) return;
		this.layer.setNeedsRedraw();
		this.showDataColumn(true, false);
	}

	private getFillColor(d: {
		data: { data: { get: (index: number) => Record<string, unknown> | null } };
		index: number;
	}): [number, number, number, number] {
		const row = d.data.data.get(d.index);
		if (!row) return [0, 0, 0, 0];

		const value = row[this.selectedDataColumnName!];
		if (typeof value !== 'number' || isNaN(value)) return [0, 0, 0, 0];

		const offset =
			paletteIndex(value, this.colorScaleMin, this.colorScaleMax, this.paletteReverse) * 3;

		return [this.rgbTable[offset], this.rgbTable[offset + 1], this.rgbTable[offset + 2], 192];
	}

	// -------------------------------------------------------------------- popup

	private onPointClick(info: {
		object?: { toArray: () => unknown[] };
		coordinate?: number[];
	}): void {
		if (!this.entry || !this.popup || !this.map || !info.object || !info.coordinate) return;

		this.destroyPopupContent();
		this.popup.remove();

		this.popupContent = Utils.renderComponent(MapPopupContent, {
			rowData: info.object.toArray(),
			entry: this.entry,
			latitudeColumnName: this.latitudeColumnName,
			longitudeColumnName: this.longitudeColumnName,
			groupByDecimals: groupByDecimals()
		});

		this.popup.setDOMContent(this.popupContent.element);
		this.popup.setLngLat(info.coordinate as [number, number]);
		this.popup.addTo(this.map);

		this.popup.off('close', this.destroyPopupContent);
		this.popup.on('close', this.destroyPopupContent);
	}

	private destroyPopupContent = (): void => {
		if (!this.popupContent) return;
		unmount(this.popupContent.handle);
		this.popupContent = null;
	};
}
