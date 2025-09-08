<script module>
	export const SCALE_DEFAULT_MIN = -1000;
	export const SCALE_DEFAULT_MAX = 1000;
	export const COLOR_SCALE_BLIPS = 60;
</script>

<script lang="ts">
	import { color, type RGBColor } from 'd3-color';
	import { interpolatePuOr } from 'd3-scale-chromatic';
	import { scaleSequential, type ScaleSequential } from 'd3-scale';

	let {
		colorScaleMin = $bindable(SCALE_DEFAULT_MIN),
		colorScaleMax = $bindable(SCALE_DEFAULT_MAX),
		colorScale = $bindable(undefined)
	}: {
		colorScaleMin?: number;
		colorScaleMax?: number;
		colorScale?: ScaleSequential<string, never>;
	} = $props();

	let currentDomain: [number, number] = [colorScaleMin, colorScaleMax];
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
		if (currentDomain[0] !== colorScaleMin || currentDomain[1] !== colorScaleMax) {
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
		<input
			type="number"
			name="colorScaleMin"
			id="colorScaleMin"
			min={SCALE_DEFAULT_MIN}
			max={SCALE_DEFAULT_MAX}
			bind:value={colorScaleMin}
		/>

		<input
			type="number"
			name="colorScaleMax"
			id="colorScaleMax"
			min={SCALE_DEFAULT_MIN}
			max={SCALE_DEFAULT_MAX}
			bind:value={colorScaleMax}
		/>
	</div>

	<div class="colors" style="--blips: {COLOR_SCALE_BLIPS};">
		{#each currentScaleColors as { color, value }}
			<span class="color" style="background-color: {color};" data-value={value}></span>
		{/each}
	</div>
</div>

<style lang="scss">
	.legend-range {
		.input-wrapper {
			display: flex;
			gap: 1rem;
			margin-bottom: 1rem;

			input {
				width: 100px;
				padding: 0.5rem;
				border: 1px solid #ccc;
				border-radius: 4px;
				font-size: 1rem;
			}
		}

		.colors {
			display: flex;
			flex-direction: row;
			gap: 0;

			.color {
				width: calc(100% / var(--blips, 100));
				height: 1em;
				position: relative;
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

					&:before {
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
