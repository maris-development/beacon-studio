<script lang="ts">
	/**
	 * GeospatialFilterModal — draw the area filter of a query in the builder.
	 *
	 * The user draws the area before the query runs, so the map holds no data.
	 * See `SpatialFilterMap`. The map viewer keeps its own tools, and refines the
	 * same area over the result.
	 *
	 * The filter tests the coordinate pair of the block. The modal shows that
	 * pair, and {@link CoordinateColumnsDialog} changes it, which a table with
	 * `x` and `y` columns needs.
	 *
	 * The modal edits a copy. Only Apply writes the area and the pair back.
	 */
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Button from '@/components/buttons/Button.svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import CoordinateColumnsDialog from '@/components/visualisation/CoordinateColumnsDialog.svelte';
	import MapDrawTools from '@/components/visualisation/MapDrawTools.svelte';
	import SpatialFilterMap from '@/components/visualisation/SpatialFilterMap.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import maplibregl from 'maplibre-gl';
	import { untrack } from 'svelte';
	import { Utils } from '@/utils';
	import type { SelectedField } from '@/query/draft';
	import {
		isUsableSelection,
		resolveCoordinateColumns,
		ringBounds,
		type CoordinatePair,
		type SpatialSelection
	} from '@/geo/spatial-selection';

	let {
		open = $bindable(false),
		selectedFields,
		selection = null,
		coordinateColumns = null,
		onApply
	}: {
		open?: boolean;
		/** The columns of the query. The filter can only test one of these. */
		selectedFields: SelectedField[];
		/** The area of the query, or null. The modal edits a copy of it. */
		selection?: SpatialSelection | null;
		/** The stored coordinate pair of the block, or null to detect it. */
		coordinateColumns?: CoordinatePair | null;
		/**
		 * Called with the new area, or with null to remove it, and with the pair
		 * to store.
		 */
		onApply: (selection: SpatialSelection | null, pair: CoordinatePair | null) => void;
	} = $props();

	/** The area the user edits. It reaches the builder on Apply. */
	let draft: SpatialSelection | null = $state(null);
	/** The pair from the dialog. Undefined while the user picked none. */
	let pickedPair: CoordinatePair | null | undefined = $state(undefined);
	/** True while the coordinate columns dialog is open. */
	let isColumnsOpen = $state(false);
	let map: maplibregl.Map | null = $state(null);
	/** True while a draw tool is armed. See {@link MapDrawTools}. */
	let isDrawing = $state(false);

	/** The columns the filter can test. The server tests query columns only. */
	const candidates = $derived(
		selectedFields.filter((field) => Utils.isNumericDataType(field.type)).map((field) => field.name)
	);

	/** The pair that Apply stores. */
	const storedPair = $derived(pickedPair === undefined ? coordinateColumns : pickedPair);

	/** The two columns the filter tests. The compile resolves the same pair. */
	const columns = $derived(
		resolveCoordinateColumns(
			storedPair,
			selectedFields.map((field) => field.name)
		)
	);

	/**
	 * The area to show at the start. A new area shows the whole world.
	 *
	 * The map reads this one time, at its creation. Therefore the value must be
	 * ready before the modal opens, and it cannot come from {@link reset}, which
	 * runs after the map exists.
	 */
	const initialBounds = $derived(selection ? ringBounds(selection.ring) : null);

	// Fill the copy at every open. The modal keeps no state between two visits,
	// so a cancel loses the edit.
	$effect(() => {
		if (!open) return;

		untrack(() => reset());
	});

	function reset(): void {
		if (selection) {
			draft = Utils.cloneObject(selection);
		} else {
			draft = null;
		}

		pickedPair = undefined;
	}

	const hasArea = $derived(isUsableSelection(draft));

	/** The reason that Apply must stay off, or null. */
	const applyReason = $derived.by(() => {
		if (candidates.length < 2) {
			return 'The query must select a latitude and a longitude column.';
		}

		if (!columns) {
			return 'Pick the latitude and the longitude column.';
		}

		if (!hasArea) {
			return 'Draw an area on the map.';
		}

		return null;
	});

	function apply(): void {
		if (applyReason || !draft) return;

		onApply(draft, storedPair ?? null);
		open = false;
	}

	function remove(): void {
		onApply(null, storedPair ?? null);
		open = false;
	}
</script>

