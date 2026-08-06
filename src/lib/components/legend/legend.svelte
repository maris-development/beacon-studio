<script module>
	export const SCALE_DEFAULT_MIN = -1000;
	export const SCALE_DEFAULT_MAX = 1000;
	export const COLOR_SCALE_BLIPS = 100;
</script>

<script lang="ts">
	import { color, type RGBColor } from 'd3-color';
	import { interpolatePuOr } from 'd3-scale-chromatic';
	import { scaleSequential, type ScaleSequential } from 'd3-scale';
	import { Input } from '../ui/input';

	let {
		colorScaleMin = $bindable(SCALE_DEFAULT_MIN),
		colorScaleMax = $bindable(SCALE_DEFAULT_MAX),
		colorScale = $bindable(undefined)
	}: {
		colorScaleMin?: number;
		colorScaleMax?: number;
		colorScale?: ScaleSequential<string, never>;
	} = $props();

	/**
	 * The range that {@link colorScale} uses now. It is null until the effect
	 * below builds the first scale.
	 *
	 * The scale is a function, so no caller can persist it. A caller restores the
	 * range alone, and this component derives the scale again. Therefore the
	 * first build must always run, also when the range never changes after the
	 * mount. A seed of `[colorScaleMin, colorScaleMax]` would skip that build and
	 * leave the map with no scale.
	 */
	let currentDomain: [number, number] | null = null;
	let currentScaleColors: { color: RGBColor; value: number }[] = $state(getScaleColors());

	$effect(() => {
		if (colorScale) {
			currentScaleColors = getScaleColors();
		}
	});

	function getScaleColors(length = COLOR_SCALE_BLIPS) {
		if (!colorScale) {
			return [];
		}
		const colorScaleSize = colorScaleMax - colorScaleMin;
		const stepSize = colorScaleSize / (length - 1);

		const colors: { color: RGBColor; value: number }[] = [];
		for (let i = 0; i < length; i++) {
			const value = colorScaleMin + i * stepSize;
			colors.push({ color: color(colorScale(value)).rgb(), value: Math.round(value * 100) / 100 });
		}
		return colors;
	}

	$effect(() => {
		const hasNewDomain =
			!currentDomain || currentDomain[0] !== colorScaleMin || currentDomain[1] !== colorScaleMax;

		if (hasNewDomain) {
			currentDomain = [colorScaleMin, colorScaleMax];

			if (colorScaleMin < colorScaleMax) {
				colorScale = scaleSequential<string, never>(interpolatePuOr).domain([
					colorScaleMin,
					colorScaleMax
				]);
			} else {
				colorScale = scaleSequential<string, never>(interpolatePuOr).domain([
					colorScaleMax,
					colorScaleMin
				]);
			}
		}
	});
</script>

<div class="legend-range">
	<div class="input-wrapper">
		<Input
			type="number"
			name="colorScaleMin"
			id="colorScaleMin"
			min={SCALE_DEFAULT_MIN}
			max={SCALE_DEFAULT_MAX}
			bind:value={colorScaleMin}
		/>

		<Input
			type="number"
			name="colorScaleMax"
			id="colorScaleMax"
			min={SCALE_DEFAULT_MIN}
			max={SCALE_DEFAULT_MAX}
			bind:value={colorScaleMax}
		/>
	</div>

	<div class="colors" style="--blips: {COLOR_SCALE_BLIPS};">
		<div class="colors-fill" aria-hidden="true">
			{#each currentScaleColors as { color, value } (value)}
				<span class="color-fill" style="background-color: {color};"></span>
			{/each}
		</div>

		<div class="colors-hover">
			{#each currentScaleColors as { value } (value)}
				<span class="color-hit" data-value={value}></span>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	.legend-range {
		.input-wrapper {
			display: flex;
			gap: 1rem;
			margin-bottom: 1rem;
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
