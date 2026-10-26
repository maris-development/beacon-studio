<!-- Shown by an admin-only page while the selected node has no admin session. -->
<script lang="ts">
    import KeyRoundIcon from "@lucide/svelte/icons/key-round";
    import LockIcon from "@lucide/svelte/icons/lock";
    import Button from "@/components/buttons/Button.svelte";
    import type { BeaconNode } from "@/beacon-api/types";
    import { askSignIn } from "@/services/admin-session";
    import { t } from "@/i18n";

    let { node }: { node: BeaconNode } = $props();
</script>

<section class="session-required">
    <div class="tile">
        <LockIcon size={24} />
    </div>

    <h2>{$t("admin.sessionRequired.title")}</h2>

    <p>
        {$t("admin.sessionRequired.textBefore")}
        <strong>{node.name}</strong>
        {$t("admin.sessionRequired.textAfter")}
    </p>

    <Button onclick={() => void askSignIn(node)}>
        <KeyRoundIcon />
        {$t("admin.sessionRequired.button")}
    </Button>
</section>

<style lang="scss">
    .session-required {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        max-width: 28rem;
        margin: 1.5rem auto 0;
        padding: 2rem 1.5rem;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--card);
        text-align: center;

        h2 {
            margin: 0;
        }

        p {
            margin: 0;
            color: var(--muted-foreground);
            font-size: var(--font-size-sm);

            strong {
                color: var(--foreground);
            }
        }
    }

    .tile {
        display: grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        border-radius: 0.75rem;
        background: var(--admin-badge-background);
        color: white;

        // The middle of the gradient is light, so the white icon needs a shadow.
        :global(svg) {
            filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
        }
    }
</style>