{#if open}
	<!--
		An armed tool blocks the close. Escape cancels the shape of Terra Draw, and
		must not throw the whole edit away. The Cancel button below always works.
	-->
	<Modal
		title="Geospatial filter"
		width="90vw"
		canCloseModal={!isDrawing && !isColumnsOpen}
		onClose={() => (open = false)}
	>
		<div class="geo-filter-content">
			<p class="geo-filter-description">
				Draw an area, and pick the two columns that the filter tests.
			</p>

			{#if candidates.length < 2}
				<p class="geo-filter-warning" role="alert">
					<TriangleAlertIcon size={16} />
					This query selects less than two number columns. Add a latitude and a longitude column
					first.
				</p>
			{:else}
				<!-- The fields show the pair only. A click opens the dialog that changes it. -->
				<div class="geo-filter-columns">
					<div class="field">
						<Label size="sm" for="geoFilterLatitude">Latitude column</Label>
						<Input
							id="geoFilterLatitude"
							readonly
							value={columns?.latitude ?? ''}
							placeholder="Not found"
							title="Pick the coordinate columns"
							onclick={() => (isColumnsOpen = true)}
						/>
					</div>

					<div class="field">
						<Label size="sm" for="geoFilterLongitude">Longitude column</Label>
						<Input
							id="geoFilterLongitude"
							readonly
							value={columns?.longitude ?? ''}
							placeholder="Not found"
							title="Pick the coordinate columns"
							onclick={() => (isColumnsOpen = true)}
						/>
					</div>

					<Button
						variant="outline"
						size="icon"
						title="Pick the coordinate columns"
						aria-label="Pick the coordinate columns"
						onclick={() => (isColumnsOpen = true)}
					>
						<SettingsIcon />
					</Button>
				</div>
			{/if}

			<!--
				The draw tools come first, so a close destroys them before the map.
				Terra Draw detaches from a live map that way. The tools float over the
				map through `position: absolute`, so this order changes no layout.
			-->
			<div class="geo-filter-map">
				<div class="geo-filter-tools">
					<MapDrawTools
						{map}
						bind:selection={draft}
						showApply={false}
						onDrawingChange={(drawing) => (isDrawing = drawing)}
					/>
				</div>

				<SpatialFilterMap bind:map bounds={initialBounds} />
			</div>
		</div>

		<div slot="footer" class="geo-filter-footer">
			<span class="geo-filter-hint">{applyReason ?? ''}</span>

			{#if selection}
				<Button variant="outline" onclick={remove}>Remove filter</Button>
			{/if}

			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>

			<Button
				variant="default"
				title={applyReason ?? 'Filter the query on this area'}
				disabled={!!applyReason}
				onclick={apply}
			>
				Apply filter
			</Button>
		</div>
	</Modal>

	<!-- A sibling of the modal: the modal box is transformed, so it would clip a fixed child. -->
	<CoordinateColumnsDialog
		bind:open={isColumnsOpen}
		{candidates}
		pair={columns}
		onApply={(next) => (pickedPair = next)}
	/>
{/if}

<style lang="scss">
	// The map takes every pixel that the rows above it do not use. The height is
	// therefore set here, and not on the map itself.
	.geo-filter-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		height: 72vh;
	}

	.geo-filter-description {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
	}

	.geo-filter-columns {
		display: flex;
		flex-direction: row;
		flex-shrink: 0;
		align-items: flex-end;
		gap: 0.75rem;

		.field {
			display: flex;
			flex-direction: column;
			gap: 0.1875rem;
			flex: 1 1 0;
			min-width: 0;

			:global(input[readonly]) {
				cursor: pointer;
				background-color: var(--muted);
			}
		}
	}

	.geo-filter-warning {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.5rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--destructive);
		border-radius: var(--radius, 0.5rem);
		font-size: var(--font-size-sm);
		color: var(--destructive);

		:global(svg) {
			flex-shrink: 0;
		}
	}

	// The map and the draw tools share one cell, so the tools float over the map.
	.geo-filter-map {
		position: relative;
		flex: 1 1 auto;
		min-height: 12rem;

		.geo-filter-tools {
			position: absolute;
			left: 0;
			bottom: 0;
			z-index: 2;
		}
	}

	.geo-filter-footer {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.geo-filter-hint {
		flex-grow: 1;
		font-size: var(--font-size-sm);
		color: var(--muted-foreground);
		text-align: left;
	}
</style>
