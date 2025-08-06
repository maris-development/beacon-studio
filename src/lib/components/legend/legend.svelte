<script module>
	export const SCALE_DEFAULT_MIN = -1000;
	export const SCALE_DEFAULT_MAX = 1000;
</script>

<script lang="ts">
	import { interpolatePuOr } from 'd3-scale-chromatic';
	import { scaleSequential, type ScaleSequential } from 'd3-scale';

	let {
		colorScaleMin = $bindable(SCALE_DEFAULT_MIN),
		colorScaleMax = $bindable(SCALE_DEFAULT_MAX),
        colorScale = $bindable(scaleSequential(interpolatePuOr).domain([-1000, 1000]))
	}: {
		colorScaleMin?: number;
		colorScaleMax?: number;
        colorScale?: ScaleSequential<number, never>;
	} = $props();

    let currentDomain: [number, number] = [colorScaleMin, colorScaleMax];

    $effect(() => {
        if(currentDomain[0] !== colorScaleMin || currentDomain[1] !== colorScaleMax) {
            currentDomain = [colorScaleMin, colorScaleMax];

            if(colorScaleMin < colorScaleMax){
                colorScale = scaleSequential(interpolatePuOr).domain([colorScaleMin, colorScaleMax]);
            } else {
                colorScale = scaleSequential(interpolatePuOr).domain([colorScaleMax, colorScaleMin]);
            }
        }
    })
</script>

<div class="legend-range">
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


<style lang="scss">
    .legend-range {
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


</style>