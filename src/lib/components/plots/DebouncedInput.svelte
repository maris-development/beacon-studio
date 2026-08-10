<!--
	A text or number field that reports its value after the user stops typing.

	A plot edit is not cheap: it redraws every point on the canvas, and it writes
	the query blocks to storage. At one edit per keystroke that work blocks the
	main thread, and the field feels stuck.

	Therefore the field keeps its own draft value, which stays instant, and it
	commits after {@link delay} of quiet. Leaving the field, and the Enter key,
	commit at once. Escape puts the last committed value back.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Input } from '$lib/components/ui/input/index.js';

	let {
		value,
		onCommit,
		type = 'text',
		placeholder = '',
		delay = 300
	}: {
		/** The committed value. A change from outside replaces the draft. */
		value: string | number;
		onCommit: (value: string) => void;
		type?: 'text' | 'number';
		placeholder?: string;
		delay?: number;
	} = $props();

	let draft = $state(String(value));
	let timer: ReturnType<typeof setTimeout> | null = null;

	/** True between a keystroke and its commit. */
	let pending = false;

	// Follow the value from outside, for example after a switch to another plot.
	// A pending edit wins: the user is typing, and their text must not vanish.
	$effect(() => {
		const incoming = String(value);

		untrack(() => {
			if (!pending) draft = incoming;
		});
	});

	onDestroy(() => {
		// The user left the page mid-edit. Their last keystrokes still count.
		if (pending) commit();
	});

	function schedule() {
		pending = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(commit, delay);
	}

	function commit() {
		if (timer) clearTimeout(timer);
		timer = null;
		pending = false;
		onCommit(draft);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			commit();
			return;
		}

		if (event.key === 'Escape') {
			if (timer) clearTimeout(timer);
			timer = null;
			pending = false;
			draft = String(value);
		}
	}
</script>

<Input
	{type}
	{placeholder}
	value={draft}
	oninput={(event) => {
		draft = event.currentTarget.value;
		schedule();
	}}
	onblur={() => {
		if (pending) commit();
	}}
	onkeydown={onKeyDown}
/>
