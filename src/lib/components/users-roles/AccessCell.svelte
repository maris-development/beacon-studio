<script lang="ts">
    import { t } from "@/i18n";
    import type { AccessSummary } from "@/access/summary";

    let { summary }: { summary: AccessSummary } = $props();
</script>

<div class="access">
    <span class="head">
        <span class="dot {summary.tone}"></span>
        <span class="label">{$t(summary.label)}</span>
    </span>
    <span class="line">{$t(summary.line)}</span>
</div>

<style lang="scss">
    .access {
        display: flex;
        flex-direction: column;
    }

    .head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .label {
        font-weight: 500;
    }

    .line {
        padding-left: 1.0625rem;
        color: var(--muted-foreground);
        font-size: var(--font-size-sm);
    }

    .dot {
        width: 0.5625rem;
        height: 0.5625rem;
        border-radius: 50%;

        &.full {
            background: var(--destructive);
        }

        &.none {
            background: var(--muted-foreground);
        }

        &.all {
            background: var(--access-all);
        }

        &.limited {
            background: var(--access-limited);
        }
    }
</style>
