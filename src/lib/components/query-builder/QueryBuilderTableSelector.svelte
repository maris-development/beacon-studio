<script lang="ts">
    import * as Select from "$lib/components/ui/select/index.js";
    import CircleCheck from "@lucide/svelte/icons/circle-check";
    import Card from "../card/Card.svelte";
    import QueryBuilderStep from "./QueryBuilderStep.svelte";
    import QueryBuilderViewToggle, { type ViewMode } from "./QueryBuilderViewToggle.svelte";
    import type { QuerySelectionStatus } from "@/query/selection-status";
    import { askConfirm } from "@/stores/confirm";
    import { t, translate } from "@/i18n";

    let {
        step,
        disabled = false,
        table_names = [],
        loaded = false,
        selected_table_name = $bindable(""),
        status,
        onPick
    }: {
        /** The number of this step in the builder. */
        step: number;
        /** True while the query has no node. The step then shows a hint. */
        disabled?: boolean;
        table_names?: string[];
        loaded?: boolean;
        selected_table_name?: string;
        status?: QuerySelectionStatus;
        onPick?: (table_name: string) => void;
    } = $props();

    let viewMode = $state<ViewMode>("cards");
    let viewModeInitialized = $state(false);

    $effect(() => {
        if (loaded && !viewModeInitialized) {
            viewMode = table_names.length < 10 ? "cards" : "list";
            viewModeInitialized = true;
        }
    });

    async function pickTable(table_name: string) {
        if (table_name === selected_table_name) return;

        if (status && status.columns > 0) {
            const goAhead = await askConfirm({
                title: translate("query.table.change.title"),
                message: translate("query.table.change.message"),
                confirmLabel: translate("query.table.change.confirm")
            });

            if (!goAhead) return;
        }
        selected_table_name = table_name;
        onPick?.(table_name);
    }
</script>

<QueryBuilderStep
    {step}
    title={$t("query.table.title")}
    description={$t("query.table.description")}
    hint={disabled ? $t("query.table.needsNode") : null}
>
    {#snippet actions()}
        {#if !disabled}
            <p class="table-count">
                {#if loaded}
                    {$t("query.table.count", { count: table_names.length })}
                {:else}
                    {$t("query.table.countLoading")}
                {/if}
            </p>
            <QueryBuilderViewToggle bind:mode={viewMode} />
        {/if}
    {/snippet}

    <div class="table-views">
        {#if viewMode === "cards"}
            <div class="cards-view">
                {#each table_names as table_name (table_name)}
                    <Card
                        class={selected_table_name === table_name ? "selected" : ""}
                        onclick={() => pickTable(table_name)}
                    >
                        <div class="table-header">
                            <h4 title={table_name}>{table_name}</h4>
                            {#if selected_table_name === table_name}
                                <CircleCheck class="check" size="1rem" />
                            {/if}
                        </div>
                        <p class="table-description">
                            {$t("query.table.noDescription")}
                        </p>
                    </Card>
                {/each}
            </div>
        {:else if viewMode === "list"}
            <!--
                The value is a prop and not a binding. Therefore `onValueChange` runs
                for a choice of the user only, and not for a table that the loader
                selects. `pickTable` writes the new value.
            -->
            <Select.Root
                type="single"
                name="dataCollection"
                bind:value={() => selected_table_name, (table_name) => pickTable(table_name)}
            >
                <Select.Trigger class="table-select-trigger">
                    {selected_table_name || $t("query.table.placeholder")}
                </Select.Trigger>
                <Select.Content>
                    <Select.Group>
                        <Select.Label>{$t("query.table.listLabel")}</Select.Label>
                        {#each table_names as table_name (table_name)}
                            <Select.Item value={table_name} label={table_name}>
                                {table_name}
                            </Select.Item>
                        {/each}
                    </Select.Group>
                </Select.Content>
            </Select.Root>
        {/if}
    </div>
</QueryBuilderStep>

<style lang="scss">
    p.table-count {
        margin: 0;
    }

    .table-views {
        .cards-view {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
            gap: 0.5rem;

            :global(.card) {
                padding: 0.6rem;
            }

            :global(.card.selected) {
                border-color: var(--primary);
                background-color: var(--selected-background);

                :global(.check) {
                    color: var(--primary);
                    align-self: flex-start;
                }
            }

            div.table-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-width: 0;

                h4 {
                    margin: 0;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                    line-clamp: 2;
                    overflow-wrap: anywhere;
                    word-break: break-word;
                }
            }

            p.table-description {
                margin: 0;
                font-size: var(--font-size-sm);
                color: hsl(0, 0%, 50%);
                // Show one line only and ellipsize the rest of the text.
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }

        :global(.table-select-trigger) {
            width: 250px;
        }
    }
</style>
