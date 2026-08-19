<!--
	The configuration panel of the chart explorer. It sits left of the plot and
	holds four numbered steps:

	  1. Plot type   what kind of plot to draw.
	  2. Bind data   which column feeds each axis.
	  3. Properties  everything about how it looks.
	  4. Contours    the lines over the points.

	**The panel edits a draft, and nothing reaches the chart until Apply.**

	Every control writes into a local draft, which is cheap: the plot draws again
	only when the user clicks Apply. A dense result of several hundred thousand
	rows takes a moment to draw, so the draft lets the user set up a plot without
	paying that cost on each edit, and pay it once when they choose to.

	The draft follows the plot while it is clean. Therefore a switch to another
	plot, and a column that a new result no longer has, both reach the panel. A
	dirty draft is never overwritten: the edits of the user win.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import PlotSection from './PlotSection.svelte';
	import PlotSlider from './PlotSlider.svelte';
	import PlotTypeCards from './PlotTypeCards.svelte';
	import PalettePicker from '@/components/palette/PalettePicker.svelte';
	import { addToast } from '@/stores/toasts';
	import type { ChartExplorerController } from './ChartExplorerController.svelte';
	import {
		axisTitle,
		makeAxisConfig,
		PLOT_TYPES,
		usesXColumn,
		usesYColumn,
		usesZColumn,
		type PlotAxisConfig,
		type PlotConfig,
		type PlotContourConfig,
		type PlotHistogramConfig,
		type PlotLineConfig,
		type PlotStyleConfig,
		type PlotType,
		type ColorScale
	} from '@/plots/plot-config';
	import { CROSS_SECTION_AXIS_LABEL, HISTOGRAM_AXIS_LABEL } from '@/plots/plot-data';
	import { Utils } from '@/utils';

	let { controller }: { controller: ChartExplorerController } = $props();

	/** Which axis a control edits. */
	type AxisName = 'x' | 'y' | 'z';

	// -- the draft -----------------------------------------------------------

	/** The plot as the user is editing it. Null while no plot is selected. */
	let draft = $state<PlotConfig | null>(null);
	let isBindingOpen = $state(false);

	/** The plot that {@link draft} was taken from. */
	let draftPlotId: string | null = null;

	/**
	 * True once the user has touched a control.
	 *
	 * This is not the same question as "does the draft differ from the plot". The
	 * plot changes on its own too: a new result seeds an empty axis and drops a
	 * column that has gone. Comparing the two would read that as an edit by the
	 * user, and the panel would stop following the plot it is meant to show.
	 */
	let userEdited = $state(false);

	const applied = $derived(controller.activePlot);

	/** True when the draft holds a change that the chart does not show yet. */
	const isDirty = $derived(userEdited && JSON.stringify(draft) !== JSON.stringify(applied));

	$effect(() => {
		const plot = applied;

		untrack(() => {
			if (!plot) {
				draft = null;
				draftPlotId = null;
				userEdited = false;
				return;
			}

			// Another plot always replaces the draft. Its edits belonged to a plot
			// the user has left.
			if (plot.id !== draftPlotId) {
				draftPlotId = plot.id;
				userEdited = false;
				draft = Utils.cloneObject(plot);
				return;
			}

			// The same plot changed under the panel. Follow it, unless the user has
			// edits of their own: theirs win.
			if (!userEdited) draft = Utils.cloneObject(plot);
		});
	});

	/** Send the draft to the chart. This is the one expensive click of the panel. */
	function apply() {
		if (!draft) return;
		userEdited = false;
		controller.updatePlot(Utils.cloneObject(draft));
	}

	/** Throw the edits away and show what the chart is drawing now. */
	function revert() {
		if (!applied) return;
		userEdited = false;
		draft = Utils.cloneObject(applied);
	}

	// -- draft edits ---------------------------------------------------------

	function patchDraft(patch: Partial<PlotConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, ...patch };
	}

	function patchStyle(patch: Partial<PlotStyleConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, style: { ...draft.style, ...patch } };
	}

	function patchContour(patch: Partial<PlotContourConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, contour: { ...draft.contour, ...patch } };
	}

	function patchLine(patch: Partial<PlotLineConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, line: { ...draft.line, ...patch } };
	}

	function patchHistogram(patch: Partial<PlotHistogramConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, histogram: { ...draft.histogram, ...patch } };
	}

	function patchAxis(axis: AxisName, patch: Partial<PlotAxisConfig>) {
		if (!draft) return;
		userEdited = true;

		if (axis === 'z') {
			draft = { ...draft, z: { ...(draft.z ?? makeAxisConfig()), ...patch } };
			return;
		}

		draft = { ...draft, [axis]: { ...draft[axis], ...patch } };
	}

	/**
	 * Switch the type, and fit the axis columns to what the new type reads.
	 *
	 * A cross section takes its X values from the drawn line, so the column of the
	 * X axis has no meaning there. A switch to a type that needs one again fills
	 * it, because the first column is a better start than an empty selector.
	 */
	function setPlotType(type: PlotType) {
		isBindingOpen = true;
		if (!draft || draft.type === type) return;
		userEdited = true;

		const names = controller.columns;
		let next: PlotConfig = { ...draft, type };

		if (!usesXColumn(type)) {
			next = { ...next, x: { ...next.x, column: null } };
		} else if (!next.x.column) {
			next = { ...next, x: { ...next.x, column: names[0]?.name ?? null } };
		}

		if (usesYColumn(type) && !next.y.column) {
			next = { ...next, y: { ...next.y, column: names[1]?.name ?? names[0]?.name ?? null } };
		}

		draft = next;
	}

	/** The label over the X column selector. A histogram counts one column. */
	const xFieldLabel = $derived(draft?.type === 'histogram' ? 'Value column' : 'X axis');

	/**
	 * The value of the "no colour column" entry. An empty string means "nothing
	 * selected" to the select component, which is a different state, so the entry
	 * needs a value of its own.
	 */
	const NO_COLUMN = '__none__';

	function setAxisColumn(axis: AxisName, value: string) {
		if (!draft) return;
		userEdited = true;

		if (axis === 'z' && (value === NO_COLUMN || !value)) {
			draft = { ...draft, z: null };
			return;
		}

		patchAxis(axis, { column: value });
	}

	function setGroupColumn(value: string) {
		if (value === NO_COLUMN || !value) {
			patchLine({ groupColumn: null });
			return;
		}

		patchLine({ groupColumn: value });
	}

	function setColorScale(scale: ColorScale) {
		if (!draft?.z) return;

		const min = draft.z.min ?? controller.series?.zRange?.min;
		const max = draft.z.max ?? controller.series?.zRange?.max;
		if (
			scale === 'logarithmic' &&
			(min === undefined || max === undefined || min <= 0 || max <= 0 || max <= min)
		) {
			addToast({
				message: 'Logarithmic scale needs a positive minimum and maximum.',
				type: 'error'
			});
		}

		patchAxis('z', { scale });
	}

	// -- value helpers -------------------------------------------------------

	/** An empty field means "auto", which the model stores as null. */
	function numberOrNull(value: string): number | null {
		if (value.trim() === '') return null;

		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return null;
		return parsed;
	}

	/** An empty field means "use the column name", which the model stores as null. */
	function textOrNull(value: string): string | null {
		if (value.trim() === '') return null;
		return value;
	}

	// -- summaries -----------------------------------------------------------

	const typeSummary = $derived(
		PLOT_TYPES.find((type) => type.id === draft?.type)?.label ?? 'Scatter plot'
	);

	const bindingSummary = $derived.by(() => {
		if (!draft) return '';

		let x = draft.x.column ?? 'none';
		if (draft.type === 'cross-section') x = 'distance';

		if (draft.type === 'histogram') {
			return `${x} · ${draft.histogram.binCount} bins`;
		}

		let summary = `${x} × ${draft.y.column ?? 'none'}`;

		if (draft.type === 'line') {
			if (draft.line.groupColumn) summary += ` · by ${draft.line.groupColumn}`;
			return summary;
		}

		if (draft.z?.column) summary += ` · ${draft.z.column}`;
		return summary;
	});

	const styleSummary = $derived(
		`${draft?.style.palette ?? ''} · ${draft?.style.pointRadius ?? 0}px`
	);

	const contourSummary = $derived.by(() => {
		if (draft && !usesZColumn(draft.type)) return 'Not for this plot type';
		if (!draft?.z?.column) return 'Needs a colour column';
		if (!draft.contour.enabled) return 'Off';
		return `${draft.contour.levelCount} levels`;
	});

	const colorScaleError = $derived.by(() => {
		if (!draft?.z || draft.z.scale !== 'logarithmic') return '';
		const min = draft.z.min ?? controller.series?.zRange?.min;
		const max = draft.z.max ?? controller.series?.zRange?.max;
		if (min === undefined || max === undefined) return 'Logarithmic scale needs positive data.';
		if (!(min > 0) || !(max > 0) || !(max > min)) {
			return 'Logarithmic scale needs a positive minimum and maximum.';
		}
		return '';
	});
