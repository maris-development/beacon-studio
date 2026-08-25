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

	/** True only when the field holds text that cannot become a date. Empty is never
	 *  invalid, and incomplete typing only turns invalid once the field loses focus. */
	let invalid = $state(false);

	/** The visible field (fp.altInput || fp.input), captured in onReady. */
	let fieldEl;
	/** Last field text we already turned into `value`. Drives the poll below. */
	let lastRaw = '';
	let pollId;

	// Locale-independent ISO entry format. \T escapes the literal "T".
	const entryFormat = 'Y-m-d\\TH:i:S';
	const smallestUnit = 'second';

	// How often to re-read the field. flatpickr rewrites input.value programmatically
	// and those writes emit no event, so a string compare is the only way to see them.
	const POLL_MS = 150;


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

	// The single place that maps field text onto `value` + `invalid`.
	// strict=false: incomplete text stays quiet, the user is still typing.
	// strict=true:  incomplete text is an error, the field lost focus.
	// Returns the parsed Date only when the text was complete and valid.
	function syncFromRaw(raw, strict) {
		lastRaw = raw;

		if (!raw) {
			// An empty field is a cleared field, not an error.
			invalid = false;
			value = '';
			return undefined;
		}

		const d = fp.parseDate(raw, fp.config.dateFormat);
		if (!d) {
			// Genuine garbage ("abc", "99-99-99") - flag it right away.
			invalid = true;
			return undefined;
		}

		// parseDate happily returns a Date for "2026-07", so round-trip the format
		// to tell complete input apart from half-typed input.
		if (fp.formatDate(d, fp.config.dateFormat) !== raw) {
			invalid = strict;
			return undefined;
		}

		invalid = false;
		value = toUTCISO(raw);
		return d;
	}

	// syncFromRaw + move the calendar, so every entry path behaves the same way.
	function handleRaw(raw, strict) {
		const d = syncFromRaw(raw, strict);
		if (d) fp.jumpToDate(d);   // move the calendar, don't touch the input
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
				// A calendar pick is always well-formed, so it clears any prior error.
				invalid = false;
				lastRaw = dateStr;
				value = toUTCISO(dateStr);
			},
			 onReady(_sel, _str, fp) {
				// Limitation: if a consumer turns on altInput through `options`, flatpickr
				// hides fp.input and shows its own altInput element. The listeners below
				// still follow the visible field, but class:invalid stays on fp.input, so
				// the red border does not show. Not handled here.
				fieldEl = fp.altInput || fp.input;
				lastRaw = fieldEl.value;

				fieldEl.addEventListener('input', () => handleRaw(fieldEl.value, false));

				fieldEl.addEventListener('blur', () => {
					// flatpickr binds its own blur handler to this same element and calls
					// setDate(value, false, ...) there, which rewrites the text in place.
					// Defer one task so we read the corrected text, not the typed text.
					setTimeout(() => handleRaw(fieldEl.value, true), 0);
				});
			},
			...options
		});

		// flatpickr rewrites input.value on its own: the blur correction above passes
		// triggerChange=false so onChange never fires, and a programmatic .value write
		// emits no input event and is invisible to MutationObserver. Polling the string
		// is the only way to catch every such edit.
		pollId = setInterval(() => {
			if (!fieldEl) return;
			const raw = fieldEl.value;
			if (raw === lastRaw) return;
			// Lenient: a poll can land mid-keystroke, so never flag incomplete text.
			handleRaw(raw, false);
		}, POLL_MS);

		return () => {
			clearInterval(pollId);
			fp?.destroy();
		};
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
	class:invalid
	aria-invalid={invalid || undefined}
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
	/* Equal specificity to :focus (0,2,0), so this must stay after it to win
	   while the field is focused. */
	.datetime-input.invalid,
	.datetime-input.invalid:focus {
		border-color: var(--dti-invalid, #dc2626);
		box-shadow: 0 0 0 3px var(--dti-invalid-ring, rgba(220, 38, 38, 0.2));
	}
	.datetime-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
