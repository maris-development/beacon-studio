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
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
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
        {#if segment.id === "map"}
            <span class="flow" aria-hidden="true"><ChevronRightIcon /></span>
        {/if}
        <button
            type="button"
            class="segment"
            class:active={segment.id === active}
            aria-current={segment.id === active ? "page" : undefined}
            aria-busy={pending === segment.id}
            disabled={isDisabled(segment)}
            title={titleOf(segment) ?? $t(segment.label)}
            onclick={() => open(segment)}
        >
            <span class="icon">
                {#if pending === segment.id}
                    <LoadingIcon class="animate-spin" />
                {:else}
                    <segment.icon />
                {/if}
            </span>
            <span class="label">{$t(segment.label)}</span>
        </button>
    {/each}
</div>

<style lang="scss">
    // One rail for the four views. The active view is the lit one.
    .query-view-switch {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--card);

        // The arrow from the query to its result views.
        .flow {
            display: flex;
            color: var(--muted-foreground);

            :global(svg) {
                width: 1rem;
                height: 1rem;
            }
        }

        .segment {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0.875rem 0.25rem 0.25rem;
            border: 0;
            // The rail radius less the rail padding, so the corners run parallel.
            border-radius: calc(var(--radius) - 0.25rem);
            background: none;
            color: var(--foreground);
            font-size: var(--font-size-md);
            font-weight: 600;
            line-height: 1.5rem;
            white-space: nowrap;
            cursor: pointer;
            transition:
                background-color 0.15s ease,
                color 0.15s ease;

            .icon {
                display: grid;
                place-items: center;
                width: 1.75rem;
                height: 1.75rem;
                border-radius: 0.25rem;
                background: color-mix(in srgb, var(--view-switch-icon) 14%, transparent);
                color: var(--view-switch-icon);
                transition:
                    background-color 0.15s ease,
                    color 0.15s ease;

                :global(svg) {
                    width: 1rem;
                    height: 1rem;
                }
            }

            &:hover:not(:disabled):not(.active) {
                background: color-mix(in srgb, var(--view-switch-icon) 10%, transparent);

                .icon {
                    background: var(--view-switch-icon);
                    color: var(--view-switch-active-foreground);
                }
            }

            &:focus-visible {
                outline: 2px solid var(--primary);
                outline-offset: 2px;
            }

            &.active {
                background: var(--view-switch-active);
                color: var(--view-switch-active-foreground);
                box-shadow: 0 2px 10px var(--view-switch-glow);
                cursor: default;

                .icon {
                    background: color-mix(
                        in srgb,
                        var(--view-switch-active-foreground) 20%,
                        transparent
                    );
                    color: inherit;
                }
            }

            &:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
        }
    }

    // A narrow header shows the label of the active view only.
    @container query-header (max-width: 30rem) {
        .query-view-switch .segment:not(.active) {
            padding-right: 0.25rem;

            .label {
                position: absolute;
                width: 1px;
                height: 1px;
                overflow: hidden;
                clip-path: inset(50%);
            }
        }
    }
</style>
