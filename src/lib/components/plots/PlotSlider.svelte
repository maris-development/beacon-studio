<!--
	A labelled range slider.

	The handle and the number beside the label follow the pointer, and every move
	reports at once. The panel writes the value into its draft, which is cheap: no
	plot redraws until the user clicks Apply. Therefore this control needs no
	debounce.
-->
<script lang="ts">
    import { Label } from "$lib/components/ui/label/index.js";
    import OptionLabel from "./OptionLabel.svelte";

    let {
        id,
        label,
        info = "",
        value,
        min,
        max,
        step,
        onCommit,
        suffix = "",
        display = null,
        minLabel = "",
        maxLabel = ""
    }: {
        id: string;
        label: string;
        /** The description in the info button beside the label. */
        info?: string;
        value: number;
        min: number;
        max: number;
        step: number;
        onCommit: (value: number) => void;
        /** Shown after the number, for example "px" or "%". */
        suffix?: string;
        /** Shown in place of the number, when the number alone means nothing to a user. */
        display?: string | null;
        /** The meaning of the two ends, shown under the slider. */
        minLabel?: string;
        maxLabel?: string;
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
    <div class="head">
        {#if info}
            <OptionLabel for={id} text={label} {info} />
        {:else}
            <Label for={id}>{label}</Label>
        {/if}
        <em>{display ?? `${value}${suffix}`}</em>
    </div>

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

    {#if minLabel || maxLabel}
        <div class="ends">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
        </div>
    {/if}
</div>

<style lang="scss">
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.3125rem;

        .head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            font-size: var(--font-size-sm);
        }

        em {
            font-style: normal;
            color: var(--muted-foreground);
        }

        .ends {
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            font-size: var(--font-size-xs);
            color: var(--muted-foreground);
        }

        input[type="range"] {
            width: 100%;
            height: 1.25rem;
            accent-color: var(--primary);
            appearance: none;
            background: transparent;

            &::-webkit-slider-runnable-track {
                height: 0.25rem;
                border-radius: 999px;
                background: linear-gradient(
                    to right,
                    var(--primary) 0%,
                    var(--primary) var(--slider-fill),
                    var(--muted) var(--slider-fill),
                    var(--muted) 100%
                );
            }

            &::-moz-range-track {
                height: 0.25rem;
                border-radius: 999px;
                background: var(--muted);
            }

            &::-moz-range-progress {
                height: 0.25rem;
                border-radius: 999px;
                background: var(--primary);
            }

            &::-webkit-slider-thumb {
                width: 1rem;
                height: 1rem;
                margin-top: -0.375rem;
                appearance: none;
                border: 0;
                border-radius: 50%;
                background: var(--primary);
                box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
                cursor: pointer;
            }

            &::-moz-range-thumb {
                width: 1rem;
                height: 1rem;
                border: 0;
                border-radius: 50%;
                background: var(--primary);
                box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
                cursor: pointer;
            }
        }
    }
</style>
