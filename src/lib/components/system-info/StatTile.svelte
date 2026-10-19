<script lang="ts">
    import type { Component } from "svelte";

    type Props = {
        label: string;
        value: string;
        detail?: string;
        icon?: Component<{ size?: number }>;
    };

    let { label, value, detail, icon: Icon }: Props = $props();
</script>

<div class="tile">
    <span class="label">
        {#if Icon}<Icon size={14} />{/if}
        {label}
    </span>
    <span class="value" title={value}>{value}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
</div>

<style lang="scss">
    .tile {
        display: grid;
        align-content: start;
        gap: 0.25rem;
        min-width: 0;
        padding: 0.75rem 1rem;
        border: 1px solid var(--card-border);
        border-radius: 0.5rem;
        background: var(--card);
    }

    .label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        color: var(--muted-foreground);
        font-size: var(--font-size-sm);
    }

    .detail {
        color: var(--muted-foreground);
        font-size: var(--font-size-xs);
    }

    .value {
        overflow: hidden;
        font-size: var(--font-size-lg);
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
