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
    import { untrack } from "svelte";
    import * as Select from "$lib/components/ui/select/index.js";
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { InfoTip } from "$lib/components/ui/info-tip/index.js";
    import CheckIcon from "@lucide/svelte/icons/check";
    import Undo2Icon from "@lucide/svelte/icons/undo-2";
    import OptionLabel from "./OptionLabel.svelte";
    import PlotSection from "./PlotSection.svelte";
    import PlotSlider from "./PlotSlider.svelte";
    import PlotTypeCards from "./PlotTypeCards.svelte";
    import PalettePicker from "@/components/palette/PalettePicker.svelte";
    import { addToast } from "@/stores/toasts";
    import type { ChartExplorerController } from "./ChartExplorerController.svelte";
    import {
        axisTitle,
        BASEMAP_DETAILS,
        BASEMAP_LAYERS,
        COLOUR_MODES,
        extentOf,
        INTERPOLATION_EXTENTS,
        makeAxisConfig,
        MAX_GRID_CELLS,
        MAX_SMOOTHNESS,
        MIN_GRID_CELLS,
        MIN_SMOOTHNESS,
        PLOT_TYPES,
        usesColourBands,
        usesXColumn,
        usesYColumn,
        usesZColumn,
        type PlotAxisConfig,
        type PlotConfig,
        type PlotContourConfig,
        type PlotHistogramConfig,
        type PlotInterpolationConfig,
        type PlotBasemapConfig,
        type PlotBasemapDetail,
        type PlotBasemapLayer,
        type PlotColourMode,
        type PlotInterpolationDomain,
        type PlotInterpolationExtent,
        type PlotInterpolationMethod,
        type PlotLineConfig,
        type PlotStyleConfig,
        type PlotType,
        type ColorScale
    } from "@/plots/plot-config";
    import { CROSS_SECTION_AXIS_LABEL, HISTOGRAM_AXIS_LABEL } from "@/plots/plot-data";
    import { scaleLengthsOf } from "@/plots/interpolation";
    import { DEFAULT_SOLID_PALETTE_ID, getColormap } from "@/colors/palettes";
    import { Utils } from "@/utils";
    import { t, type MessageKey } from "@/i18n";

    let { controller }: { controller: ChartExplorerController } = $props();

    /** Which axis a control edits. */
    type AxisName = "x" | "y" | "z";

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

    function patchBasemap(patch: Partial<PlotBasemapConfig>) {
        if (!draft) return;
        userEdited = true;
        draft = { ...draft, basemap: { ...draft.basemap, ...patch } };
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

        if (axis === "z") {
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
    const xFieldLabel = $derived.by(() => {
        if (draft?.type === "histogram") return $t("plot.panel.valueColumn");
        return $t("plot.panel.xAxis");
    });

    /**
     * The value of the "no colour column" entry. An empty string means "nothing
     * selected" to the select component, which is a different state, so the entry
     * needs a value of its own.
     */
    const NO_COLUMN = "__none__";

    function setAxisColumn(axis: AxisName, value: string) {
        if (!draft) return;
        userEdited = true;

        if (axis === "z" && (value === NO_COLUMN || !value)) {
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
            scale === "logarithmic" &&
            (min === undefined || max === undefined || min <= 0 || max <= 0 || max <= min)
        ) {
            addToast({
                key: "plot.panel.logNeedsPositiveRange",
                type: "error"
            });
        }

        patchAxis("z", { scale });
    }

    function interpolationMethodLabel(method: PlotInterpolationMethod): MessageKey {
        if (method === "delaunay-barycentric") return "plot.panel.methodDelaunay";
        return "plot.panel.methodBarnes";
    }

    const INTERPOLATION_DOMAINS: ReadonlyArray<PlotInterpolationDomain> = ["all", "sea", "land"];

    const DOMAIN_LABELS: Record<PlotInterpolationDomain, MessageKey> = {
        all: "plot.panel.domainAll",
        sea: "plot.panel.domainSea",
        land: "plot.panel.domainLand"
    };

    const DOMAIN_HINTS: Record<PlotInterpolationDomain, MessageKey> = {
        all: "plot.panel.domainAllHint",
        sea: "plot.panel.domainSeaHint",
        land: "plot.panel.domainLandHint"
    };

    const BASEMAP_LAYER_LABELS: Record<PlotBasemapLayer, MessageKey> = {
        auto: "plot.panel.basemapLayerAuto",
        none: "plot.panel.basemapLayerNone",
        coast: "plot.panel.basemapLayerCoast",
        land: "plot.panel.basemapLayerLand",
        borders: "plot.panel.basemapLayerBorders"
    };

    const BASEMAP_DETAIL_LABELS: Record<PlotBasemapDetail, MessageKey> = {
        auto: "plot.panel.basemapDetailAuto",
        "110m": "plot.panel.basemapDetail110m",
        "50m": "plot.panel.basemapDetail50m",
        "10m": "plot.panel.basemapDetail10m"
    };

    const EXTENT_LABELS: Record<PlotInterpolationExtent, MessageKey> = {
        near: "plot.panel.extentNear",
        hull: "plot.panel.extentHull",
        all: "plot.panel.extentAll"
    };

    const EXTENT_HINTS: Record<PlotInterpolationExtent, MessageKey> = {
        near: "plot.panel.extentNearHint",
        hull: "plot.panel.extentHullHint",
        all: "plot.panel.extentAllHint"
    };

    const COLOUR_MODE_LABELS: Record<PlotColourMode, MessageKey> = {
        auto: "plot.panel.colourModeAuto",
        continuous: "plot.panel.colourModeContinuous",
        bands: "plot.panel.colourModeBands"
    };

    /** The extents that the method of the draft can draw. Delaunay never draws outside the hull. */
    const extents = $derived(
        INTERPOLATION_EXTENTS.filter(
            (extent) => extent !== "all" || draft?.interpolation.method === "barnes"
        )
    );

    /** True when the draft is a map: then each length is one value in km. */
    const draftIsMap = $derived(!!draft && controller.isMapPlot(draft));

    /** The radius and the maximum distance of the draft, once a rebuild with its axes found the spacing. */
    const draftLengths = $derived.by(() => {
        if (!draft) return null;
        const auto = controller.autoLengthsOf(draft);
        if (!auto) return null;
        return scaleLengthsOf(draft.interpolation, auto, draftIsMap);
    });

    const autoGrid = $derived.by(() => {
        if (!draft) return null;
        return controller.autoGridCellsOf(draft);
    });

    /** The Barnes radius in words: one value in km on a map, one value per axis otherwise. */
    const radiusText = $derived.by(() => {
        if (!draftLengths) return $t("plot.panel.lengthAuto");
        const { radius } = draftLengths;
        if (draftIsMap) return $t("plot.panel.radiusKm", { value: formatLength(radius.x) });
        return $t("plot.panel.radiusAxes", {
            x: formatLength(radius.x),
            y: formatLength(radius.y)
        });
    });

    /** A length field: empty means automatic, which the model stores as null. */
    function lengthValue(value: string): number | null {
        const parsed = numberOrNull(value);
        if (parsed === null || parsed <= 0) return null;
        return parsed;
    }

    /** The placeholder of a length field: the automatic length, when the series is known. */
    function lengthPlaceholder(value: number | null | undefined): string {
        if (value === null || value === undefined) return $t("plot.panel.lengthAuto");
        return $t("plot.panel.lengthAutoValue", { value: formatLength(value) });
    }

    function formatLength(value: number): string {
        return Number(value.toPrecision(2)).toString();
    }

    /** The placeholder of a grid size field: the automatic size, when the series is known. */
    function gridPlaceholder(value: number | undefined): string {
        if (value === undefined) return $t("plot.panel.lengthAuto");
        return $t("plot.panel.lengthAutoValue", { value });
    }

    /** The name of an axis column for a length field, or the axis letter. */
    function axisName(axis: "x" | "y"): string {
        return draft?.[axis].column ?? axis.toUpperCase();
    }

    // -- value helpers -------------------------------------------------------

    /** An empty field means "auto", which the model stores as null. */
    function numberOrNull(value: string): number | null {
        if (value.trim() === "") return null;

        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        return parsed;
    }

    /** A grid size field: empty means automatic, which the model stores as null. */
    function gridCellsValue(value: string): number | null {
        const parsed = numberOrNull(value);
        if (parsed === null) return null;

        if (parsed < MIN_GRID_CELLS) {
            addToast({
                key: "plot.panel.inputTooLow",
                values: { min: MIN_GRID_CELLS },
                type: "error"
            });
            return MIN_GRID_CELLS;
        }

        if (parsed > MAX_GRID_CELLS) {
            addToast({
                key: "plot.panel.inputTooHigh",
                values: { max: MAX_GRID_CELLS },
                type: "error"
            });
            return MAX_GRID_CELLS;
        }

        return Math.round(parsed);
    }

    /** An empty field means "use the column name", which the model stores as null. */
    function textOrNull(value: string): string | null {
        if (value.trim() === "") return null;
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
        $t(
            PLOT_TYPES.find((type) => type.id === draft?.type)?.labelKey ??
                "plot.type.scatter.label"
        )
    );

    const bindingSummary = $derived.by(() => {
        if (!draft) return "";

        const none = $t("plot.summary.none");
        let x = draft.x.column ?? none;
        if (draft.type === "cross-section") x = $t("plot.summary.distance");

        if (draft.type === "histogram") {
            return $t("plot.summary.histogram", { column: x, count: draft.histogram.binCount });
        }

        const y = draft.y.column ?? none;
        let summary = `${x} × ${y}`;

        if (draft.type === "line") {
            if (draft.line.groupColumn) {
                summary = $t("plot.summary.line", { x, y, group: draft.line.groupColumn });
            }
            return summary;
        }

        if (draft.z?.column) summary += ` · ${draft.z.column}`;
        return summary;
    });

    /**
     * The palette the points take with no colour column: the stored one while it
     * is a single colour, and solid blue otherwise. A gradient stays stored, so
     * binding the colour column again brings it back.
     */
    const solidPalette = $derived.by(() => {
        const palette = draft?.style.palette;
        if (palette && getColormap(palette).solid) return palette;
        return DEFAULT_SOLID_PALETTE_ID;
    });

    /** Names the palette that the plot paints with, which is solid without a Z column. */
    const styleSummary = $derived.by(() => {
        if (!draft) return "";

        let palette = draft.style.palette;
        if (usesZColumn(draft.type) && !draft.z?.column) palette = solidPalette;

        return `${palette} · ${$t("plot.panel.pixels", { size: draft.style.pointRadius })}`;
    });

    const advancedAnalysisSummary = $derived.by(() => {
        if (draft && !usesZColumn(draft.type)) return $t("plot.summary.notForType");
        if (!draft?.z?.column) return $t("plot.summary.needsColour");
        if (!draft.interpolation.enabled && !draft.contour.enabled) return $t("common.off");

        const parts: string[] = [];
        if (draft.interpolation.enabled) {
            const method = $t(interpolationMethodLabel(draft.interpolation.method));
            if (usesColourBands(draft.interpolation)) {
                parts.push(
                    $t("plot.summary.methodBands", {
                        method,
                        count: draft.interpolation.bandCount
                    })
                );
            } else {
                parts.push(method);
            }
        }
        if (draft.contour.enabled) {
            parts.push($t("plot.summary.contourLines", { count: draft.contour.levelCount }));
        }
        return parts.join(" · ");
    });

    const paletteHint = $derived.by((): MessageKey => {
        if (draft?.type === "line") {
            if (draft.line.groupColumn) return "plot.panel.strokePalette";
            return "plot.panel.groupForColours";
        }
        if (draft?.type === "histogram") return "plot.panel.histogramPaletteHint";
        return "plot.panel.paletteHint";
    });

    const colorScaleError = $derived.by(() => {
        if (!draft?.z || draft.z.scale !== "logarithmic") return "";
        const min = draft.z.min ?? controller.series?.zRange?.min;
        const max = draft.z.max ?? controller.series?.zRange?.max;
        if (min === undefined || max === undefined) return $t("plot.panel.logNeedsPositiveData");
        if (!(min > 0) || !(max > 0) || !(max > min)) {
            return $t("plot.panel.logNeedsPositiveRange");
        }
        return "";
    });
</script>

{#if draft}
    <aside class="plot-config-panel">
        <PlotSection
            step={1}
            title={$t("plot.panel.step.type")}
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
            title={$t("plot.panel.step.bind")}
            summary={bindingSummary}
            open={openSection === 2}
            onOpenChange={(isOpen) => openConfigSection(2, isOpen)}
        >
            <div class="axis-group">
                <div class="axis-header">
                    <OptionLabel
                        text={xFieldLabel}
                        info={draft.type === "cross-section"
                            ? $t("plot.panel.xAxisSectionHint")
                            : $t("plot.panel.xAxisHint")}
                    />
                    <label class="switch-field">
                        <span>{$t("plot.panel.invert")}</span>
                        <input
                            type="checkbox"
                            class="switch-input"
                            checked={draft.x.reverse}
                            onchange={(event) =>
                                patchAxis("x", { reverse: event.currentTarget.checked })}
                            aria-label={$t("plot.panel.invertX")}
                        />
                        <span class="switch-track" aria-hidden="true"
                            ><span class="switch-thumb"></span></span
                        >
                    </label>
                </div>

                <div class="field">
                    {#if draft.type === "cross-section"}
                        <p class="fixed-value">{$t(CROSS_SECTION_AXIS_LABEL)}</p>
                    {:else}
                        <Select.Root
                            type="single"
                            value={draft.x.column ?? ""}
                            onValueChange={(value) => setAxisColumn("x", value)}
                        >
                            <Select.Trigger id="plotXColumn"
                                >{draft.x.column ||
                                    $t("visualisation.selectColumn")}</Select.Trigger
                            >
                            <Select.Content>
                                <Select.Group>
                                    <Select.Label
                                        >{$t("visualisation.availableColumns")}</Select.Label
                                    >
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
                        <span>{$t("plot.panel.min")}</span>
                        <Input
                            type="number"
                            value={draft.x.min ?? ""}
                            placeholder={$t("visualisation.auto")}
                            oninput={(event) =>
                                patchAxis("x", { min: numberOrNull(event.currentTarget.value) })}
                        />
                    </label>
                    <label class="range-field">
                        <span>{$t("plot.panel.max")}</span>
                        <Input
                            type="number"
                            value={draft.x.max ?? ""}
                            placeholder={$t("visualisation.auto")}
                            oninput={(event) =>
                                patchAxis("x", { max: numberOrNull(event.currentTarget.value) })}
                        />
                    </label>
                </div>
            </div>

            <div class="axis-group">
                <div class="axis-header">
                    <OptionLabel
                        text={$t("plot.panel.yAxis")}
                        info={usesYColumn(draft.type)
                            ? $t("plot.panel.yAxisHint")
                            : $t("plot.panel.yAxisCountHint")}
                    />
                    <label class="switch-field">
                        <span>{$t("plot.panel.invert")}</span>
                        <input
                            type="checkbox"
                            class="switch-input"
                            checked={draft.y.reverse}
                            onchange={(event) =>
                                patchAxis("y", { reverse: event.currentTarget.checked })}
                            aria-label={$t("plot.panel.invertY")}
                        />
                        <span class="switch-track" aria-hidden="true"
                            ><span class="switch-thumb"></span></span
                        >
                    </label>
                </div>

                <div class="field">
                    {#if !usesYColumn(draft.type)}
                        <p class="fixed-value">{$t("plot.panel.histogramCountHint")}</p>
                    {:else}
                        <Select.Root
                            type="single"
                            value={draft.y.column ?? ""}
                            onValueChange={(value) => setAxisColumn("y", value)}
                        >
                            <Select.Trigger id="plotYColumn"
                                >{draft.y.column ||
                                    $t("visualisation.selectColumn")}</Select.Trigger
                            >
                            <Select.Content>
                                <Select.Group>
                                    <Select.Label
                                        >{$t("visualisation.availableColumns")}</Select.Label
                                    >
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
                        <span>{$t("plot.panel.min")}</span>
                        <Input
                            type="number"
                            value={draft.y.min ?? ""}
                            placeholder={$t("visualisation.auto")}
                            oninput={(event) =>
                                patchAxis("y", { min: numberOrNull(event.currentTarget.value) })}
                        />
                    </label>
                    <label class="range-field">
                        <span>{$t("plot.panel.max")}</span>
                        <Input
                            type="number"
                            value={draft.y.max ?? ""}
                            placeholder={$t("visualisation.auto")}
                            oninput={(event) =>
                                patchAxis("y", { max: numberOrNull(event.currentTarget.value) })}
                        />
                    </label>
                </div>
            </div>

            {#if draft.type === "line"}
                <div class="field">
                    <OptionLabel
                        for="plotGroupColumn"
                        text={$t("plot.panel.groupBy")}
                        info={$t("plot.panel.groupHint")}
                    />
                    <Select.Root
                        type="single"
                        value={draft.line.groupColumn ?? NO_COLUMN}
                        onValueChange={setGroupColumn}
                    >
                        <Select.Trigger id="plotGroupColumn">
                            {draft.line.groupColumn || $t("plot.panel.oneStroke")}
                        </Select.Trigger>
                        <Select.Content>
                            <Select.Group>
                                <Select.Item value={NO_COLUMN} label={$t("common.none")}
                                    >{$t("plot.panel.oneStroke")}</Select.Item
                                >
                                {#each controller.groupColumns as column (column.name)}
                                    <Select.Item value={column.name} label={column.name}>
                                        {column.name}
                                    </Select.Item>
                                {/each}
                            </Select.Group>
                        </Select.Content>
                    </Select.Root>
                </div>
            {/if}

            {#if usesZColumn(draft.type)}
                <div class="axis-group z-group">
                    <h4 class="axis-heading">{$t("plot.panel.zAxis")}</h4>
                    <div class="field">
                        <OptionLabel
                            for="plotZColumn"
                            text={$t("plot.panel.colourColumn")}
                            info={$t("plot.panel.colourColumnHint")}
                        />
                        <Select.Root
                            type="single"
                            value={draft.z?.column ?? NO_COLUMN}
                            onValueChange={(value) => setAxisColumn("z", value)}
                        >
                            <Select.Trigger id="plotZColumn"
                                >{draft.z?.column || $t("common.none")}</Select.Trigger
                            >
                            <Select.Content>
                                <Select.Group>
                                    <Select.Item value={NO_COLUMN} label={$t("common.none")}
                                        >{$t("common.none")}</Select.Item
                                    >
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

            {#if draft.type === "histogram"}
                <PlotSlider
                    id="histogramBins"
                    label={$t("plot.panel.bins")}
                    info={$t("plot.panel.binsHint")}
                    min={2}
                    max={120}
                    step={1}
                    value={draft.histogram.binCount}
                    onCommit={(value) => patchHistogram({ binCount: value })}
                />
            {/if}
        </PlotSection>

        <PlotSection
            step={3}
            title={$t("plot.panel.step.properties")}
            summary={styleSummary}
            open={openSection === 3}
            onOpenChange={(isOpen) => openConfigSection(3, isOpen)}
        >
            <details class="property-subsection" open>
                <summary>{$t("plot.panel.titlesAndLabels")}</summary>
                <div class="subsection-body">
                    <div class="property-row">
                        <div class="field">
                            <OptionLabel
                                for="plotTitle"
                                text={$t("plot.panel.plotTitle")}
                                info={$t("plot.panel.plotTitleHint")}
                            />
                            <Input
                                id="plotTitle"
                                type="text"
                                value={draft.title}
                                placeholder={$t("plot.panel.noTitle")}
                                oninput={(event) =>
                                    patchDraft({ title: event.currentTarget.value })}
                            />
                        </div>
                        <div class="field">
                            <OptionLabel
                                for="plotTitleSize"
                                text={$t("plot.panel.titleSize")}
                                info={$t("plot.panel.titleSizeHint")}
                            />
                            <Select.Root
                                type="single"
                                value={String(draft.style.titleFontSize)}
                                onValueChange={(value) =>
                                    patchStyle({ titleFontSize: Number(value) })}
                            >
                                <Select.Trigger id="plotTitleSize"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.style.titleFontSize
                                    })}</Select.Trigger
                                >
                                <Select.Content>
                                    <Select.Group>
                                        {#each sizeOptions(8, 40) as size (size)}
                                            <Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >
                                        {/each}
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </div>

                        <div class="option-row">
                            <label class="checkbox-field">
                                <Checkbox
                                    checked={draft.style.showCaption}
                                    onCheckedChange={(checked) =>
                                        patchStyle({ showCaption: !!checked })}
                                />
                                <span>{$t("plot.panel.showCaption")}</span>
                            </label>
                            <InfoTip
                                label={$t("plot.panel.about", {
                                    option: $t("plot.panel.showCaption")
                                })}
                                text={$t("plot.panel.showCaptionHint")}
                            />
                        </div>
                    </div>

                    <div class="property-row">
                        <div class="field">
                            <OptionLabel
                                for="plotXAxisLabel"
                                text={$t("plot.panel.xAxisLabel")}
                                info={$t("plot.panel.xAxisLabelHint")}
                            /><Input
                                id="plotXAxisLabel"
                                type="text"
                                value={draft.x.label ?? ""}
                                placeholder={draft.type === "cross-section"
                                    ? $t(CROSS_SECTION_AXIS_LABEL)
                                    : (draft.x.column ?? $t("plot.panel.columnName"))}
                                oninput={(event) =>
                                    patchAxis("x", {
                                        label: textOrNull(event.currentTarget.value)
                                    })}
                            />
                        </div>
                        <div class="field">
                            <OptionLabel
                                for="plotXAxisTitleSize"
                                text={$t("plot.panel.size")}
                                info={$t("plot.panel.xAxisLabelSizeHint")}
                            /><Select.Root
                                type="single"
                                value={String(draft.style.xAxisTitleFontSize)}
                                onValueChange={(value) =>
                                    patchStyle({ xAxisTitleFontSize: Number(value) })}
                                ><Select.Trigger id="plotXAxisTitleSize"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.style.xAxisTitleFontSize
                                    })}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        >{#each sizeOptions(6, 32) as size (size)}<Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >{/each}</Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                    </div>
                    <div class="property-row">
                        <div class="field">
                            <OptionLabel
                                for="plotYAxisLabel"
                                text={$t("plot.panel.yAxisLabel")}
                                info={$t("plot.panel.yAxisLabelHint")}
                            /><Input
                                id="plotYAxisLabel"
                                type="text"
                                value={draft.y.label ?? ""}
                                placeholder={draft.type === "histogram"
                                    ? $t(HISTOGRAM_AXIS_LABEL)
                                    : (draft.y.column ?? $t("plot.panel.columnName"))}
                                oninput={(event) =>
                                    patchAxis("y", {
                                        label: textOrNull(event.currentTarget.value)
                                    })}
                            />
                        </div>
                        <div class="field">
                            <OptionLabel
                                for="plotYAxisTitleSize"
                                text={$t("plot.panel.size")}
                                info={$t("plot.panel.yAxisLabelSizeHint")}
                            /><Select.Root
                                type="single"
                                value={String(draft.style.yAxisTitleFontSize)}
                                onValueChange={(value) =>
                                    patchStyle({ yAxisTitleFontSize: Number(value) })}
                                ><Select.Trigger id="plotYAxisTitleSize"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.style.yAxisTitleFontSize
                                    })}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        >{#each sizeOptions(6, 32) as size (size)}<Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >{/each}</Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                    </div>
                    <div class="property-row">
                        <div class="field">
                            <OptionLabel
                                for="plotLegendTitle"
                                text={$t("plot.panel.legend")}
                                info={$t("plot.panel.legendHint")}
                            /><Input
                                id="plotLegendTitle"
                                type="text"
                                value={draft.style.legendTitle}
                                placeholder={$t("plot.panel.legendDefault")}
                                oninput={(event) =>
                                    patchStyle({ legendTitle: event.currentTarget.value })}
                            />
                        </div>
                        <div class="field">
                            <OptionLabel
                                for="plotLegendTitleSize"
                                text={$t("plot.panel.size")}
                                info={$t("plot.panel.legendSizeHint")}
                            /><Select.Root
                                type="single"
                                value={String(draft.style.legendTitleFontSize)}
                                onValueChange={(value) =>
                                    patchStyle({ legendTitleFontSize: Number(value) })}
                                ><Select.Trigger id="plotLegendTitleSize"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.style.legendTitleFontSize
                                    })}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        >{#each sizeOptions(6, 32) as size (size)}<Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >{/each}</Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                    </div>
                    <div class="field">
                        <OptionLabel
                            for="plotTickSize"
                            text={$t("plot.panel.tickSize")}
                            info={$t("plot.panel.tickSizeHint")}
                        /><Select.Root
                            type="single"
                            value={String(draft.style.tickFontSize)}
                            onValueChange={(value) => patchStyle({ tickFontSize: Number(value) })}
                            ><Select.Trigger id="plotTickSize"
                                >{$t("plot.panel.pixels", {
                                    size: draft.style.tickFontSize
                                })}</Select.Trigger
                            ><Select.Content
                                ><Select.Group
                                    >{#each sizeOptions(6, 32) as size (size)}<Select.Item
                                            value={String(size)}
                                            label={$t("plot.panel.pixels", { size })}
                                            >{$t("plot.panel.pixels", { size })}</Select.Item
                                        >{/each}</Select.Group
                                ></Select.Content
                            ></Select.Root
                        >
                    </div>
                </div>
            </details>

            <details class="property-subsection" open>
                <summary>{$t("plot.panel.dataAndColor")}</summary>
                <div class="subsection-body">
                    {#if draft.type === "line" || draft.type === "histogram" || draft.z?.column}
                        <div class="field">
                            <OptionLabel
                                for="plotPalette"
                                text={$t("palette.label")}
                                info={$t(paletteHint)}
                            /><PalettePicker
                                id="plotPalette"
                                value={draft.style.palette}
                                reverse={draft.z?.column ? draft.z.reverse : false}
                                onSelect={(id) => patchStyle({ palette: id })}
                            />
                        </div>
                    {:else}<div class="field">
                            <OptionLabel
                                for="plotPointColor"
                                text={$t("plot.panel.pointColour")}
                                info={$t("plot.panel.pointColourHint")}
                            /><PalettePicker
                                id="plotPointColor"
                                value={solidPalette}
                                showGradients={false}
                                onSelect={(id) => patchStyle({ palette: id })}
                            />
                        </div>{/if}
                    {#if draft.z?.column}
                        <div class="option-row">
                            <label class="checkbox-field"
                                ><Checkbox
                                    checked={draft.z.reverse}
                                    onCheckedChange={(checked) =>
                                        patchAxis("z", { reverse: !!checked })}
                                /><span>{$t("palette.reverse")}</span></label
                            ><InfoTip
                                label={$t("plot.panel.about", { option: $t("palette.reverse") })}
                                text={$t("plot.panel.reversePaletteHint")}
                            />
                        </div>
                        <div class="field">
                            <OptionLabel
                                id="zRangeLabel"
                                text={$t("plot.panel.colourRange", { axis: axisTitle(draft.z) })}
                                info={$t("plot.panel.colourRangeHint")}
                            />
                            <div class="pair" role="group" aria-labelledby="zRangeLabel">
                                <Input
                                    type="number"
                                    value={draft.z.min ?? ""}
                                    placeholder={$t("visualisation.auto")}
                                    oninput={(event) =>
                                        patchAxis("z", {
                                            min: numberOrNull(event.currentTarget.value)
                                        })}
                                /><Input
                                    type="number"
                                    value={draft.z.max ?? ""}
                                    placeholder={$t("visualisation.auto")}
                                    oninput={(event) =>
                                        patchAxis("z", {
                                            max: numberOrNull(event.currentTarget.value)
                                        })}
                                />
                            </div>
                        </div>
                        <div class="field">
                            <OptionLabel
                                for="plotColorScale"
                                text={$t("plot.panel.colorScale")}
                                info={$t("plot.panel.colorScaleHint")}
                            /><Select.Root
                                type="single"
                                value={draft.z.scale}
                                onValueChange={(value) => setColorScale(value as ColorScale)}
                                ><Select.Trigger id="plotColorScale"
                                    >{draft.z.scale === "logarithmic"
                                        ? $t("plot.panel.scaleLogarithmic")
                                        : $t("plot.panel.scaleLinear")}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        ><Select.Item
                                            value="linear"
                                            label={$t("plot.panel.scaleLinear")}
                                            >{$t("plot.panel.scaleLinear")}</Select.Item
                                        ><Select.Item
                                            value="logarithmic"
                                            label={$t("plot.panel.scaleLogarithmic")}
                                            >{$t("plot.panel.scaleLogarithmic")}</Select.Item
                                        ></Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                        {#if colorScaleError}<p class="scale-error" role="alert">
                                {colorScaleError}
                            </p>{/if}
                    {/if}
                </div>
            </details>

            <details class="property-subsection" open>
                <summary>{$t("plot.panel.markers")}</summary>
                <div class="subsection-body">
                    {#if draft.type === "line"}
                        <div class="field">
                            <OptionLabel
                                for="plotLineSort"
                                text={$t("plot.panel.drawAlong")}
                                info={$t("plot.panel.drawAlongHint")}
                            /><Select.Root
                                type="single"
                                value={draft.line.sortBy}
                                onValueChange={(value) =>
                                    patchLine({ sortBy: value === "y" ? "y" : "x" })}
                                ><Select.Trigger id="plotLineSort"
                                    >{draft.line.sortBy === "y"
                                        ? $t("plot.panel.alongY")
                                        : $t("plot.panel.alongX")}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        ><Select.Item value="x" label={$t("plot.panel.alongX")}
                                            >{$t("plot.panel.alongX")}</Select.Item
                                        ><Select.Item value="y" label={$t("plot.panel.alongY")}
                                            >{$t("plot.panel.alongY")}</Select.Item
                                        ></Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                        <div class="option-row">
                            <label class="checkbox-field"
                                ><Checkbox
                                    checked={draft.line.showPoints}
                                    onCheckedChange={(checked) =>
                                        patchLine({ showPoints: !!checked })}
                                /><span>{$t("plot.panel.markRows")}</span></label
                            ><InfoTip
                                label={$t("plot.panel.about", {
                                    option: $t("plot.panel.markRows")
                                })}
                                text={$t("plot.panel.markRowsHint")}
                            />
                        </div>
                    {:else if draft.type !== "histogram"}<div class="option-row">
                            <label class="checkbox-field"
                                ><Checkbox
                                    checked={draft.style.showPoints}
                                    onCheckedChange={(checked) =>
                                        patchStyle({ showPoints: !!checked })}
                                /><span>{$t("plot.panel.drawPoints")}</span></label
                            ><InfoTip
                                label={$t("plot.panel.about", {
                                    option: $t("plot.panel.drawPoints")
                                })}
                                text={$t("plot.panel.drawPointsHint")}
                            />
                        </div>{/if}
                    {#if draft.type !== "histogram" && (draft.type === "line" ? draft.line.showPoints : draft.style.showPoints)}
                        <div class="field">
                            <OptionLabel
                                for="plotPointRadius"
                                text={$t("plot.panel.markerSize")}
                                info={$t("plot.panel.markerSizeHint")}
                            /><Select.Root
                                type="single"
                                value={String(draft.style.pointRadius)}
                                onValueChange={(value) =>
                                    patchStyle({ pointRadius: Number(value) })}
                                ><Select.Trigger id="plotPointRadius"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.style.pointRadius
                                    })}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        >{#each sizeOptions(0.5, 12, 0.5) as size (size)}<Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >{/each}</Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>
                    {/if}
                    <PlotSlider
                        id="plotPointOpacity"
                        label={$t("plot.panel.markerOpacity")}
                        info={$t("plot.panel.markerOpacityHint")}
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={draft.style.pointOpacity}
                        onCommit={(value) => patchStyle({ pointOpacity: value })}
                    />
                </div>
            </details>

            {#if draft.type === "scatter"}
                <details class="property-subsection" open>
                    <summary>{$t("plot.panel.basemap")}</summary>
                    <div class="subsection-body">
                        {#if controller.isMapPlot(draft)}
                            <div class="field">
                                <OptionLabel
                                    for="basemapLayer"
                                    text={$t("plot.panel.basemapLayers")}
                                    info={$t("plot.panel.basemapLayersHint")}
                                />
                                <Select.Root
                                    type="single"
                                    value={draft.basemap.layer}
                                    onValueChange={(value) =>
                                        patchBasemap({ layer: value as PlotBasemapLayer })}
                                >
                                    <Select.Trigger id="basemapLayer">
                                        {$t(BASEMAP_LAYER_LABELS[draft.basemap.layer])}
                                    </Select.Trigger>
                                    <Select.Content>
                                        <Select.Group>
                                            {#each BASEMAP_LAYERS as layer (layer)}
                                                <Select.Item
                                                    value={layer}
                                                    label={$t(BASEMAP_LAYER_LABELS[layer])}
                                                >
                                                    {$t(BASEMAP_LAYER_LABELS[layer])}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                            <div class="field">
                                <OptionLabel
                                    for="basemapDetail"
                                    text={$t("plot.panel.basemapDetail")}
                                    info={$t("plot.panel.basemapDetailHint")}
                                />
                                <Select.Root
                                    type="single"
                                    value={draft.basemap.detail}
                                    onValueChange={(value) =>
                                        patchBasemap({ detail: value as PlotBasemapDetail })}
                                >
                                    <Select.Trigger id="basemapDetail">
                                        {$t(BASEMAP_DETAIL_LABELS[draft.basemap.detail])}
                                    </Select.Trigger>
                                    <Select.Content>
                                        <Select.Group>
                                            {#each BASEMAP_DETAILS as detail (detail)}
                                                <Select.Item
                                                    value={detail}
                                                    label={$t(BASEMAP_DETAIL_LABELS[detail])}
                                                >
                                                    {$t(BASEMAP_DETAIL_LABELS[detail])}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                            <div class="option-row">
                                <label class="checkbox-field">
                                    <Checkbox
                                        checked={draft.basemap.fixAspect}
                                        onCheckedChange={(checked) =>
                                            patchBasemap({ fixAspect: !!checked })}
                                    />
                                    <span>{$t("plot.panel.keepMapShape")}</span>
                                </label>
                                <InfoTip
                                    label={$t("plot.panel.about", {
                                        option: $t("plot.panel.keepMapShape")
                                    })}
                                    text={$t("plot.panel.keepMapShapeHint")}
                                />
                            </div>
                        {:else}
                            <p class="hint">{$t("plot.panel.basemapNeedsMap")}</p>
                        {/if}
                    </div>
                </details>
            {/if}

            <details class="property-subsection" open>
                <summary>{$t("plot.panel.canvas")}</summary>
                <div class="subsection-body">
                    <div class="option-row">
                        <label class="checkbox-field"
                            ><Checkbox
                                checked={draft.style.gridlines}
                                onCheckedChange={(checked) => patchStyle({ gridlines: !!checked })}
                            /><span>{$t("plot.panel.showGridlines")}</span></label
                        ><InfoTip
                            label={$t("plot.panel.about", {
                                option: $t("plot.panel.showGridlines")
                            })}
                            text={$t("plot.panel.showGridlinesHint")}
                        />
                    </div>
                    <div class="field color-field">
                        <OptionLabel
                            for="plotBackgroundColour"
                            text={$t("plot.panel.backgroundColor")}
                            info={$t("plot.panel.backgroundColorHint")}
                        /><input
                            id="plotBackgroundColour"
                            type="color"
                            value={draft.style.backgroundColor}
                            aria-label={$t("plot.panel.backgroundColor")}
                            onchange={(event) =>
                                patchStyle({ backgroundColor: event.currentTarget.value })}
                        />
                    </div>
                    <div class="field color-field">
                        <OptionLabel
                            for="plotTextColour"
                            text={$t("plot.panel.textColor")}
                            info={$t("plot.panel.textColorHint")}
                        /><input
                            id="plotTextColour"
                            type="color"
                            value={draft.style.textColor}
                            aria-label={$t("plot.panel.textColor")}
                            onchange={(event) =>
                                patchStyle({ textColor: event.currentTarget.value })}
                        />
                    </div>
                    <div class="field color-field">
                        <OptionLabel
                            for="plotGridlineColour"
                            text={$t("plot.panel.gridlineColor")}
                            info={$t("plot.panel.gridlineColorHint")}
                        /><input
                            id="plotGridlineColour"
                            type="color"
                            value={draft.style.gridlineColor}
                            aria-label={$t("plot.panel.gridlineColor")}
                            onchange={(event) =>
                                patchStyle({ gridlineColor: event.currentTarget.value })}
                        />
                    </div>
                    <PlotSlider
                        id="plotGridlineOpacity"
                        label={$t("plot.panel.gridlineOpacity")}
                        info={$t("plot.panel.gridlineOpacityHint")}
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
            title={$t("plot.panel.step.analysis")}
            summary={advancedAnalysisSummary}
            open={openSection === 4}
            onOpenChange={(isOpen) => openConfigSection(4, isOpen)}
        >
            {#if !usesZColumn(draft.type)}
                <p class="hint">
                    {draft.type === "line"
                        ? $t("plot.panel.noContoursLine")
                        : $t("plot.panel.noContoursHistogram")}
                </p>
            {:else if !draft.z?.column}
                <p class="hint">{$t("plot.panel.contoursNeedColour")}</p>
            {:else}
                <details class="analysis-subsection">
                    <summary class="analysis-header">
                        <span>{$t("plot.panel.gridding")}</span>
                    </summary>

                    <div class="analysis-body">
                        <div class="option-row">
                            <OptionLabel
                                for="interpolationEnabled"
                                text={$t("plot.panel.interpolate")}
                                info={$t("plot.panel.interpolateHint")}
                            />
                            <label class="switch-field">
                                <input
                                    id="interpolationEnabled"
                                    type="checkbox"
                                    class="switch-input"
                                    checked={draft.interpolation.enabled}
                                    onchange={(event) =>
                                        patchInterpolation({
                                            enabled: event.currentTarget.checked
                                        })}
                                    aria-label={$t("plot.panel.interpolate")}
                                />
                                <span class="switch-track" aria-hidden="true"
                                    ><span class="switch-thumb"></span></span
                                >
                            </label>
                        </div>

                        <div class="field">
                            <OptionLabel
                                for="interpolationMethod"
                                text={$t("plot.panel.method")}
                                info={draft.interpolation.method === "delaunay-barycentric"
                                    ? $t("plot.panel.delaunayHint")
                                    : $t("plot.panel.barnesHint")}
                            />
                            <Select.Root
                                type="single"
                                value={draft.interpolation.method}
                                onValueChange={(value) =>
                                    patchInterpolation({
                                        method: value as PlotInterpolationMethod
                                    })}
                            >
                                <Select.Trigger id="interpolationMethod">
                                    {$t(interpolationMethodLabel(draft.interpolation.method))}
                                </Select.Trigger>
                                <Select.Content>
                                    <Select.Group>
                                        <Select.Item
                                            value="barnes"
                                            label={$t("plot.panel.methodBarnes")}
                                        >
                                            {$t("plot.panel.methodBarnes")}
                                        </Select.Item>
                                        <Select.Item
                                            value="delaunay-barycentric"
                                            label={$t("plot.panel.methodDelaunay")}
                                        >
                                            {$t("plot.panel.methodDelaunay")}
                                        </Select.Item>
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </div>

                        {#if draft.interpolation.method === "barnes"}
                            {#if draft.interpolation.scaleLength === null && draft.interpolation.scaleLengthY === null}
                                <PlotSlider
                                    id="interpolationSmoothness"
                                    label={$t("plot.panel.smoothness")}
                                    info={$t("plot.panel.smoothnessHint")}
                                    min={MIN_SMOOTHNESS}
                                    max={MAX_SMOOTHNESS}
                                    step={0.5}
                                    value={draft.interpolation.smoothness}
                                    display={radiusText}
                                    minLabel={$t("plot.panel.smoothnessDetail")}
                                    maxLabel={$t("plot.panel.smoothnessSmooth")}
                                    onCommit={(value) => patchInterpolation({ smoothness: value })}
                                />
                            {:else}
                                <p class="hint">{$t("plot.panel.radiusExact")}</p>
                            {/if}
                        {/if}

                        <div class="field">
                            <OptionLabel
                                for="interpolationExtent"
                                text={$t("plot.panel.extent")}
                                info={$t(EXTENT_HINTS[extentOf(draft.interpolation)])}
                            />
                            <Select.Root
                                type="single"
                                value={extentOf(draft.interpolation)}
                                onValueChange={(value) =>
                                    patchInterpolation({
                                        extent: value as PlotInterpolationExtent
                                    })}
                            >
                                <Select.Trigger id="interpolationExtent">
                                    {$t(EXTENT_LABELS[extentOf(draft.interpolation)])}
                                </Select.Trigger>
                                <Select.Content>
                                    <Select.Group>
                                        {#each extents as extent (extent)}
                                            <Select.Item
                                                value={extent}
                                                label={$t(EXTENT_LABELS[extent])}
                                            >
                                                {$t(EXTENT_LABELS[extent])}
                                            </Select.Item>
                                        {/each}
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </div>

                        {#if extentOf(draft.interpolation) === "near"}
                            {#if draftIsMap}
                                <div class="range-field">
                                    <OptionLabel
                                        for="interpolationDistance"
                                        text={$t("plot.panel.maxDistanceKm")}
                                        info={$t("plot.panel.maxDistanceHint")}
                                    />
                                    <Input
                                        id="interpolationDistance"
                                        type="number"
                                        min={0}
                                        step="any"
                                        value={draft.interpolation.maxDistance ?? ""}
                                        placeholder={lengthPlaceholder(draftLengths?.maxDistance.x)}
                                        onchange={(event) =>
                                            patchInterpolation({
                                                maxDistance: lengthValue(event.currentTarget.value)
                                            })}
                                    />
                                </div>
                            {:else}
                                <div class="field">
                                    <OptionLabel
                                        text={$t("plot.panel.maxDistance")}
                                        info={$t("plot.panel.maxDistanceHint")}
                                    />
                                    <div
                                        class="pair"
                                        role="group"
                                        aria-label={$t("plot.panel.maxDistance")}
                                    >
                                        <label class="range-field" for="interpolationDistanceX">
                                            <span>{axisName("x")}</span>
                                            <Input
                                                id="interpolationDistanceX"
                                                type="number"
                                                min={0}
                                                step="any"
                                                value={draft.interpolation.maxDistance ?? ""}
                                                placeholder={lengthPlaceholder(
                                                    draftLengths?.maxDistance.x
                                                )}
                                                onchange={(event) =>
                                                    patchInterpolation({
                                                        maxDistance: lengthValue(
                                                            event.currentTarget.value
                                                        )
                                                    })}
                                            />
                                        </label>
                                        <label class="range-field" for="interpolationDistanceY">
                                            <span>{axisName("y")}</span>
                                            <Input
                                                id="interpolationDistanceY"
                                                type="number"
                                                min={0}
                                                step="any"
                                                value={draft.interpolation.maxDistanceY ?? ""}
                                                placeholder={lengthPlaceholder(
                                                    draftLengths?.maxDistance.y
                                                )}
                                                onchange={(event) =>
                                                    patchInterpolation({
                                                        maxDistanceY: lengthValue(
                                                            event.currentTarget.value
                                                        )
                                                    })}
                                            />
                                        </label>
                                    </div>
                                </div>
                            {/if}
                        {/if}

                        {#if draftIsMap}
                            <div class="field">
                                <OptionLabel
                                    for="interpolationDomain"
                                    text={$t("plot.panel.domain")}
                                    info={$t(DOMAIN_HINTS[draft.interpolation.domain])}
                                />
                                <Select.Root
                                    type="single"
                                    value={draft.interpolation.domain}
                                    onValueChange={(value) =>
                                        patchInterpolation({
                                            domain: value as PlotInterpolationDomain
                                        })}
                                >
                                    <Select.Trigger id="interpolationDomain">
                                        {$t(DOMAIN_LABELS[draft.interpolation.domain])}
                                    </Select.Trigger>
                                    <Select.Content>
                                        <Select.Group>
                                            {#each INTERPOLATION_DOMAINS as domain (domain)}
                                                <Select.Item
                                                    value={domain}
                                                    label={$t(DOMAIN_LABELS[domain])}
                                                >
                                                    {$t(DOMAIN_LABELS[domain])}
                                                </Select.Item>
                                            {/each}
                                        </Select.Group>
                                    </Select.Content>
                                </Select.Root>
                            </div>
                        {:else}
                            <p class="hint">{$t("plot.panel.domainNeedsMap")}</p>
                        {/if}

                        <div class="field">
                            <OptionLabel
                                for="interpolationColours"
                                text={$t("plot.panel.colourMode")}
                                info={$t("plot.panel.colourModeHint")}
                            />
                            <Select.Root
                                type="single"
                                value={draft.interpolation.colourMode}
                                onValueChange={(value) =>
                                    patchInterpolation({ colourMode: value as PlotColourMode })}
                            >
                                <Select.Trigger id="interpolationColours">
                                    {$t(COLOUR_MODE_LABELS[draft.interpolation.colourMode])}
                                </Select.Trigger>
                                <Select.Content>
                                    <Select.Group>
                                        {#each COLOUR_MODES as mode (mode)}
                                            <Select.Item
                                                value={mode}
                                                label={$t(COLOUR_MODE_LABELS[mode])}
                                            >
                                                {$t(COLOUR_MODE_LABELS[mode])}
                                            </Select.Item>
                                        {/each}
                                    </Select.Group>
                                </Select.Content>
                            </Select.Root>
                        </div>

                        {#if usesColourBands(draft.interpolation)}
                            <PlotSlider
                                id="interpolationBands"
                                label={$t("plot.panel.colourBands")}
                                info={$t("plot.panel.colourBandsHint")}
                                min={2}
                                max={50}
                                step={1}
                                value={draft.interpolation.bandCount}
                                onCommit={(value) => patchInterpolation({ bandCount: value })}
                            />
                        {/if}

                        <div class="clip-range field">
                            <div class="clip-range-header">
                                <OptionLabel
                                    text={$t("plot.panel.clipLimits")}
                                    info={$t("plot.panel.clipLimitsHint")}
                                /><span
                                    >{draft.interpolation.percentileMin}% - {draft.interpolation
                                        .percentileMax}%</span
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
                                    aria-label={$t("plot.panel.clipMin")}
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
                                    aria-label={$t("plot.panel.clipMax")}
                                />
                            </div>
                            <div class="clip-range-labels">
                                <span>{draft.interpolation.percentileMin}%</span><span
                                    >{draft.interpolation.percentileMax}%</span
                                >
                            </div>
                        </div>

                        <details class="advanced-settings">
                            <summary>{$t("plot.panel.advanced")}</summary>
                            <div class="advanced-body">
                                {#if draft.interpolation.method === "barnes"}
                                    {#if draftIsMap}
                                        <div class="range-field">
                                            <OptionLabel
                                                for="interpolationRadius"
                                                text={$t("plot.panel.radiusExactKm")}
                                                info={$t("plot.panel.exactRadiusHint")}
                                            />
                                            <Input
                                                id="interpolationRadius"
                                                type="number"
                                                min={0}
                                                step="any"
                                                value={draft.interpolation.scaleLength ?? ""}
                                                placeholder={lengthPlaceholder(
                                                    draftLengths?.radius.x
                                                )}
                                                onchange={(event) =>
                                                    patchInterpolation({
                                                        scaleLength: lengthValue(
                                                            event.currentTarget.value
                                                        )
                                                    })}
                                            />
                                        </div>
                                    {:else}
                                        <div class="field">
                                            <OptionLabel
                                                text={$t("plot.panel.radiusExactAxes")}
                                                info={$t("plot.panel.exactRadiusHint")}
                                            />
                                            <div
                                                class="pair"
                                                role="group"
                                                aria-label={$t("plot.panel.radiusExactAxes")}
                                            >
                                                <label
                                                    class="range-field"
                                                    for="interpolationRadiusX"
                                                >
                                                    <span>{axisName("x")}</span>
                                                    <Input
                                                        id="interpolationRadiusX"
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        value={draft.interpolation.scaleLength ??
                                                            ""}
                                                        placeholder={lengthPlaceholder(
                                                            draftLengths?.radius.x
                                                        )}
                                                        onchange={(event) =>
                                                            patchInterpolation({
                                                                scaleLength: lengthValue(
                                                                    event.currentTarget.value
                                                                )
                                                            })}
                                                    />
                                                </label>
                                                <label
                                                    class="range-field"
                                                    for="interpolationRadiusY"
                                                >
                                                    <span>{axisName("y")}</span>
                                                    <Input
                                                        id="interpolationRadiusY"
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        value={draft.interpolation.scaleLengthY ??
                                                            ""}
                                                        placeholder={lengthPlaceholder(
                                                            draftLengths?.radius.y
                                                        )}
                                                        onchange={(event) =>
                                                            patchInterpolation({
                                                                scaleLengthY: lengthValue(
                                                                    event.currentTarget.value
                                                                )
                                                            })}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    {/if}
                                {/if}

                                <div class="field">
                                    <OptionLabel
                                        text={$t("plot.panel.gridResolution")}
                                        info={$t("plot.panel.gridResolutionHint")}
                                    />
                                    <div
                                        class="pair"
                                        role="group"
                                        aria-label={$t("plot.panel.gridResolution")}
                                    >
                                        <label class="range-field" for="interpolationGridX">
                                            <span>x:</span>
                                            <Input
                                                id="interpolationGridX"
                                                type="number"
                                                min={MIN_GRID_CELLS}
                                                max={MAX_GRID_CELLS}
                                                step={1}
                                                value={draft.interpolation.xGridCells ?? ""}
                                                placeholder={gridPlaceholder(autoGrid?.x)}
                                                onchange={(event) =>
                                                    patchInterpolation({
                                                        xGridCells: gridCellsValue(
                                                            event.currentTarget.value
                                                        )
                                                    })}
                                            />
                                        </label>
                                        <label class="range-field" for="interpolationGridY">
                                            <span>y:</span>
                                            <Input
                                                id="interpolationGridY"
                                                type="number"
                                                min={MIN_GRID_CELLS}
                                                max={MAX_GRID_CELLS}
                                                step={1}
                                                value={draft.interpolation.yGridCells ?? ""}
                                                placeholder={gridPlaceholder(autoGrid?.y)}
                                                onchange={(event) =>
                                                    patchInterpolation({
                                                        yGridCells: gridCellsValue(
                                                            event.currentTarget.value
                                                        )
                                                    })}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                </details>

                <details class="analysis-subsection">
                    <summary class="analysis-header">
                        <span>{$t("plot.panel.contourLines")}</span>
                    </summary>

                    <div class="analysis-body">
                        <div class="option-row">
                            <OptionLabel
                                for="contourEnabled"
                                text={$t("plot.panel.drawContours")}
                                info={$t("plot.panel.contourHint")}
                            />
                            <label class="switch-field">
                                <input
                                    id="contourEnabled"
                                    type="checkbox"
                                    class="switch-input"
                                    checked={draft.contour.enabled}
                                    onchange={(event) =>
                                        patchContour({ enabled: event.currentTarget.checked })}
                                    aria-label={$t("plot.panel.drawContourLines")}
                                />
                                <span class="switch-track" aria-hidden="true"
                                    ><span class="switch-thumb"></span></span
                                >
                            </label>
                        </div>

                        <PlotSlider
                            id="contourLevels"
                            label={$t("plot.panel.levels")}
                            info={$t("plot.panel.levelsHint")}
                            min={2}
                            max={30}
                            step={1}
                            value={draft.contour.levelCount}
                            onCommit={(value) => patchContour({ levelCount: value })}
                        />

                        <div class="field">
                            <OptionLabel
                                for="contourLineWidth"
                                text={$t("plot.panel.lineWidth")}
                                info={$t("plot.panel.lineWidthHint")}
                            /><Select.Root
                                type="single"
                                value={String(draft.contour.lineWidth)}
                                onValueChange={(value) =>
                                    patchContour({ lineWidth: Number(value) })}
                                ><Select.Trigger id="contourLineWidth"
                                    >{$t("plot.panel.pixels", {
                                        size: draft.contour.lineWidth
                                    })}</Select.Trigger
                                ><Select.Content
                                    ><Select.Group
                                        >{#each sizeOptions(0.25, 5, 0.25) as size (size)}<Select.Item
                                                value={String(size)}
                                                label={$t("plot.panel.pixels", { size })}
                                                >{$t("plot.panel.pixels", { size })}</Select.Item
                                            >{/each}</Select.Group
                                    ></Select.Content
                                ></Select.Root
                            >
                        </div>

                        <div class="option-row">
                            <label class="checkbox-field">
                                <Checkbox
                                    checked={draft.contour.showLabels}
                                    onCheckedChange={(checked) =>
                                        patchContour({ showLabels: !!checked })}
                                />
                                <span>{$t("plot.panel.addLabel")}</span>
                            </label>
                            <InfoTip
                                label={$t("plot.panel.about", {
                                    option: $t("plot.panel.addLabel")
                                })}
                                text={$t("plot.panel.addLabelHint")}
                            />
                        </div>

                        {#if draft.contour.showLabels}
                            <div class="field">
                                <OptionLabel
                                    for="contourLabelSize"
                                    text={$t("plot.panel.labelSize")}
                                    info={$t("plot.panel.labelSizeHint")}
                                /><Select.Root
                                    type="single"
                                    value={String(draft.contour.labelFontSize)}
                                    onValueChange={(value) =>
                                        patchContour({ labelFontSize: Number(value) })}
                                    ><Select.Trigger id="contourLabelSize"
                                        >{$t("plot.panel.pixels", {
                                            size: draft.contour.labelFontSize
                                        })}</Select.Trigger
                                    ><Select.Content
                                        ><Select.Group
                                            >{#each sizeOptions(6, 24) as size (size)}<Select.Item
                                                    value={String(size)}
                                                    label={$t("plot.panel.pixels", { size })}
                                                    >{$t("plot.panel.pixels", {
                                                        size
                                                    })}</Select.Item
                                                >{/each}</Select.Group
                                        ></Select.Content
                                    ></Select.Root
                                >
                            </div>
                        {/if}
                    </div>
                </details>

                <!-- Future addition -->
                <!-- <details class="analysis-subsection density-subsection">
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
				</details> -->
            {/if}
        </PlotSection>

        <!--
			Sticky, so the button stays reachable however far the user has scrolled
			through the steps.
		-->
        <footer class="apply-bar" class:dirty={isDirty}>
            <button
                type="button"
                class="apply"
                disabled={!isDirty || !!colorScaleError}
                onclick={apply}
            >
                <CheckIcon size={15} />
                <span>{$t("plot.panel.applyChanges")}</span>
            </button>

            <button
                type="button"
                class="revert"
                disabled={!isDirty}
                title={$t("plot.panel.revertTitle")}
                onclick={revert}
            >
                <Undo2Icon size={15} />
                <span>{$t("plot.panel.revert")}</span>
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
                font-size: var(--font-size-sm);
                font-weight: 500;
                cursor: pointer;

                &:disabled {
                    opacity: 0.45;
                    cursor: default;
                }
            }

            // The Apply button only stands out while there is something to apply.
            &.dirty .apply {
                border-color: var(--primary); // #2563eb;
                background-color: var(--primary); // #2563eb;
                color: var(--primary-foreground);
            }

            &.dirty .revert:hover {
                background-color: var(--accent, #f3f4f6);
            }
        }

        h4 {
            font-size: var(--font-size-xs);
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
            :global([data-slot="label"]) {
                display: flex;
                justify-content: space-between;
                gap: 0.5rem;
                font-size: var(--font-size-sm);
            }

            .fixed-value {
                font-size: var(--font-size-sm);
                color: var(--muted-foreground, #6b7280);
                padding: 0.375rem 0;
            }
        }

        // An option with a control and an info button side by side.
        .option-row {
            display: flex;
            align-items: center;
            gap: 0.375rem;
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
                font-size: var(--font-size-xs);
                font-weight: 600;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                cursor: pointer;
                list-style: none;

                &::-webkit-details-marker {
                    display: none;
                }

                &::after {
                    content: "\2304";
                    font-size: var(--font-size-md);
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
                font-size: var(--font-size-xs);
                font-weight: 600;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                cursor: pointer;
                list-style: none;

                &::-webkit-details-marker {
                    display: none;
                }

                &::after {
                    content: "\2304";
                    font-size: var(--font-size-md);
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

        .advanced-settings {
            > summary {
                font-size: var(--font-size-sm);
                font-weight: 600;
                cursor: pointer;
            }

            .advanced-body {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                padding-top: 0.625rem;
            }
        }

        .clip-range-header,
        .clip-range-labels {
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            font-size: var(--font-size-sm);
        }

        .clip-range-header span:last-child {
            color: var(--muted-foreground, #6b7280);
        }

        .clip-range-track {
            position: relative;
            height: 1.25rem;
            accent-color: var(--primary, #2563eb);

            &::before {
                content: "";
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

            input[type="range"] {
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

            input[type="color"] {
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

        .axis-heading {
            font-size: var(--font-size-sm);
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
            font-size: var(--font-size-sm);
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
            font-size: var(--font-size-sm);
        }

        .checkbox-field {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: var(--font-size-sm);
            cursor: pointer;

            :global([data-slot="checkbox"][data-state="checked"]) {
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
            font-size: var(--font-size-xs);
            color: var(--muted-foreground, #6b7280);
        }
    }
</style>
