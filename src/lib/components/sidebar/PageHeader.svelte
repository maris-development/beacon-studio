<script lang="ts">
    import MenuIcon from "@lucide/svelte/icons/menu";
    import { resolve } from "$app/paths";
    import { BRAND } from "@/brand";
    import { t } from "@/i18n";

    let { open, onToggle }: { open: boolean; onToggle: () => void } = $props();

    const label = $derived.by(() => {
        if (open) {
            return $t("nav.closeMenu");
        }
        return $t("nav.openMenu");
    });
</script>

<header class="page-header">
    <button class="menu-toggle" aria-label={label} aria-expanded={open} onclick={onToggle}>
        <MenuIcon class="toggle-icon" />
    </button>
    <a class="header-link" href={resolve("/")}>
        <img src={BRAND.logo} alt={$t("app.logoAlt")} class="beacon-logo" />
        <span class="app-name">{$t("app.logoText")}</span>
    </a>
</header>

<style lang="scss">
    // The bar carries the menu button on a phone. A wide screen shows the
    // sidebar itself, so it needs no bar.
    .page-header {
        display: none;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--page-header-background);
        color: var(--sidebar-header-foreground);
        border-bottom: 1px solid var(--sidebar-border);

        @media (max-width: 767px) {
            display: flex;
        }

        .menu-toggle {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.375rem;
            border-radius: 0.375rem;
            color: inherit;

            :global(.toggle-icon) {
                width: 1.25rem;
                height: 1.25rem;
            }

            &:hover {
                background-color: var(--sidebar-header-hover);
            }
        }

        .header-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            text-decoration: none;
            color: inherit;

            // The width follows the logo shape, so a wide brand logo needs only a height.
            .beacon-logo {
                flex-shrink: 0;
                width: auto;
                height: var(--page-header-logo-height);
            }

            .app-name {
                font-size: var(--font-size-md);
                font-weight: 600;
                line-height: 1.5rem;
                white-space: nowrap;
            }
        }
    }
</style>
