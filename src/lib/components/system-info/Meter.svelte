<script lang="ts">
    import { formatNumber } from "@/i18n";
    import { meterTone, WHOLE_PERCENT_FORMAT } from "@/system-info/host";

    type Props = {
        label: string;
        percent: number | null;
        /** The text on the right. Without it, the whole percentage. */
        end?: string;
        size?: "default" | "compact";
    };

    let { label, percent, end, size = "default" }: Props = $props();

    let value = $derived.by(() => {
        if (end !== undefined) return end;
        if (percent === null) return "—";
        return $formatNumber(percent / 100, WHOLE_PERCENT_FORMAT);
    });
</script>

<div class="meter" class:compact={size === "compact"}>
    <div class="head">
        <span class="label">{label}</span>
        <span class="value">{value}</span>
    </div>
    <div
        class="bar"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
    >
        <span class:high={meterTone(percent) === "high"} style="width: {percent ?? 0}%"></span>
    </div>
</div>

<style lang="scss">
    .meter {
        display: grid;
        gap: 0.375rem;
        min-width: 0;
        font-size: var(--font-size-sm);
    }

    .head {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .value {
        flex: 0 0 auto;
        font-weight: 600;
    }

    .bar {
        height: 0.375rem;
        overflow: hidden;
        border-radius: 99px;
        background: var(--secondary);

        span {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: var(--primary);
            transition: width 0.3s;

            &.high {
                background: var(--destructive);
            }
        }
    }

    .compact {
        gap: 0.25rem;
        font-size: var(--font-size-xs);

        .label,
        .value {
            color: var(--muted-foreground);
            font-weight: 400;
        }

        .bar {
            height: 0.25rem;
        }
    }
</style>
