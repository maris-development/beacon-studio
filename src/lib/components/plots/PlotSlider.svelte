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
</script>

<div class="field">
	<Label for={id}>
		<span>{label}</span>
		<em>{value}{suffix}</em>
	</Label>

	<input {id} type="range" {min} {max} {step} {value} oninput={onInput} />
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
		}
	}
</style>
