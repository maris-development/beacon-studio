<!--
	The colour legend of the map viewer: the palette, the range it spans, and a
	strip that reads the two together.

	The component holds no scale. It reports a palette id, a direction and a
	range, and the map builds its own colour table from those. A function cannot
	be persisted, so a stored view can only carry those four values anyway.

	The strip is built from the same `samplePalette` call as the colour bar of the
	chart explorer. Therefore a palette looks the same on both pages.
-->
<script lang="ts">
	import { Input } from '../ui/input';
	import { Label } from '../ui/label';
	import PalettePicker from '@/components/palette/PalettePicker.svelte';
	import { loadColormaps, samplePalette } from '@/colors/palettes';
	import { COLOR_SCALE_BLIPS, SCALE_DEFAULT_MAX, SCALE_DEFAULT_MIN } from './legend-defaults';
	import { onMount } from 'svelte';

	let {
		colorScaleMin = $bindable(SCALE_DEFAULT_MIN),
		colorScaleMax = $bindable(SCALE_DEFAULT_MAX),
		palette = $bindable(''),
		paletteReverse = $bindable(false)
	}: {
		colorScaleMin?: number;
		colorScaleMax?: number;
		palette?: string;
		paletteReverse?: boolean;
	} = $props();

	/**
	 * Flips once the colormap file has loaded. The strip below reads the palette
	 * synchronously, so it must be built again after the load.
	 */
	let palettesLoaded = $state(false);

	onMount(() => {
		loadColormaps().then(() => {
			palettesLoaded = true;
		});
	});

	/**
	 * The blocks of the strip, with the value each one stands for.
	 *
	 * A reversed palette is drawn reversed, so the strip matches the map. The
	 * values still run from the minimum to the maximum, left to right.
	 */
	const strip = $derived.by(() => {
		void palettesLoaded;

		const colors = samplePalette(palette, COLOR_SCALE_BLIPS, paletteReverse);
		const span = colorScaleMax - colorScaleMin;
		const step = span / (COLOR_SCALE_BLIPS - 1);

		return colors.map((color, index) => ({
			color,
			value: Math.round((colorScaleMin + index * step) * 100) / 100
		}));
	});
</script>

<div class="legend">
	<div class="field">
		<Label size="sm" for="legendPalette">Palette</Label>
		<PalettePicker
			id="legendPalette"
			value={palette}
			reverse={paletteReverse}
			onSelect={(id) => (palette = id)}
		/>
	</div>

	<div class="reverse">
		<input id="legendReverse" type="checkbox" bind:checked={paletteReverse} />
		<Label for="legendReverse">Reverse the palette</Label>
	</div>

	<div class="range">
		<div class="field">
			<Label size="sm" for="colorScaleMin">Minimum</Label>
			<Input
				type="number"
				step="any"
				name="colorScaleMin"
				id="colorScaleMin"
				bind:value={colorScaleMin}
				title="The value at the left of the scale"
			/>
		</div>

		<div class="field">
			<Label size="sm" for="colorScaleMax">Maximum</Label>
			<Input
				type="number"
				step="any"
				name="colorScaleMax"
				id="colorScaleMax"
				bind:value={colorScaleMax}
				title="The value at the right of the scale"
			/>
		</div>
	</div>

	<div class="colors" style="--blips: {COLOR_SCALE_BLIPS};">
		<div class="colors-fill" aria-hidden="true">
			{#each strip as block, index (index)}
				<span class="color-fill" style="background-color: {block.color};"></span>
			{/each}
		</div>

		<div class="colors-hover">
			{#each strip as block, index (index)}
				<span class="color-hit" data-value={block.value}></span>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	.legend {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;

		.field {
			display: flex;
			flex-direction: column;
			gap: 0.1875rem;
			min-width: 0;
		}

		.reverse {
			display: flex;
			align-items: center;
			gap: 0.375rem;
			font-size: 0.8125rem;
		}

		// Two equal columns that may shrink. A long value must not widen the box.
		.range {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 0.5rem;
		}

		.colors {
			position: relative;
			overflow: visible;
			height: 0.75rem;

			.colors-fill {
				display: grid;
				grid-template-columns: repeat(var(--blips, 100), minmax(0, 1fr));
				gap: 0;
				overflow: hidden;
				border-radius: 0.375rem;
				height: 100%;
			}

			.color-fill {
				height: 100%;
			}

			.colors-hover {
				position: absolute;
				inset: 0;
				display: grid;
				grid-template-columns: repeat(var(--blips, 100), minmax(0, 1fr));
				gap: 0;
			}

			.color-hit {
				position: relative;
				height: 100%;

				&:hover {
					&:after {
						content: attr(data-value);
						position: absolute;
						bottom: 125%;
						left: 50%;
						transform: translateX(-50%);
						background-color: #333;
						color: #fff;
						padding: 0.3rem 0.5rem;
						border-radius: 4px;
						white-space: nowrap;
						font-size: 0.75rem;
						pointer-events: none;
						opacity: 1;
						z-index: 3;
					}

					&::before {
						content: '';
						position: absolute;
						bottom: calc(100% + 0.5em);
						left: 50%;
						transform: translateX(-50%);
						border-width: 5px;
						border-style: solid;
						border-color: #333 transparent transparent transparent;
						z-index: 3;
					}
				}
			}
		}
	}
</style>
