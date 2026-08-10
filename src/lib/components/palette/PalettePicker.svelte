<!--
	The palette picker, shared by the chart explorer and the map viewer.

	A dropdown, not a list: the picker sits in a narrow panel and on top of the
	map, and 31 palettes stacked open would fill either one. Each entry still
	shows its gradient, because a palette name alone says nothing.

	The list splits in two. A gradient palette paints a value; a single colour
	paints every point the same, which is what a user wants when the colour
	carries no meaning.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import {
		getColormap,
		listColormaps,
		loadColormaps,
		samplePalette,
		type Colormap
	} from '@/colors/palettes';

	let {
		value,
		onSelect,
		reverse = false,
		showSolids = true,
		id = undefined
	}: {
		/** The id of the palette now in use. */
		value: string;
		onSelect: (palette: string) => void;
		/** Preview the palette the way it is drawn, turned around or not. */
		reverse?: boolean;
		showSolids?: boolean;
		/** DOM id of the trigger, so a `<label for>` can point at it. */
		id?: string;
	} = $props();

	let colormaps = $state<Colormap[]>([]);

	onMount(() => {
		loadColormaps().then(() => {
			colormaps = listColormaps();
		});
	});

	const gradientMaps = $derived(colormaps.filter((map) => !map.solid));
	const solidMaps = $derived(colormaps.filter((map) => map.solid));

	/** The label of the palette in use. Falls back to its id before the load. */
	const currentLabel = $derived(
		colormaps.find((map) => map.id === value)?.label ?? getColormap(value).label
	);

	/** A palette as a CSS gradient, for the preview strips. */
	function previewFor(id: string): string {
		return `linear-gradient(to right, ${samplePalette(id, 16, reverse).join(', ')})`;
	}

	/**
	 * The preview of the palette in use.
	 *
	 * `samplePalette` reads a module level registry, not a rune, so nothing tells
	 * svelte to draw this strip again once the colormap file lands. Until then
	 * every id returns the fallback palette, and the trigger would keep showing
	 * that gradient beside the correct name. Reading `colormaps` here ties the
	 * strip to the load.
	 *
	 * The entries in the list need no such tie: they are built from `colormaps`.
	 */
	const currentPreview = $derived.by(() => {
		void colormaps;
		return previewFor(value);
	});
</script>

<Select.Root type="single" {value} onValueChange={(next) => onSelect(next)}>
	<!--
		The swatch and the name go in one wrapper. The trigger spreads its children
		apart to push its chevron right, so two separate spans would leave the name
		stranded in the middle of a wide control.
	-->
	<Select.Trigger {id} class="palette-trigger">
		<span class="entry">
			<span class="swatch" style="background: {currentPreview};"></span>
			<span class="name">{currentLabel}</span>
		</span>
	</Select.Trigger>

	<Select.Content>
		<Select.Group>
			<Select.Label>Gradients</Select.Label>

			{#each gradientMaps as map (map.id)}
				<Select.Item value={map.id} label={map.label}>
					<span class="entry" title={map.description}>
						<span class="swatch" style="background: {previewFor(map.id)};"></span>
						<span class="name">{map.label}</span>
					</span>
				</Select.Item>
			{/each}
		</Select.Group>

		{#if showSolids && solidMaps.length > 0}
			<Select.Group>
				<Select.Label>Single colours</Select.Label>

				{#each solidMaps as map (map.id)}
					<Select.Item value={map.id} label={map.label}>
						<span class="entry" title={map.description}>
							<span class="swatch" style="background: {previewFor(map.id)};"></span>
							<span class="name">{map.label}</span>
						</span>
					</Select.Item>
				{/each}
			</Select.Group>
		{/if}
	</Select.Content>
</Select.Root>

<style lang="scss">
	// The trigger is a child component, so its own width rule needs :global. It
	// fills its container and no more, so the caller decides how wide the picker
	// is by sizing the box it sits in.
	:global(.palette-trigger) {
		width: 100%;
		min-width: 0;
	}

	.entry {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.swatch {
		flex-shrink: 0;
		width: 2.25rem;
		height: 0.75rem;
		border-radius: 0.1875rem;
		border: 1px solid rgba(0, 0, 0, 0.2);
	}

	.name {
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
