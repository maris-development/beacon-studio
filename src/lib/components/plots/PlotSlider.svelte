<!--
	A labelled range slider.

	The handle and the number beside the label follow the pointer, and every move
	reports at once. The panel writes the value into its draft, which is cheap: no
	plot redraws until the user clicks Apply. Therefore this control needs no
	debounce.
-->
<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		id,
		label,
		value,
		min,
		max,
		step,
		onCommit,
		suffix = ''
	}: {
		id: string;
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		onCommit: (value: number) => void;
		/** Shown after the number, for example "px" or "%". */
		suffix?: string;
	} = $props();

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		onCommit(Number(event.currentTarget.value));
	}

	const fillPercent = $derived.by(() => {
		const span = max - min;
		if (!Number.isFinite(span) || span <= 0) return 0;

		const percent = ((value - min) / span) * 100;
		return Math.min(100, Math.max(0, percent));
	});
</script>

<div class="field">
	<Label for={id}>
		<span>{label}</span>
		<em>{value}{suffix}</em>
	</Label>

	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		{value}
		style={`--slider-fill: ${fillPercent}%;`}
		oninput={onInput}
	/>
</div>

<style lang="scss">
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3125rem;

		// The Label component renders the element, so the rule reaches through it.
		:global([data-slot='label']) {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
			font-size: 0.8125rem;
		}

		em {
			font-style: normal;
			color: var(--muted-foreground, #6b7280);
		}

		input[type='range'] {
			width: 100%;
			height: 1.25rem;
			accent-color: var(--primary, #2563eb);
			appearance: none;
			background: transparent;

			&::-webkit-slider-runnable-track {
				height: 0.25rem;
				border-radius: 999px;
				background: linear-gradient(
					to right,
					var(--primary, #2563eb) 0%,
					var(--primary, #2563eb) var(--slider-fill),
					var(--muted, #e5e7eb) var(--slider-fill),
					var(--muted, #e5e7eb) 100%
				);
			}

			&::-moz-range-track {
				height: 0.25rem;
				border-radius: 999px;
				background: var(--muted, #e5e7eb);
			}

			&::-moz-range-progress {
				height: 0.25rem;
				border-radius: 999px;
				background: var(--primary, #2563eb);
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
				cursor: pointer;
			}

			&::-moz-range-thumb {
				width: 1rem;
				height: 1rem;
				border: 0;
				border-radius: 50%;
				background: var(--primary, #2563eb);
				box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
				cursor: pointer;
			}
		}
	}
</style>
