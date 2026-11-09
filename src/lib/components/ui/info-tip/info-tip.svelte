<script lang="ts">
    import InfoIcon from "@lucide/svelte/icons/info";
    import { Tooltip } from "bits-ui";

    interface Props {
        /** Accessible name of the button. */
        label: string;
        /** Text that shows on hover and on keyboard focus. */
        text: string;
    }

    let { label, text }: Props = $props();

    // The closed tooltip is not in the DOM, so aria-describedby points to a hidden copy of the text.
    const uid = $props.id();
    const contentId = `info-tip-${uid}`;
</script>

<Tooltip.Provider delayDuration={150}>
    <Tooltip.Root disableCloseOnTriggerClick>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <button
                    {...props}
                    type="button"
                    class="trigger"
                    aria-label={label}
                    aria-describedby={contentId}
                >
                    <InfoIcon size={14} aria-hidden="true" />
                </button>
            {/snippet}
        </Tooltip.Trigger>
        <span id={contentId} hidden>{text}</span>
        <!-- A scroll container around the button would clip the text, so it goes to the body. -->
        <Tooltip.Portal>
            <Tooltip.Content side="top" sideOffset={6} collisionPadding={8}>
                {#snippet child({ wrapperProps, props, open })}
                    {#if open}
                        <div {...wrapperProps}>
                            <div {...props} role="tooltip" class="content">
                                {text}
                            </div>
                        </div>
                    {/if}
                {/snippet}
            </Tooltip.Content>
        </Tooltip.Portal>
    </Tooltip.Root>
</Tooltip.Provider>

<style lang="scss">
    .trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.125rem;
        border: none;
        border-radius: 999px;
        background: none;
        color: var(--muted-foreground);
        cursor: help;

        &:hover,
        &[data-state="delayed-open"],
        &[data-state="instant-open"] {
            color: var(--foreground);
        }

        &:focus-visible {
            outline: none;
            box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 50%, transparent);
        }
    }

    .content {
        z-index: 50;
        max-width: 18rem;
        padding: 0.5rem 0.625rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background-color: var(--popover);
        color: var(--popover-foreground);
        box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
        font-size: var(--font-size-xs);
        line-height: 1.45;
    }
</style>