</script>

{#if draft}
	<aside class="plot-config-panel">
		<PlotSection step={1} title="Plot type" summary={typeSummary}>
			<PlotTypeCards
				value={draft.type}
				crossSectionAvailable={controller.hasCrossSection}
				onSelect={(type) => setPlotType(type)}
			/>
		</PlotSection>

		<PlotSection step={2} title="Bind data" summary={bindingSummary} bind:open={isBindingOpen}>
			<div class="field">
				<Label for="plotXColumn">{xFieldLabel}</Label>

				{#if draft.type === 'cross-section'}
					<p class="fixed-value">{CROSS_SECTION_AXIS_LABEL}</p>
				{:else}
					<Select.Root
						type="single"
						value={draft.x.column ?? ''}
						onValueChange={(value) => setAxisColumn('x', value)}
					>
						<Select.Trigger id="plotXColumn">{draft.x.column || 'Select a column'}</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>Available columns</Select.Label>
								{#each controller.columns as column (column.name)}
									<Select.Item value={column.name} label={column.name}>
										{column.name}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<div class="field">
				<span id="xRangeLabel">X range</span>
				<div class="pair" role="group" aria-labelledby="xRangeLabel">
					<Input
						type="number"
						value={draft.x.min ?? ''}
						placeholder="auto"
						oninput={(event) => patchAxis('x', { min: numberOrNull(event.currentTarget.value) })}
					/>
					<Input
						type="number"
						value={draft.x.max ?? ''}
						placeholder="auto"
						oninput={(event) => patchAxis('x', { max: numberOrNull(event.currentTarget.value) })}
					/>
				</div>
			</div>

			<label class="checkbox-field">
				<Checkbox
					checked={draft.x.reverse}
					onCheckedChange={(checked) => patchAxis('x', { reverse: !!checked })}
				/>
				<span>Invert the X axis</span>
			</label>

			<div class="field">
				<Label for="plotYColumn">Y axis</Label>

				{#if !usesYColumn(draft.type)}
					<p class="fixed-value">{HISTOGRAM_AXIS_LABEL} of the rows in each bin</p>
				{:else}
					<Select.Root
						type="single"
						value={draft.y.column ?? ''}
						onValueChange={(value) => setAxisColumn('y', value)}
					>
						<Select.Trigger id="plotYColumn">{draft.y.column || 'Select a column'}</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Label>Available columns</Select.Label>
								{#each controller.columns as column (column.name)}
									<Select.Item value={column.name} label={column.name}>
										{column.name}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<div class="field">
				<span id="yRangeLabel">Y range</span>
				<div class="pair" role="group" aria-labelledby="yRangeLabel">
					<Input
						type="number"
						value={draft.y.min ?? ''}
						placeholder="auto"
						oninput={(event) => patchAxis('y', { min: numberOrNull(event.currentTarget.value) })}
					/>
					<Input
						type="number"
						value={draft.y.max ?? ''}
						placeholder="auto"
						oninput={(event) => patchAxis('y', { max: numberOrNull(event.currentTarget.value) })}
					/>
				</div>
			</div>

			<label class="checkbox-field">
				<Checkbox
					checked={draft.y.reverse}
					onCheckedChange={(checked) => patchAxis('y', { reverse: !!checked })}
				/>
				<span>Invert the Y axis (depth grows downward)</span>
			</label>

			{#if draft.type === 'line'}
				<div class="field">
					<Label for="plotGroupColumn">Group into strokes by</Label>
					<Select.Root
						type="single"
						value={draft.line.groupColumn ?? NO_COLUMN}
						onValueChange={setGroupColumn}
					>
						<Select.Trigger id="plotGroupColumn">
							{draft.line.groupColumn || 'One stroke for every row'}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Item value={NO_COLUMN} label="None">One stroke for every row</Select.Item>
								{#each controller.groupColumns as column (column.name)}
									<Select.Item value={column.name} label={column.name}>
										{column.name}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>

				<p class="hint">
					Pick the column that names a cast or a station. Each value becomes one stroke, in its own
					colour from the palette.
				</p>
			{/if}

			{#if usesZColumn(draft.type)}
				<div class="field">
					<Label for="plotZColumn">Colour (Z axis)</Label>
					<Select.Root
						type="single"
						value={draft.z?.column ?? NO_COLUMN}
						onValueChange={(value) => setAxisColumn('z', value)}
					>
						<Select.Trigger id="plotZColumn">{draft.z?.column || 'None'}</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Item value={NO_COLUMN} label="None">None</Select.Item>
								{#each controller.columns as column (column.name)}
									<Select.Item value={column.name} label={column.name}>
										{column.name}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			{#if draft.type === 'histogram'}
				<PlotSlider
					id="histogramBins"
					label="Bins"
					min={2}
					max={120}
					step={1}
					value={draft.histogram.binCount}
					onCommit={(value) => patchHistogram({ binCount: value })}
				/>

				<p class="hint">
					The bins span the X range. Pin the range in step 3 to count over a fixed window.
				</p>
			{/if}
		</PlotSection>

		<PlotSection step={3} title="Properties" summary={styleSummary} open={false}>
			<h4>Colour</h4>

			{#if draft.type === 'line'}
				<div class="field">
					<Label for="plotPalette">Palette</Label>
					<PalettePicker
						id="plotPalette"
						value={draft.style.palette}
						onSelect={(id) => patchStyle({ palette: id })}
					/>
				</div>

				<p class="hint">
					{#if draft.line.groupColumn}
						Every stroke takes one colour from the palette.
					{:else}
						Group the plot in step 2 to give each stroke its own colour.
					{/if}
				</p>
			{:else if draft.type === 'histogram'}
				<div class="field">
					<Label for="plotPalette">Palette</Label>
					<PalettePicker
						id="plotPalette"
						value={draft.style.palette}
						onSelect={(id) => patchStyle({ palette: id })}
					/>
				</div>

				<p class="hint">The bars take the first colour of the palette.</p>
			{:else if draft.z?.column}
				<div class="field">
					<Label for="plotPalette">Palette</Label>
					<PalettePicker
						id="plotPalette"
						value={draft.style.palette}
						reverse={draft.z.reverse}
						onSelect={(id) => patchStyle({ palette: id })}
					/>
				</div>

				<label class="checkbox-field">
					<Checkbox
						checked={draft.z.reverse}
						onCheckedChange={(checked) => patchAxis('z', { reverse: !!checked })}
					/>
					<span>Reverse the palette</span>
				</label>

				<div class="field">
					<span id="zRangeLabel">Colour range ({axisTitle(draft.z)})</span>
					<div class="pair" role="group" aria-labelledby="zRangeLabel">
						<Input
							type="number"
							value={draft.z.min ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('z', { min: numberOrNull(event.currentTarget.value) })}
						/>
						<Input
							type="number"
							value={draft.z.max ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('z', { max: numberOrNull(event.currentTarget.value) })}
						/>
					</div>
				</div>

				<div class="field">
					<Label for="plotColorScale">Color scale</Label>
					<Select.Root
						type="single"
						value={draft.z.scale}
						onValueChange={(value) => setColorScale(value as ColorScale)}
					>
						<Select.Trigger id="plotColorScale">
							{draft.z.scale === 'logarithmic'
								? 'Logarithmic'
								: draft.z.scale === 'exponential'
									? 'Exponential'
									: 'Linear'}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Item value="linear" label="Linear">Linear</Select.Item>
								<Select.Item value="logarithmic" label="Logarithmic">Logarithmic</Select.Item>
								<!-- <Select.Item value="exponential" label="Exponential">Exponential</Select.Item> -->
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>

				{#if colorScaleError}
					<p class="scale-error" role="alert">{colorScaleError}</p>
				{/if}
			{:else}
				<p class="hint">Bind a column to the colour axis in step 2 to pick a palette.</p>
			{/if}

			{#if draft.type === 'line'}
				<h4>Strokes</h4>

				<PlotSlider
					id="plotLineWidth"
					label="Line width"
					suffix="px"
					min={0.25}
					max={6}
					step={0.25}
					value={draft.line.width}
					onCommit={(value) => patchLine({ width: value })}
				/>

				<div class="field">
					<Label for="plotLineSort">Draw along</Label>
					<Select.Root
						type="single"
						value={draft.line.sortBy}
						onValueChange={(value) => patchLine({ sortBy: value === 'y' ? 'y' : 'x' })}
					>
						<Select.Trigger id="plotLineSort">
							{draft.line.sortBy === 'y' ? 'The Y axis' : 'The X axis'}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								<Select.Item value="x" label="The X axis">The X axis</Select.Item>
								<Select.Item value="y" label="The Y axis">The Y axis</Select.Item>
							</Select.Group>
						</Select.Content>
					</Select.Root>
				</div>

				<p class="hint">
					A time series runs along X. A vertical profile runs along Y, because the depth is there.
				</p>

				<label class="checkbox-field">
					<Checkbox
						checked={draft.line.showPoints}
						onCheckedChange={(checked) => patchLine({ showPoints: !!checked })}
					/>
					<span>Mark every row with a dot</span>
				</label>
			{:else}
				<h4>Markers</h4>
			{/if}

			{#if draft.type !== 'histogram' && (draft.type !== 'line' || draft.line.showPoints)}
				<PlotSlider
					id="plotPointRadius"
					label="Marker size"
					suffix="px"
					min={0.5}
					max={12}
					step={0.5}
					value={draft.style.pointRadius}
					onCommit={(value) => patchStyle({ pointRadius: value })}
				/>
			{/if}

			<PlotSlider
				id="plotPointOpacity"
				label="Marker Opacity"
				min={0.05}
				max={1}
				step={0.05}
				value={draft.style.pointOpacity}
				onCommit={(value) => patchStyle({ pointOpacity: value })}
			/>

			<h4>Canvas</h4>

			<label class="checkbox-field">
				<Checkbox
					checked={draft.style.gridlines}
					onCheckedChange={(checked) => patchStyle({ gridlines: !!checked })}
				/>
				<span>Show gridlines</span>
			</label>

					<div class="field">
						<span id="plotGridlineColourLabel">Gridline color</span>
						<input
							id="plotGridlineColour"
							type="color"
							value={draft.style.gridlineColor}
							onchange={(event) => patchStyle({ gridlineColor: event.currentTarget.value })}
						/>
					</div>

					<PlotSlider
						id="plotGridlineOpacity"
						label="Gridline opacity"
						min={0}
						max={1}
						step={0.05}
						value={draft.style.gridlineOpacity}
						onCommit={(value) => patchStyle({ gridlineOpacity: value })}
					/>

			<div class="field">
				<span id="plotBackgroundColourLabel">Background color</span>
				<input
					id="plotBackgroundColour"
					type="color"
					value={draft.style.backgroundColor}
					onchange={(event) => patchStyle({ backgroundColor: event.currentTarget.value })}
				/>
			</div>

			<div class="field">
				<span id="plotTextColourLabel">Text color</span>
				<input
					id="plotTextColour"
					type="color"
					value={draft.style.textColor}
					onchange={(event) => patchStyle({ textColor: event.currentTarget.value })}
				/>
			</div>

			<h4>Text</h4>

			<!--
			 x axis title, x axis size (to separate from axis title size),
			 y axis title, y axis size (to separate from axis title size),
			 legend title (to add), legend title size (to add) tick label size -->

			<label class="field">
				<span>Plot title</span>
				<Input
					type="text"
					value={draft.title}
					placeholder="No title"
					oninput={(event) => patchDraft({ title: event.currentTarget.value })}
				/>
			</label>

			<PlotSlider
				id="plotTitleSize"
				label="Title size"
				suffix="px"
				min={8}
				max={40}
				step={1}
				value={draft.style.titleFontSize}
				onCommit={(value) => patchStyle({ titleFontSize: value })}
			/>

			<label class="field">
				<span>X axis title</span>
				<Input
					type="text"
					value={draft.x.label ?? ''}
					placeholder={draft.type === 'cross-section'
						? CROSS_SECTION_AXIS_LABEL
						: (draft.x.column ?? 'Column name')}
					oninput={(event) => patchAxis('x', { label: textOrNull(event.currentTarget.value) })}
				/>
			</label>

			<PlotSlider
				id="plotXAxisTitleSize"
				label="X axis title size"
				suffix="px"
				min={6}
				max={32}
				step={1}
				value={draft.style.xAxisTitleFontSize}
				onCommit={(value) => patchStyle({ xAxisTitleFontSize: value })}
			/>

			<label class="field">
				<span>Y axis title</span>
				<Input
					type="text"
					value={draft.y.label ?? ''}
					placeholder={draft.type === 'histogram'
						? HISTOGRAM_AXIS_LABEL
						: (draft.y.column ?? 'Column name')}
					oninput={(event) => patchAxis('y', { label: textOrNull(event.currentTarget.value) })}
				/>
			</label>

			<PlotSlider
				id="plotYAxisTitleSize"
				label="Y axis title size"
				suffix="px"
				min={6}
				max={32}
				step={1}
				value={draft.style.yAxisTitleFontSize}
				onCommit={(value) => patchStyle({ yAxisTitleFontSize: value })}
			/>

			<label class="field">
				<span>Legend title</span>
				<Input
					type="text"
					value={draft.style.legendTitle}
					placeholder="Use the default legend title"
					oninput={(event) => patchStyle({ legendTitle: event.currentTarget.value })}
				/>
			</label>

			<PlotSlider
				id="plotLegendTitleSize"
				label="Legend title size"
				suffix="px"
				min={6}
				max={32}
				step={1}
				value={draft.style.legendTitleFontSize}
				onCommit={(value) => patchStyle({ legendTitleFontSize: value })}
			/>

			<PlotSlider
				id="plotTickSize"
				label="Tick label size"
				suffix="px"
				min={6}
				max={32}
				step={1}
				value={draft.style.tickFontSize}
				onCommit={(value) => patchStyle({ tickFontSize: value })}
			/>
		</PlotSection>

		<PlotSection step={4} title="Contours" summary={contourSummary} open={false}>
			{#if !usesZColumn(draft.type)}
				<p class="hint">
					Contours need a value per point. A {draft.type === 'line' ? 'line' : 'histogram'} has none,
					so they are off for this plot type.
				</p>
			{:else if !draft.z?.column}
				<p class="hint">
					Contours read the colour axis. Bind a column to it in step 2 to switch them on.
				</p>
			{:else}
				<label class="checkbox-field">
					<Checkbox
						checked={draft.contour.enabled}
						onCheckedChange={(checked) => patchContour({ enabled: !!checked })}
					/>
					<span>Draw contour lines</span>
				</label>

				{#if draft.contour.enabled}
					<p class="hint">
						The values are interpolated onto a grid, and the lines are clipped to the area the rows
						cover.
					</p>

					<PlotSlider
						id="contourLevels"
						label="Levels"
						min={2}
						max={30}
						step={1}
						value={draft.contour.levelCount}
						onCommit={(value) => patchContour({ levelCount: value })}
					/>

					<PlotSlider
						id="contourGrid"
						label="Grid detail"
						min={20}
						max={300}
						step={10}
						value={draft.contour.gridResolution}
						onCommit={(value) => patchContour({ gridResolution: value })}
					/>

					<PlotSlider
						id="contourLineWidth"
						label="Line width"
						suffix="px"
						min={0.25}
						max={5}
						step={0.25}
						value={draft.contour.lineWidth}
						onCommit={(value) => patchContour({ lineWidth: value })}
					/>

					<label class="checkbox-field">
						<Checkbox
							checked={draft.contour.showLabels}
							onCheckedChange={(checked) => patchContour({ showLabels: !!checked })}
						/>
						<span>Label the levels</span>
					</label>

					{#if draft.contour.showLabels}
						<PlotSlider
							id="contourLabelSize"
							label="Label size"
							suffix="px"
							min={6}
							max={24}
							step={1}
							value={draft.contour.labelFontSize}
							onCommit={(value) => patchContour({ labelFontSize: value })}
						/>
					{/if}
				{/if}
			{/if}
		</PlotSection>

		<!--
			Sticky, so the button stays reachable however far the user has scrolled
			through the steps.
		-->
		<footer class="apply-bar" class:dirty={isDirty}>
			<button type="button" class="apply" disabled={!isDirty || !!colorScaleError} onclick={apply}>
				<CheckIcon size={15} />
				<span>Apply changes</span>
			</button>

			<button
				type="button"
				class="revert"
				disabled={!isDirty}
				title="Go back to what the chart is drawing"
				onclick={revert}
			>
				<Undo2Icon size={15} />
				<span>Revert</span>
			</button>
		</footer>
	</aside>
{/if}

<style lang="scss">
	.plot-config-panel {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		width: 19rem;
		flex-shrink: 0;
		min-height: 0;
		overflow-y: auto;
		padding-right: 0.5rem;

		.apply-bar {
			position: sticky;
			bottom: 0;
			display: grid;
			grid-template-columns: 1fr auto;
			gap: 0.5rem;
			padding: 0.625rem 0 0.25rem;
			background-color: var(--card, #ffffff);
			border-top: 1px solid var(--border, #e5e7eb);

			button {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.375rem;
				padding: 0.5rem 0.75rem;
				border-radius: 0.375rem;
				border: 1px solid var(--border, #e5e7eb);
				background-color: var(--card, #ffffff);
				font-size: 0.8125rem;
				font-weight: 500;
				cursor: pointer;

				&:disabled {
					opacity: 0.45;
					cursor: default;
				}
			}

			// The Apply button only stands out while there is something to apply.
			&.dirty .apply {
				border-color: #2563eb;
				background-color: #2563eb;
				color: #ffffff;
			}

			&.dirty .revert:hover {
				background-color: var(--accent, #f3f4f6);
			}
		}

		h4 {
			font-size: 0.75rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--muted-foreground, #6b7280);
			margin-top: 0.25rem;

			&:first-child {
				margin-top: 0;
			}
		}

		.field {
			display: flex;
			flex-direction: column;
			gap: 0.3125rem;

			// The Label component renders the element, so the rule reaches through it.
			:global([data-slot='label']),
			> span {
				display: flex;
				justify-content: space-between;
				gap: 0.5rem;
				font-size: 0.8125rem;
			}

			.fixed-value {
				font-size: 0.8125rem;
				color: var(--muted-foreground, #6b7280);
				padding: 0.375rem 0;
			}
		}

		.checkbox-field {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;
			cursor: pointer;
		}

		.pair {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem;

			&.colors label {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				font-size: 0.75rem;
				cursor: pointer;
			}

			input[type='color'] {
				width: 2rem;
				height: 1.75rem;
				padding: 0;
				border: 1px solid var(--border, #e5e7eb);
				border-radius: 0.25rem;
				background: none;
				cursor: pointer;
			}
		}

		.hint {
			font-size: 0.75rem;
			color: var(--muted-foreground, #6b7280);
		}
	}
</style>
