<script lang="ts">
	import { onMount } from 'svelte';
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';

	// Temporal is native in 2026 (Chrome/Firefox/Edge). The polyfill guarantees
	// Safari-stable / older engines. If you only target modern engines and want
	// to drop the dep, delete this import and add:  const { Temporal } = globalThis;
	import { Temporal } from '@js-temporal/polyfill';

	let {
		/** Output: ISO string stamped "Z", e.g. "2026-07-30T14:30:00Z". The digits are
		 *  exactly what was typed/picked - no timezone conversion, always treated as UTC.
		 *  This is what you store / feed to the querybuilder. */
		value = $bindable(''),
		/** Wall-clock strings matching the entry format, e.g. "2026-01-01T00:00". */
		min = undefined,
		max = undefined,
		disabled = false,
		placeholder ='YYYY-MM-DDTHH:mm:ssZ' ,
		id = undefined,
		/** Escape hatch: any extra flatpickr options, merged last (can override defaults). */
		options = {},
		/** Any leftover attrs (name, aria-*, class, ...) land on the <input>. */
		...rest
	} = $props();

	let inputEl;
	let fp;

	// Locale-independent ISO entry format. \T escapes the literal "T".
	const entryFormat = 'Y-m-d\\TH:i:S';
	const smallestUnit = 'second';


	// wall-clock string from flatpickr -> the same digits, stamped "Z". No zone math:
	// we never convert, just annotate the digits the user typed/picked as UTC.
	function toUTCISO(wall) {
		if (!wall) return '';
		try {
			let result = Temporal.PlainDateTime.from(wall)
				.toString({ smallestUnit });

            if(!result.endsWith('Z')) {
                result += 'Z';
            }
			return result;
		} catch {
			return '';
		}
	}

	// inverse of toUTCISO: drop the "Z" and hand flatpickr the bare wall-clock digits.
	// flatpickr/JS Date parse a trailing "Z" as a real UTC instant and re-render it in
	// the browser's local zone, which would shift the digits - we never want that.
	function fromUTCISO(iso) {
		if (!iso) return '';
		try {
			const plain = iso.replace(/Z$|[+-]\d{2}:\d{2}$/, '');
			return Temporal.PlainDateTime.from(plain).toString({ smallestUnit });
		} catch {
			return '';
		}
	}

	onMount(() => {
		fp = flatpickr(inputEl, {
			enableTime: true,
			time_24hr: true,
			enableSeconds: true,
			allowInput: true, // users can type ISO directly, not just pick
			dateFormat: entryFormat,
			defaultDate: fromUTCISO(value),
			minDate: min,
			maxDate: max,
			onChange: (_selected, dateStr) => {
				value = toUTCISO(dateStr);
			},
			...options
		});

		return () => fp?.destroy();
	});

</script>

<input
	bind:this={inputEl}
	{id}
	{placeholder}
	{disabled}
	type="text"
	inputmode="numeric"
	autocomplete="off"
	class="datetime-input"
	{...rest}
/>

<style>
	.datetime-input {
		font: inherit;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--dti-border, #cbd5e1);
		border-radius: var(--dti-radius, 6px);
		background: var(--dti-bg, #fff);
		color: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.datetime-input:focus {
		outline: none;
		border-color: var(--dti-focus, #6366f1);
		box-shadow: 0 0 0 3px var(--dti-focus-ring, rgba(99, 102, 241, 0.2));
	}
	.datetime-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
