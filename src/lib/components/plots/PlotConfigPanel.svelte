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
		type PlotInterpolationConfig,
		type PlotInterpolationMethod,
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
	let openSection = $state(1);

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

	function patchInterpolation(patch: Partial<PlotInterpolationConfig>) {
		if (!draft) return;
		userEdited = true;
		draft = { ...draft, interpolation: { ...draft.interpolation, ...patch } };
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

	function openConfigSection(section: number, isOpen: boolean) {
		if (isOpen) {
			openSection = section;
			return;
		}

		if (openSection === section) {
			openSection = 0;
		}
	}

	/**
	 * Switch the type, and fit the axis columns to what the new type reads.
	 *
	 * A cross section takes its X values from the drawn line, so the column of the
	 * X axis has no meaning there. A switch to a type that needs one again fills
	 * it, because the first column is a better start than an empty selector.
	 */
	function setPlotType(type: PlotType) {
		openConfigSection(2, true);
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

	function interpolationMethodLabel(method: PlotInterpolationMethod): string {
		if (method === 'delaunay-barycentric') return 'Delaunay triangulation';
		return 'Gaussian smoothing';
	}

	function interpolationSmoothingLabel(method: PlotInterpolationMethod): string {
		if (method === 'delaunay-barycentric') return 'Outside smoothing';
		return 'Gaussian sigma';
	}

	const MIN_GRID_RESOLUTION = 20;
	const MAX_GRID_RESOLUTION = 300;

	// -- value helpers -------------------------------------------------------

	/** An empty field means "auto", which the model stores as null. */
	function numberOrNull(value: string): number | null {
		if (value.trim() === '') return null;

		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return null;
		return parsed;
	}

	function gridResolutionValue(value: string, current: number): number {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return current;

		if (parsed < MIN_GRID_RESOLUTION) {
			addToast({
				message: `Input cannot be less than ${MIN_GRID_RESOLUTION}.`,
				type: 'error'
			});
			return MIN_GRID_RESOLUTION;
		}

		if (parsed > MAX_GRID_RESOLUTION) {
			addToast({
				message: `Input cannot be greater than ${MAX_GRID_RESOLUTION}.`,
				type: 'error'
			});
			return MAX_GRID_RESOLUTION;
		}

		return Math.round(parsed);
	}

	/** An empty field means "use the column name", which the model stores as null. */
	function textOrNull(value: string): string | null {
		if (value.trim() === '') return null;
		return value;
	}

	function sizeOptions(min: number, max: number, step = 1): number[] {
		const values: number[] = [];
		for (let value = min; value <= max; value += step) {
			values.push(Number(value.toFixed(2)));
		}
		return values;
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

	const advancedAnalysisSummary = $derived.by(() => {
		if (draft && !usesZColumn(draft.type)) return 'Not for this plot type';
		if (!draft?.z?.column) return 'Needs a colour column';
		if (!draft.interpolation.enabled && !draft.contour.enabled) return 'Off';

		const parts: string[] = [];
		if (draft.interpolation.enabled) {
			if (draft.interpolation.method === 'gaussian') {
				parts.push(
					`${interpolationMethodLabel(draft.interpolation.method)} · ${draft.interpolation.bandCount} bands`
				);
			} else {
				parts.push(interpolationMethodLabel(draft.interpolation.method));
			}
		}
		if (draft.contour.enabled) parts.push(`${draft.contour.levelCount} lines`);
		return parts.join(' · ');
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
		<PlotSection
			step={1}
			title="Plot type"
			summary={typeSummary}
			open={openSection === 1}
			onOpenChange={(isOpen) => openConfigSection(1, isOpen)}
		>
			<PlotTypeCards
				value={draft.type}
				crossSectionAvailable={controller.hasCrossSection}
				onSelect={(type) => setPlotType(type)}
			/>
		</PlotSection>

		<PlotSection
			step={2}
			title="Bind data"
			summary={bindingSummary}
			open={openSection === 2}
			onOpenChange={(isOpen) => openConfigSection(2, isOpen)}
		>
			<div class="axis-group">
				<div class="axis-header">
					<span class="axis-title">{xFieldLabel}</span>
					<label class="switch-field">
						<span>Invert</span>
						<input
							type="checkbox"
							class="switch-input"
							checked={draft.x.reverse}
							onchange={(event) => patchAxis('x', { reverse: event.currentTarget.checked })}
							aria-label="Invert X axis"
						/>
						<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
					</label>
				</div>

				<div class="field">
					{#if draft.type === 'cross-section'}
						<p class="fixed-value">{CROSS_SECTION_AXIS_LABEL}</p>
					{:else}
						<Select.Root
							type="single"
							value={draft.x.column ?? ''}
							onValueChange={(value) => setAxisColumn('x', value)}
						>
							<Select.Trigger id="plotXColumn">{draft.x.column || 'Select a column'}</Select.Trigger
							>
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

				<div class="pair" role="group" aria-labelledby="xRangeLabel">
					<label class="range-field" id="xRangeLabel">
						<span>Min</span>
						<Input
							type="number"
							value={draft.x.min ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('x', { min: numberOrNull(event.currentTarget.value) })}
						/>
					</label>
					<label class="range-field">
						<span>Max</span>
						<Input
							type="number"
							value={draft.x.max ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('x', { max: numberOrNull(event.currentTarget.value) })}
						/>
					</label>
				</div>
			</div>

			<div class="axis-group">
				<div class="axis-header">
					<span class="axis-title">Y axis</span>
					<label class="switch-field">
						<span>Invert</span>
						<input
							type="checkbox"
							class="switch-input"
							checked={draft.y.reverse}
							onchange={(event) => patchAxis('y', { reverse: event.currentTarget.checked })}
							aria-label="Invert Y axis"
						/>
						<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
					</label>
				</div>

				<div class="field">
					{#if !usesYColumn(draft.type)}
						<p class="fixed-value">{HISTOGRAM_AXIS_LABEL} of the rows in each bin</p>
					{:else}
						<Select.Root
							type="single"
							value={draft.y.column ?? ''}
							onValueChange={(value) => setAxisColumn('y', value)}
						>
							<Select.Trigger id="plotYColumn">{draft.y.column || 'Select a column'}</Select.Trigger
							>
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

				<div class="pair" role="group" aria-labelledby="yRangeLabel">
					<label class="range-field" id="yRangeLabel">
						<span>Min</span>
						<Input
							type="number"
							value={draft.y.min ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('y', { min: numberOrNull(event.currentTarget.value) })}
						/>
					</label>
					<label class="range-field">
						<span>Max</span>
						<Input
							type="number"
							value={draft.y.max ?? ''}
							placeholder="auto"
							oninput={(event) => patchAxis('y', { max: numberOrNull(event.currentTarget.value) })}
						/>
					</label>
				</div>
			</div>

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
				<div class="axis-group z-group">
					<h4 class="axis-heading">Z axis / Color</h4>
					<div class="field">
						<Label for="plotZColumn">Colour column</Label>
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

		<PlotSection
			step={3}
			title="Properties"
			summary={styleSummary}
			open={openSection === 3}
			onOpenChange={(isOpen) => openConfigSection(3, isOpen)}
		>
			<details class="property-subsection" open>
				<summary>Titles &amp; Labels</summary>
				<div class="subsection-body">
					<div class="property-row">
						<label class="field">
							<span>Plot title</span>
							<Input
								type="text"
								value={draft.title}
								placeholder="No title"
								oninput={(event) => patchDraft({ title: event.currentTarget.value })}
							/>
						</label>
						<div class="field">
							<span>Title size</span>
							<Select.Root
								type="single"
								value={String(draft.style.titleFontSize)}
								onValueChange={(value) => patchStyle({ titleFontSize: Number(value) })}
							>
								<Select.Trigger id="plotTitleSize">{draft.style.titleFontSize}px</Select.Trigger>
								<Select.Content>
									<Select.Group>
										{#each sizeOptions(8, 40) as size (size)}
											<Select.Item value={String(size)} label={`${size}px`}>{size}px</Select.Item>
										{/each}
									</Select.Group>
								</Select.Content>
							</Select.Root>
						</div>

						<div class="field">
							<label class="checkbox-field">
								<Checkbox
									checked={draft.style.showCaption}
									onCheckedChange={(checked) => patchStyle({ showCaption: !!checked })}
								/>
								<span>Show caption</span>
							</label>
						</div>
					</div>


					<div class="property-row">
						<label class="field"
							><span>X-axis label</span><Input
								type="text"
								value={draft.x.label ?? ''}
								placeholder={draft.type === 'cross-section'
									? CROSS_SECTION_AXIS_LABEL
									: (draft.x.column ?? 'Column name')}
								oninput={(event) =>
									patchAxis('x', { label: textOrNull(event.currentTarget.value) })}
							/></label
						>
						<div class="field">
							<span>Size</span><Select.Root
								type="single"
								value={String(draft.style.xAxisTitleFontSize)}
								onValueChange={(value) => patchStyle({ xAxisTitleFontSize: Number(value) })}
								><Select.Trigger id="plotXAxisTitleSize"
									>{draft.style.xAxisTitleFontSize}px</Select.Trigger
								><Select.Content
									><Select.Group
										>{#each sizeOptions(6, 32) as size}<Select.Item
												value={String(size)}
												label={`${size}px`}>{size}px</Select.Item
											>{/each}</Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
					</div>
					<div class="property-row">
						<label class="field"
							><span>Y-axis label</span><Input
								type="text"
								value={draft.y.label ?? ''}
								placeholder={draft.type === 'histogram'
									? HISTOGRAM_AXIS_LABEL
									: (draft.y.column ?? 'Column name')}
								oninput={(event) =>
									patchAxis('y', { label: textOrNull(event.currentTarget.value) })}
							/></label
						>
						<div class="field">
							<span>Size</span><Select.Root
								type="single"
								value={String(draft.style.yAxisTitleFontSize)}
								onValueChange={(value) => patchStyle({ yAxisTitleFontSize: Number(value) })}
								><Select.Trigger id="plotYAxisTitleSize"
									>{draft.style.yAxisTitleFontSize}px</Select.Trigger
								><Select.Content
									><Select.Group
										>{#each sizeOptions(6, 32) as size}<Select.Item
												value={String(size)}
												label={`${size}px`}>{size}px</Select.Item
											>{/each}</Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
					</div>
					<div class="property-row">
						<label class="field"
							><span>Legend</span><Input
								type="text"
								value={draft.style.legendTitle}
								placeholder="Use the default legend title"
								oninput={(event) => patchStyle({ legendTitle: event.currentTarget.value })}
							/></label
						>
						<div class="field">
							<span>Size</span><Select.Root
								type="single"
								value={String(draft.style.legendTitleFontSize)}
								onValueChange={(value) => patchStyle({ legendTitleFontSize: Number(value) })}
								><Select.Trigger id="plotLegendTitleSize"
									>{draft.style.legendTitleFontSize}px</Select.Trigger
								><Select.Content
									><Select.Group
										>{#each sizeOptions(6, 32) as size}<Select.Item
												value={String(size)}
												label={`${size}px`}>{size}px</Select.Item
											>{/each}</Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
					</div>
					<div class="field">
						<span>Tick label size</span><Select.Root
							type="single"
							value={String(draft.style.tickFontSize)}
							onValueChange={(value) => patchStyle({ tickFontSize: Number(value) })}
							><Select.Trigger id="plotTickSize">{draft.style.tickFontSize}px</Select.Trigger
							><Select.Content
								><Select.Group
									>{#each sizeOptions(6, 32) as size}<Select.Item
											value={String(size)}
											label={`${size}px`}>{size}px</Select.Item
										>{/each}</Select.Group
								></Select.Content
							></Select.Root
						>
					</div>
				</div>
			</details>

			<details class="property-subsection" open>
				<summary>Data &amp; Color</summary>
				<div class="subsection-body">
					{#if draft.type === 'line' || draft.type === 'histogram' || draft.z?.column}
						<div class="field">
							<Label for="plotPalette">Palette</Label><PalettePicker
								id="plotPalette"
								value={draft.style.palette}
								reverse={draft.z?.column ? draft.z.reverse : false}
								onSelect={(id) => patchStyle({ palette: id })}
							/>
						</div>
						{#if draft.type === 'line'}<p class="hint">
								{draft.line.groupColumn
									? 'Every stroke takes one colour from the palette.'
									: 'Group the plot in step 2 to give each stroke its own colour.'}
							</p>{:else if draft.type === 'histogram'}<p class="hint">
								The bars take the first colour of the palette.
							</p>{/if}
					{:else}<p class="hint">
							Bind a column to the colour axis in step 2 to pick a palette.
						</p>{/if}
					{#if draft.z?.column}
						<label class="checkbox-field"
							><Checkbox
								checked={draft.z.reverse}
								onCheckedChange={(checked) => patchAxis('z', { reverse: !!checked })}
							/><span>Reverse the palette</span></label
						>
						<div class="field">
							<span id="zRangeLabel">Colour range ({axisTitle(draft.z)})</span>
							<div class="pair" role="group" aria-labelledby="zRangeLabel">
								<Input
									type="number"
									value={draft.z.min ?? ''}
									placeholder="auto"
									oninput={(event) =>
										patchAxis('z', { min: numberOrNull(event.currentTarget.value) })}
								/><Input
									type="number"
									value={draft.z.max ?? ''}
									placeholder="auto"
									oninput={(event) =>
										patchAxis('z', { max: numberOrNull(event.currentTarget.value) })}
								/>
							</div>
						</div>
						<div class="field">
							<Label for="plotColorScale">Color scale</Label><Select.Root
								type="single"
								value={draft.z.scale}
								onValueChange={(value) => setColorScale(value as ColorScale)}
								><Select.Trigger id="plotColorScale"
									>{draft.z.scale === 'logarithmic' ? 'Logarithmic' : 'Linear'}</Select.Trigger
								><Select.Content
									><Select.Group
										><Select.Item value="linear" label="Linear">Linear</Select.Item><Select.Item
											value="logarithmic"
											label="Logarithmic">Logarithmic</Select.Item
										></Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
						{#if colorScaleError}<p class="scale-error" role="alert">{colorScaleError}</p>{/if}
					{/if}
				</div>
			</details>

			<details class="property-subsection" open>
				<summary>Markers</summary>
				<div class="subsection-body">
					{#if draft.type === 'line'}
						<div class="field">
							<Label for="plotLineSort">Draw along</Label><Select.Root
								type="single"
								value={draft.line.sortBy}
								onValueChange={(value) => patchLine({ sortBy: value === 'y' ? 'y' : 'x' })}
								><Select.Trigger id="plotLineSort"
									>{draft.line.sortBy === 'y' ? 'The Y axis' : 'The X axis'}</Select.Trigger
								><Select.Content
									><Select.Group
										><Select.Item value="x" label="The X axis">The X axis</Select.Item><Select.Item
											value="y"
											label="The Y axis">The Y axis</Select.Item
										></Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
						<label class="checkbox-field"
							><Checkbox
								checked={draft.line.showPoints}
								onCheckedChange={(checked) => patchLine({ showPoints: !!checked })}
							/><span>Mark every row with a dot</span></label
						>
					{:else if draft.type !== 'histogram'}<label class="checkbox-field"
							><Checkbox
								checked={draft.style.showPoints}
								onCheckedChange={(checked) => patchStyle({ showPoints: !!checked })}
							/><span>Draw data points</span></label
						>{/if}
					{#if draft.type !== 'histogram' && (draft.type === 'line' ? draft.line.showPoints : draft.style.showPoints)}
						<div class="field">
							<span>Marker size</span><Select.Root
								type="single"
								value={String(draft.style.pointRadius)}
								onValueChange={(value) => patchStyle({ pointRadius: Number(value) })}
								><Select.Trigger id="plotPointRadius">{draft.style.pointRadius}px</Select.Trigger
								><Select.Content
									><Select.Group
										>{#each sizeOptions(0.5, 12, 0.5) as size}<Select.Item
												value={String(size)}
												label={`${size}px`}>{size}px</Select.Item
											>{/each}</Select.Group
									></Select.Content
								></Select.Root
							>
						</div>
					{/if}
					<PlotSlider
						id="plotPointOpacity"
						label="Marker opacity"
						min={0.05}
						max={1}
						step={0.05}
						value={draft.style.pointOpacity}
						onCommit={(value) => patchStyle({ pointOpacity: value })}
					/>
				</div>
			</details>

			<details class="property-subsection" open>
				<summary>Canvas</summary>
				<div class="subsection-body">
					<label class="checkbox-field"
						><Checkbox
							checked={draft.style.gridlines}
							onCheckedChange={(checked) => patchStyle({ gridlines: !!checked })}
						/><span>Show gridlines</span></label
					>
					<div class="field color-field">
						<span>Background color</span><input
							id="plotBackgroundColour"
							type="color"
							value={draft.style.backgroundColor}
							aria-label="Background color"
							onchange={(event) => patchStyle({ backgroundColor: event.currentTarget.value })}
						/>
					</div>
					<div class="field color-field">
						<span>Text color</span><input
							id="plotTextColour"
							type="color"
							value={draft.style.textColor}
							aria-label="Text color"
							onchange={(event) => patchStyle({ textColor: event.currentTarget.value })}
						/>
					</div>
					<div class="field color-field">
						<span>Gridline color</span><input
							id="plotGridlineColour"
							type="color"
							value={draft.style.gridlineColor}
							aria-label="Gridline color"
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
				</div>
			</details>
		</PlotSection>

		<!-- Contours rename to Advanced analysis -->
		<PlotSection
			step={4}
			title="Advanced Analysis"
			summary={advancedAnalysisSummary}
			open={openSection === 4}
			onOpenChange={(isOpen) => openConfigSection(4, isOpen)}
		>
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
				<details class="analysis-subsection">
					<summary class="analysis-header">
						<span>Gridding &amp; Interpolation</span>
					</summary>

					<div class="analysis-body">
						<label class="switch-field">
							<span>Interpolate</span>
							<input
								type="checkbox"
								class="switch-input"
								checked={draft.interpolation.enabled}
								onchange={(event) => patchInterpolation({ enabled: event.currentTarget.checked })}
								aria-label="Interpolate"
							/>
							<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span
							>
						</label>
						<p class="hint">
							The selected X, Y and colour values are interpolated and drawn behind the points.
						</p>

						{#if draft.interpolation.method === 'delaunay-barycentric'}
							<p class="hint">
								Delaunay draws inside the measured data footprint. Smoothed gridding fills the
								outside.
							</p>
						{/if}

						<div class="field">
							<Label for="interpolationMethod">Method</Label>
							<Select.Root
								type="single"
								value={draft.interpolation.method}
								onValueChange={(value) =>
									patchInterpolation({ method: value as PlotInterpolationMethod })}
							>
								<Select.Trigger id="interpolationMethod">
									{interpolationMethodLabel(draft.interpolation.method)}
								</Select.Trigger>
								<Select.Content>
									<Select.Group>
										<Select.Item value="gaussian" label="Gaussian smoothing">
											Gaussian smoothing
										</Select.Item>
										<Select.Item value="delaunay-barycentric" label="Delaunay triangulation">
											Delaunay triangulation
										</Select.Item>
									</Select.Group>
								</Select.Content>
							</Select.Root>
						</div>

						<div class="field">
							<span>Grid resolution</span>
							<div class="pair" role="group" aria-label="Grid resolution">
								<label class="range-field" for="interpolationGridX">
									<span>x:</span>
									<Input
										id="interpolationGridX"
										type="number"
										min={MIN_GRID_RESOLUTION}
										max={MAX_GRID_RESOLUTION}
										step={1}
										value={draft.interpolation.xGridResolution}
										onchange={(event) =>
											patchInterpolation({
												xGridResolution: gridResolutionValue(
													event.currentTarget.value,
													draft.interpolation.xGridResolution
												)
											})}
									/>
								</label>
								<label class="range-field" for="interpolationGridY">
									<span>y:</span>
									<Input
										id="interpolationGridY"
										type="number"
										min={MIN_GRID_RESOLUTION}
										max={MAX_GRID_RESOLUTION}
										step={1}
										value={draft.interpolation.yGridResolution}
										onchange={(event) =>
											patchInterpolation({
												yGridResolution: gridResolutionValue(
													event.currentTarget.value,
													draft.interpolation.yGridResolution
												)
											})}
									/>
								</label>
							</div>
						</div>

						<PlotSlider
							id="interpolationSigma"
							label={interpolationSmoothingLabel(draft.interpolation.method)}
							min={0}
							max={8}
							step={0.1}
							value={draft.interpolation.gaussianSigma}
							onCommit={(value) => patchInterpolation({ gaussianSigma: value })}
						/>

						<div class="clip-range field">
							<div class="clip-range-header">
								<span>Clip limits</span><span
									>{draft.interpolation.percentileMin}% - {draft.interpolation.percentileMax}%</span
								>
							</div>
							<div
								class="clip-range-track"
								style={`--clip-min: ${draft.interpolation.percentileMin}%; --clip-max: ${draft.interpolation.percentileMax}%;`}
							>
								<input
									id="interpolationPercentileMin"
									type="range"
									min={0}
									max={100}
									step={0.5}
									value={draft.interpolation.percentileMin}
									oninput={(event) =>
										patchInterpolation({
											percentileMin: Math.min(
												Number(event.currentTarget.value),
												draft.interpolation.percentileMax
											)
										})}
									aria-label="Clip minimum"
								/>
								<input
									id="interpolationPercentileMax"
									type="range"
									min={0}
									max={100}
									step={0.5}
									value={draft.interpolation.percentileMax}
									oninput={(event) =>
										patchInterpolation({
											percentileMax: Math.max(
												Number(event.currentTarget.value),
												draft.interpolation.percentileMin
											)
										})}
									aria-label="Clip maximum"
								/>
							</div>
							<div class="clip-range-labels">
								<span>{draft.interpolation.percentileMin}%</span><span
									>{draft.interpolation.percentileMax}%</span
								>
							</div>
						</div>

						{#if draft.interpolation.method === 'gaussian'}
							<PlotSlider
								id="interpolationBands"
								label="Colour bands"
								min={2}
								max={50}
								step={1}
								value={draft.interpolation.bandCount}
								onCommit={(value) => patchInterpolation({ bandCount: value })}
							/>
						{/if}
					</div>
				</details>

				<details class="analysis-subsection">
					<summary class="analysis-header">
						<span>Contour Lines</span>
					</summary>

					<div class="analysis-body">
						<label class="switch-field">
							<span>Draw contours</span>
							<input
								type="checkbox"
								class="switch-input"
								checked={draft.contour.enabled}
								onchange={(event) => patchContour({ enabled: event.currentTarget.checked })}
								aria-label="Draw contour lines"
							/>
							<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span
							>
						</label>
						<p class="hint">
							The values are interpolated onto a grid, and the lines are clipped to the area the
							rows cover.
						</p>

						<PlotSlider
							id="contourLevels"
							label="Levels (number of contours)"
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

						<div class="field">
							<span>Line width</span><Select.Root
								type="single"
								value={String(draft.contour.lineWidth)}
								onValueChange={(value) => patchContour({ lineWidth: Number(value) })}
								><Select.Trigger id="contourLineWidth">{draft.contour.lineWidth}px</Select.Trigger
								><Select.Content
									><Select.Group
										>{#each sizeOptions(0.25, 5, 0.25) as size}<Select.Item
												value={String(size)}
												label={`${size}px`}>{size}px</Select.Item
											>{/each}</Select.Group
									></Select.Content
								></Select.Root
							>
						</div>

						<label class="checkbox-field">
							<Checkbox
								checked={draft.contour.showLabels}
								onCheckedChange={(checked) => patchContour({ showLabels: !!checked })}
							/>
							<span>Add label</span>
						</label>

						{#if draft.contour.showLabels}
							<div class="field">
								<span>Label size</span><Select.Root
									type="single"
									value={String(draft.contour.labelFontSize)}
									onValueChange={(value) => patchContour({ labelFontSize: Number(value) })}
									><Select.Trigger id="contourLabelSize"
										>{draft.contour.labelFontSize}px</Select.Trigger
									><Select.Content
										><Select.Group
											>{#each sizeOptions(6, 24) as size}<Select.Item
													value={String(size)}
													label={`${size}px`}>{size}px</Select.Item
												>{/each}</Select.Group
										></Select.Content
									></Select.Root
								>
							</div>
						{/if}
					</div>
				</details>

				<details class="analysis-subsection density-subsection">
					<summary class="analysis-header">
						<span>Density Overlays</span>
					</summary>
					<div class="analysis-body">
						<label class="switch-field">
							<span>Show overlays</span>
							<input type="checkbox" class="switch-input" aria-label="Show density overlays" />
							<span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span
							>
						</label>
					</div>
				</details>
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

		.axis-group {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			padding: 0.25rem 0 1rem;
			border-bottom: 1px solid var(--border, #e5e7eb);

			&:last-of-type {
				border-bottom: 0;
				padding-bottom: 0.25rem;
			}
		}

		.property-subsection {
			border-bottom: 1px solid var(--border, #e5e7eb);

			&:last-child {
				border-bottom: 0;
			}

			summary {
				display: flex;
				align-items: center;
				justify-content: space-between;
				padding: 0.625rem 0;
				color: var(--foreground, #111827);
				font-size: 0.75rem;
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				cursor: pointer;
				list-style: none;

				&::-webkit-details-marker {
					display: none;
				}

				&::after {
					content: '\2304';
					font-size: 1rem;
					line-height: 0.75;
					transform: rotate(180deg);
					transition: transform 0.15s ease;
				}
			}

			&:not([open]) summary::after {
				transform: rotate(0deg);
			}
		}

		.subsection-body {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			padding: 0.125rem 0 0.875rem;
		}

		.property-row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 6.25rem;
			align-items: end;
			gap: 0.5rem;
		}

		.analysis-subsection {
			border-bottom: 1px solid var(--border, #e5e7eb);
			padding-bottom: 0.125rem;

			&:last-child {
				border-bottom: 0;
			}

			.analysis-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5rem;
				padding: 0.625rem 0;
				color: var(--foreground, #111827);
				font-size: 0.75rem;
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				cursor: pointer;
				list-style: none;

				&::-webkit-details-marker {
					display: none;
				}

				&::after {
					content: '\2304';
					font-size: 1rem;
					line-height: 0.75;
					transform: rotate(0deg);
					transition: transform 0.15s ease;
				}
			}

			&[open] .analysis-header::after {
				transform: rotate(180deg);
			}
		}

		.analysis-body {
			display: flex;
			flex-direction: column;
			gap: 0.75rem;
			padding: 0.125rem 0 0.875rem;
		}

		.clip-range-header,
		.clip-range-labels {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			font-size: 0.8125rem;
		}

		.clip-range-header span:last-child {
			color: var(--muted-foreground, #6b7280);
		}

		.clip-range-track {
			position: relative;
			height: 1.25rem;
			accent-color: var(--primary, #2563eb);

			&::before {
				content: '';
				position: absolute;
				top: 50%;
				left: 0;
				right: 0;
				height: 0.25rem;
				transform: translateY(-50%);
				border-radius: 999px;
				background: linear-gradient(
					to right,
					var(--muted, #e5e7eb) 0%,
					var(--muted, #e5e7eb) var(--clip-min),
					var(--primary, #2563eb) var(--clip-min),
					var(--primary, #2563eb) var(--clip-max),
					var(--muted, #e5e7eb) var(--clip-max),
					var(--muted, #e5e7eb) 100%
				);
			}

			input[type='range'] {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 1.25rem;
				margin: 0;
				appearance: none;
				background: transparent;
				pointer-events: none;

				&::-webkit-slider-runnable-track {
					height: 0.25rem;
					background: transparent;
				}

				&::-moz-range-track {
					height: 0.25rem;
					background: transparent;
				}

				&::-webkit-slider-thumb {
					width: 1rem;
					height: 1rem;
					margin-top: -0.375rem;
					appearance: none;
					border: 0;
					border-radius: 50%;
					background: var(--primary, #2563eb);
					box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
					pointer-events: auto;
					cursor: pointer;
				}

				&::-moz-range-thumb {
					width: 1rem;
					height: 1rem;
					border: 0;
					border-radius: 50%;
					background: var(--primary, #2563eb);
					box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
					pointer-events: auto;
					cursor: pointer;
				}
			}

			input:first-child {
				z-index: 2;
			}

			input:last-child {
				z-index: 3;
			}
		}

		.color-field {
			align-items: flex-start;

			input[type='color'] {
				width: 3rem;
				height: 2.25rem;
				padding: 0.125rem;
				border: 1px solid var(--border, #d1d5db);
				border-radius: 0.25rem;
				background: var(--card, #ffffff);
				cursor: pointer;
			}
		}

		.axis-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
		}

		.axis-title,
		.axis-heading {
			font-size: 0.875rem;
			font-weight: 500;
		}

		.axis-heading {
			margin: 0;
		}

		.switch-field {
			position: relative;
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;
			cursor: pointer;
		}

		.switch-input {
			position: absolute;
			width: 1px;
			height: 1px;
			top: 50%;
			left: 0;
			opacity: 0;
		}

		.switch-track {
			display: inline-flex;
			align-items: center;
			width: 2.25rem;
			height: 1.375rem;
			padding: 0.125rem;
			border-radius: 999px;
			background-color: var(--muted, #d1d5db);
			transition: background-color 0.15s ease;
		}

		.switch-thumb {
			width: 1.125rem;
			height: 1.125rem;
			border-radius: 50%;
			background-color: #ffffff;
			box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
			transition: transform 0.15s ease;
		}

		.switch-input:checked + .switch-track {
			background-color: var(--primary, #2563eb);
		}

		.switch-input:checked + .switch-track .switch-thumb {
			transform: translateX(0.875rem);
		}

		.switch-input:focus-visible + .switch-track {
			outline: 2px solid var(--ring, #2563eb);
			outline-offset: 2px;
		}

		.range-field {
			display: flex;
			flex-direction: column;
			gap: 0.3125rem;
			min-width: 0;
			font-size: 0.8125rem;
		}

		.checkbox-field {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;
			cursor: pointer;

			:global([data-slot='checkbox'][data-state='checked']) {
				border-color: #312c85;
				background-color: #312c85;
			}
		}

		.pair {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem;
		}

		.hint {
			font-size: 0.75rem;
			color: var(--muted-foreground, #6b7280);
		}
	}
</style>
