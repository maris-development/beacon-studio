<script lang="ts">
    import { page } from "$app/state";
    import LockIcon from "@lucide/svelte/icons/lock";
    import { isItemActive } from "./menu";

    let {
        title,
        url = undefined,
        match = undefined,
        icon: Icon = undefined,
        target = undefined,
        lock = undefined,
        onclick = undefined,
        buttonProps = undefined
    }: {
        title: string;
        url?: string;
        /** Section roots the item highlights on. Defaults to `url`. */
        match?: string[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        icon?: any;
        target?: string;
        /** Tooltip of the lock icon. The icon shows only with a value. */
        lock?: string;
        onclick?: () => void;
        /** Props of a menu trigger. They make the item a button. */
        buttonProps?: Record<string, unknown>;
    } = $props();

    const isActive = $derived(!!url && isItemActive(page.url.pathname, { url, match }));
</script>

{#if onclick || buttonProps}
    <button class="menu-item" type="button" {onclick} {...buttonProps}>
        {#if Icon}
            <span class="menu-icon"><Icon /></span>
        {/if}
        <span class="item-title">{title}</span>
    </button>
{:else}
    <a class="menu-item" class:active={isActive} href={url} {target}>
        {#if Icon}
            <span class="menu-icon"><Icon /></span>
        {/if}
        <span class="item-title">{title}</span>
        {#if lock}
            <span class="lock" title={lock} aria-label={lock}><LockIcon /></span>
        {/if}
    </a>
{/if}

<style lang="scss">
    .menu-item {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 0.5rem;
        border: none;
        border-left: 2px solid transparent;
        text-decoration: none;
        color: inherit;
        background: none;
        font: inherit;
        text-align: left;
        width: 100%;

        .menu-icon {
            display: flex;
            flex-shrink: 0;

            :global(svg) {
                width: 1rem;
                height: 1rem;
            }
        }

        .item-title {
            flex-grow: 1;
        }

        .lock {
            display: flex;
            flex-shrink: 0;
            color: var(--muted-foreground);

            :global(svg) {
                width: 0.875rem;
                height: 0.875rem;
            }
        }

        &:hover {
            color: var(--primary);
            background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
        }

        &.active {
            color: var(--primary);
            border-left-color: var(--primary);
            background-color: color-mix(in srgb, var(--background) 90%, var(--primary) 10%);
        }
    }
</style>
