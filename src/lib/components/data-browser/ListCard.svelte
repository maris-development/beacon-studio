<!-- The white card around the list of a data-browser page, with a header row. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        head,
        tools,
        children
    }: {
        /** The left part of the header, for example a breadcrumb. */
        head?: Snippet;
        /** The right part of the header, for example a search field. */
        tools?: Snippet;
        children: Snippet;
    } = $props();
</script>

<div class="list-card">
    {#if head || tools}
        <div class="list-head">
            {#if head}{@render head()}{/if}
            {#if tools}
                <div class="tools">{@render tools()}</div>
            {/if}
        </div>
    {/if}

    {@render children()}
</div>

<style lang="scss">
    .list-card {
        overflow: hidden;
        border: 1px solid var(--card-border);
        border-radius: 0.75rem;
        background: var(--card);
    }

    .list-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border);
    }

    .tools {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
    }
</style>
