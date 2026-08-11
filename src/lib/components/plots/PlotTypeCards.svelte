<!--
	The plot type picker: one card per type.

	A card, and not a dropdown. There are few types, each one changes what the
	rest of the panel asks for, and the description belongs beside the choice
	rather than behind a click.
-->
<script lang="ts">
	import ChartScatterIcon from '@lucide/svelte/icons/chart-scatter';
	import ChartSplineIcon from '@lucide/svelte/icons/chart-spline';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import WavesIcon from '@lucide/svelte/icons/waves';
	import type { Component } from 'svelte';
	import { PLOT_TYPES, type PlotType } from '@/plots/plot-config';

	let {
		value,
		onSelect,
		/** A cross section card is disabled while the query has no drawn line. */
		crossSectionAvailable = true
	}: {
		value: PlotType;
		onSelect: (type: PlotType) => void;
		crossSectionAvailable?: boolean;
	} = $props();

	const ICONS: Record<PlotType, Component> = {
		scatter: ChartScatterIcon,
		'cross-section': WavesIcon,
		line: ChartSplineIcon,
		histogram: ChartColumnIcon
	};

	function isDisabled(type: PlotType): boolean {
		return type === 'cross-section' && !crossSectionAvailable;
	}

	function hintFor(type: PlotType): string | null {
		if (isDisabled(type)) {
			return 'Draw a cross section on the map viewer first.';
		}
		return null;
	}
</script>

<div class="plot-type-cards">
	{#each PLOT_TYPES as type (type.id)}
		{@const Icon = ICONS[type.id]}
		{@const disabled = isDisabled(type.id)}
		{@const hint = hintFor(type.id)}

		<button
			type="button"
			class="card"
			class:selected={value === type.id}
			aria-pressed={value === type.id}
			{disabled}
			title={hint ?? type.description}
			onclick={() => onSelect(type.id)}
		>
			<Icon size={20} />

			<span class="label">{type.label}</span>
			<span class="description">{hint ?? type.description}</span>
		</button>
	{/each}
</div>

<style lang="scss">
	.plot-type-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
		gap: 0.5rem;

		.card {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
			padding: 0.75rem;
			border: 1px solid var(--border, #e5e7eb);
			border-radius: 0.5rem;
			background-color: var(--background, #ffffff);
			text-align: left;
			cursor: pointer;
			transition:
				border-color 0.15s ease,
				background-color 0.15s ease;

			&:hover:not(:disabled) {
				border-color: var(--ring, #93c5fd);
			}

			&.selected {
				border-color: #2563eb;
				background-color: rgba(37, 99, 235, 0.06);
				box-shadow: inset 0 0 0 1px #2563eb;
			}

			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}

			.label {
				font-size: 0.8125rem;
				font-weight: 600;
			}

			.description {
				font-size: 0.6875rem;
				line-height: 1.3;
				color: var(--muted-foreground, #6b7280);
			}
		}
	}
</style>
