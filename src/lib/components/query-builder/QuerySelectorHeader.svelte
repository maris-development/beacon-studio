<script lang="ts">
    import QueryActionBar from "@/components/query-builder/QueryActionBar.svelte";
    import QueryBuilderSelectorBlock from "./QueryBuilderSelectorBlock.svelte";
    import QueryViewSwitch, { type QueryView } from "./QueryViewSwitch.svelte";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
    import Button from "../buttons/Button.svelte";
    import { goto } from "$app/navigation";
    import { SvelteURLSearchParams } from "svelte/reactivity";
    import type { QueryWorkspace } from "./QueryWorkspace.svelte";
    import type { QueryActions } from "./QueryActions";
    import type { StoredQuery } from "@/stores/stored-query";
    import { resolve } from "$app/paths";
    import { browser } from "$app/environment";
    import { t } from "@/i18n";

    let {
        workspace,
        queryActions,
        view = "query"
    }: {
        workspace: QueryWorkspace;
        queryActions: QueryActions;
        view?: QueryView;
    } = $props();

    // The free space that the labelled actions must leave beside the view switch.
    const MIN_GAP_REM = 15;

    const QUERY_LIST_OPEN_KEY = "beacon-studio.workbench.query-list-open";

    // Read at init, not in `onMount`, so a page opens in the saved state with no flash.
    let showQuerySelectionBlock = $state(readQueryListOpen());
    let actionBarWrapper: HTMLElement | undefined = $state();
    let titleBar: HTMLElement | undefined = $state();

    const toggleLabel = $derived.by(() => {
        if (showQuerySelectionBlock) return $t("workbench.panes.collapseQueries");
        return $t("workbench.panes.expandQueries");
    });

    function readQueryListOpen(): boolean {
        if (!browser) return true;
        return localStorage.getItem(QUERY_LIST_OPEN_KEY) !== "false";
    }

    function toggleQueryList(): void {
        showQuerySelectionBlock = !showQuerySelectionBlock;
        localStorage.setItem(QUERY_LIST_OPEN_KEY, String(showQuerySelectionBlock));
    }

    function editActiveQuery() {
        gotoQueryEditor(workspace.activeBlockId);
    }

    function handleDoubleClick(block: StoredQuery): void {
        gotoQueryEditor(block.id);
    }

    function gotoQueryEditor(queryId: string): void {
        if (queryId) {
            const params = new SvelteURLSearchParams();
            params.set("q", queryId);
            goto(resolve(`/queries/workbench`) + "?" + params.toString());
        }
    }

    /** The width of the items of a row on one line, with the gaps between them. */
    function rowWidth(row: Element): number {
        const items = [...row.children].filter(
            (item): item is HTMLElement =>
                item instanceof HTMLElement && getComputedStyle(item).position !== "absolute"
        );
        const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
        const widths = items.reduce((sum, item) => sum + item.offsetWidth, 0);

        return widths + gap * Math.max(items.length - 1, 0);
    }

    /** Show the actions as icons only when their labels leave too little space. */
    function updateCompact(wrapper: HTMLElement, title: HTMLElement): void {
        const actions = wrapper.querySelector(".query-action-group");
        if (!actions) return;

        // Measure with the labels. The browser paints only after the class is set again.
        wrapper.classList.remove("compact");
        const used = rowWidth(title) + rowWidth(actions);
        const style = getComputedStyle(wrapper);
        const space =
            wrapper.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);

        wrapper.classList.toggle("compact", space - used < MIN_GAP_REM * rem);
    }

    $effect(() => {
        const wrapper = actionBarWrapper;
        const title = titleBar;
        if (!wrapper || !title) return;

        const update = () => updateCompact(wrapper, title);
        const resize = new ResizeObserver(update);
        resize.observe(wrapper);
        // A new language or a new saved count changes the width of the labels.
        const text = new MutationObserver(update);
        text.observe(wrapper, { subtree: true, childList: true, characterData: true });

        return () => {
            resize.disconnect();
            text.disconnect();
        };
    });
</script>

<div class="page-container">
    <div class="action-bar-wrapper" bind:this={actionBarWrapper}>
        <div class="title-bar" bind:this={titleBar}>
            <!-- The active query tab shows the name, so the heading is for screen readers only. -->
            <h1 class="sr-only">{workspace.activeBlock.name}</h1>
            <QueryViewSwitch active={view} {queryActions} onOpenQuery={editActiveQuery} />
        </div>
        <QueryActionBar {queryActions} />
    </div>

    <div class="selection-row">
        {#if showQuerySelectionBlock}
            <div class="selection-block-wrapper">
                <QueryBuilderSelectorBlock {workspace} {handleDoubleClick} />
            </div>
        {:else}
            <span class="collapsed-name">{workspace.activeBlock.name}</span>
        {/if}
        <Button
            class="selection-block-toggle"
            variant="ghost"
            size="icon"
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={showQuerySelectionBlock}
            onclick={toggleQueryList}
        >
            {#if showQuerySelectionBlock}
                <ChevronUpIcon class="size-4" />
            {:else}
                <ChevronDownIcon class="size-4" />
            {/if}
        </Button>
    </div>
</div>

<style lang="scss">
    .page-container {
        padding: 0;
        // The header reacts to its own width, so it also adapts to the sidebar.
        container: query-header / inline-size;

        // The tab strip. The active tab covers its bottom line.
        .action-bar-wrapper {
            display: flex;
            flex-direction: row;
            // The tabs stay on the bottom line when the actions need a row of their own.
            flex-wrap: wrap-reverse;
            justify-content: space-between;
            // `end` is the bottom edge. `flex-end` is the top edge under `wrap-reverse`.
            align-items: end;
            gap: 0.5rem;
            padding: 0.5rem 0.5rem 0;
            background: var(--muted);
            border-bottom: 1px solid var(--border);
            border-radius: inherit;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;

            .title-bar {
                display: flex;
            }

            :global(.query-action-bar) {
                align-self: center;
                padding-block: 0.25rem;
            }

            // No size animation, so the switch is instant and `updateCompact` reads final widths.
            :global(.query-action-bar .btn) {
                transition-property: color, background-color, border-color, box-shadow, opacity;
            }

            // `updateCompact` sets the class. The label stays for screen readers.
            &:global(.compact) :global(.query-action-bar) {
                :global(.btn) {
                    width: 2.25rem;
                    padding-inline: 0;
                }

                :global(.action-label) {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    margin: -1px;
                    overflow: hidden;
                    clip-path: inset(50%);
                    white-space: nowrap;
                }
            }
        }

        .selection-row {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;

            .selection-block-wrapper {
                flex-grow: 1;
                min-width: 0;
            }

            // The same text as the name on a query card.
            .collapsed-name {
                flex-grow: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--foreground);
                font-size: var(--font-size-md);
                font-weight: 600;
            }
        }
    }
</style>
