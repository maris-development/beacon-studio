<!--
	A slider that reports its value after the user stops moving it.

	The handle and the number beside the label follow the pointer, so the control
	feels immediate. The plot only rebuilds once the movement pauses, and at once
	when the user lets go.

	Without this a drag fires an event per pixel, and each one can rebuild the
	colour of every row. On a plot of several hundred thousand points that is far
	more work than the eye can use, and the page stops answering while it runs.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { untrack } from 'svelte';
	import { Label } from '$lib/components/ui/label/index.js';
	import { debounce } from '@/util/debounce';

	let {
		id,
		label,
		value,
		min,
		max,
		step,
		onCommit,
		suffix = '',
		delay = 200
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
		delay?: number;
	} = $props();

	let draft = $state(value);

	/** True between a move and its commit. A commit from outside must not fight it. */
	let moving = false;

	const commit = debounce((next: number) => {
		moving = false;
		onCommit(next);
	}, delay);

	// Follow the value from outside, for example after a switch to another plot.
	$effect(() => {
		const incoming = value;

		untrack(() => {
			if (!moving) draft = incoming;
		});
	});

	onDestroy(() => commit.flush());

	function onInput(event: Event & { currentTarget: HTMLInputElement }) {
		draft = Number(event.currentTarget.value);
		moving = true;
		commit.call(draft);
	}

	/** The pointer went up, or the keyboard moved the handle. Do not wait. */
	function onChange() {
		commit.flush();
	}
</script>

<div class="field">
	<Label for={id}>
		<span>{label}</span>
		<em>{draft}{suffix}</em>
	</Label>

	<input {id} type="range" {min} {max} {step} value={draft} oninput={onInput} onchange={onChange} />
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
