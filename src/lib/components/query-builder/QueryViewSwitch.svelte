<!-- The one control between the builder and the result views of the active query. -->

<script lang="ts" module>
    export type QueryView = "query" | "map" | "table" | "chart";
</script>

<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import TextSearchIcon from "@lucide/svelte/icons/text-search";
    import MapIcon from "@lucide/svelte/icons/map";
    import TableIcon from "@lucide/svelte/icons/table";
    import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
    import LoadingIcon from "@lucide/svelte/icons/loader-2";
    import { settings } from "@/stores/settings";
    import { t, type MessageKey } from "@/i18n";
    import type { ActionCallback, QueryActions } from "./QueryActions";

    let {
        active,
        queryActions,
        onOpenQuery
    }: {
        active: QueryView;
        queryActions: QueryActions;
        /** Open the builder on the active query. */
        onOpenQuery: () => void;
    } = $props();

    type Segment = {
        id: QueryView;
        label: MessageKey;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        icon: any;
        path?: string;
        run?: ActionCallback;
    };

    const segments: Segment[] = $derived([
        { id: "query", label: "workbench.view.query", icon: TextSearchIcon },
        {
            id: "map",
            label: "workbench.view.map",
            icon: MapIcon,
            path: resolve("/visualisations/map-viewer"),
            run: queryActions.visualiseMap
        },
        {
            id: "table",
            label: "workbench.view.table",
            icon: TableIcon,
            path: resolve("/visualisations/table-explorer"),
            run: queryActions.visualiseTable
        },
        {
            id: "chart",
            label: "workbench.view.chart",
            icon: ChartPieIcon,
            path: resolve("/visualisations/chart-explorer"),
            run: queryActions.visualiseChart
        }
    ]);

    // Read the switch here: `runBlockReason` reads a snapshot of the settings.
    const blockReason = $derived.by(() => {
        void $settings.requireQueryFilters;
        return queryActions.runBlockReason?.() ?? null;
    });

    // Only the builder runs the query. A result view already holds the result.
    const runsQuery = $derived(active === "query");

    let pending = $state<QueryView | null>(null);

    function isDisabled(segment: Segment): boolean {
        if (pending) return true;
        if (segment.id === "query" || segment.id === active) return false;

        return runsQuery && !!blockReason;
    }

    function titleOf(segment: Segment): string | undefined {
        if (segment.id === "query" || !runsQuery || !blockReason) return undefined;
        return $t(blockReason);
    }

    async function open(segment: Segment): Promise<void> {
        if (segment.id === active || pending) return;

        if (segment.id === "query") {
            onOpenQuery();
            return;
        }

        if (!runsQuery) {
            if (segment.path) await goto(segment.path);
            return;
        }

        pending = segment.id;
        try {
            await segment.run?.();
        } finally {
            pending = null;
        }
    }
</script>

<div class="query-view-switch" role="group" aria-label={$t("workbench.view.label")}>
    {#each segments as segment (segment.id)}
        <button
            type="button"
            class="segment"
            class:active={segment.id === active}
            aria-current={segment.id === active ? "page" : undefined}
            aria-busy={pending === segment.id}
            disabled={isDisabled(segment)}
            title={titleOf(segment)}
            onclick={() => open(segment)}
        >
            {#if pending === segment.id}
                <LoadingIcon class="animate-spin" />
            {:else}
                <segment.icon />
            {/if}
            <span>{$t(segment.label)}</span>
        </button>
    {/each}
</div>

<style lang="scss">
    // Folder tabs. The header strip draws the line that the active tab covers.
    .query-view-switch {
        display: flex;
        align-items: flex-end;
        gap: 0.125rem;

        .segment {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            // A transparent top border keeps each tab as tall as the active tab.
            border: 1px solid transparent;
            border-top-width: 3px;
            border-bottom: 0;
            border-radius: 0.5rem 0.5rem 0 0;
            margin-bottom: -1px;
            background: none;
            color: var(--muted-foreground);
            font-size: var(--font-size-md);
            font-weight: 500;
            line-height: 1.5rem;
            white-space: nowrap;
            cursor: pointer;

            :global(svg) {
                width: 1rem;
                height: 1rem;
            }

            &:hover:not(:disabled) {
                color: var(--foreground);
            }

            &:focus-visible {
                outline: 2px solid var(--primary);
                outline-offset: -2px;
            }

            &.active {
                // The card colour joins the tab to the query list under it.
                background: var(--card);
                border-color: var(--border);
                border-top-color: var(--primary);
                color: var(--primary);
                font-weight: 600;
                cursor: default;
            }

            &:disabled {
                cursor: not-allowed;
                opacity: 0.5;
            }
        }
    }

    // Tighter tabs on a narrow header, so all four fit.
    @container query-header (max-width: 30rem) {
        .query-view-switch .segment {
            gap: 0.375rem;
            padding-inline: 0.5rem;
        }
    }
</style>
