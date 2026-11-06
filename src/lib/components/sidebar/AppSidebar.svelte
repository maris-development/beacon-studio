<script lang="ts">
    // Node service
    import { currentNode, nodes, selectFirstIfNone } from "@/services/beacon-node";
    import { ensureFresh } from "@/services/beacon-node-connect";
    import { openNodesSettled } from "@/services/open-nodes-import";
    import { BRAND } from "@/brand";

    // Svelte lifecycle and navigation
    import { onMount } from "svelte";
    import { goto, beforeNavigate, afterNavigate } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { page } from "$app/state";
    import { addToast, dismissToast } from "@/stores/toasts";
    import { openFeedback } from "$lib/feedback";
    import { t } from "@/i18n";

    // Icons
    import TextSearchIcon from "@lucide/svelte/icons/text-search";
    import BookOpenIcon from "@lucide/svelte/icons/book-open";
    import InfoIcon from "@lucide/svelte/icons/info";
    import Table2Icon from "@lucide/svelte/icons/table-2";
    import FilesIcon from "@lucide/svelte/icons/files";
    import LinkIcon from "@lucide/svelte/icons/link-2";
    import CpuIcon from "@lucide/svelte/icons/cpu";
    import ShieldIcon from "@lucide/svelte/icons/shield";
    import RadarIcon from "@lucide/svelte/icons/radar";
    import LifeBuoyIcon from "@lucide/svelte/icons/life-buoy";
    import SendIcon from "@lucide/svelte/icons/send";
    import Settings2Icon from "@lucide/svelte/icons/settings-2";
    import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
    import PanelLeftOpenIcon from "@lucide/svelte/icons/panel-left-open";
    import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";

    // Components
    import SidebarMenuItem from "./SidebarMenuItem.svelte";
    import SidebarCollapsibleMenu from "./SidebarCollapsibleMenu.svelte";
    import BuildVersion from "./BuildVersion.svelte";
    import LanguageMenu from "./LanguageMenu.svelte";
    import ThemeMenu from "./ThemeMenu.svelte";
    import { settings } from "@/stores/settings";
    import { signedInNodeIds } from "@/services/admin-session";
    import { isLocked, visibleGroups, type Group, type MenuItem } from "./menu";

    const groups: Group[] = [
        {
            title: "nav.group.explore",
            items: [
                {
                    title: "nav.item.queryBuilder",
                    url: resolve("/queries/workbench"),
                    // The result views belong to the workbench. The header switch opens them.
                    match: [resolve("/queries"), resolve("/visualisations")],
                    icon: TextSearchIcon
                }
            ]
        },
        {
            title: "nav.group.nodeManagement",
            items: [
                {
                    title: "nav.item.datasets",
                    url: resolve("/data-browser/datasets"),
                    icon: FilesIcon
                },
                {
                    title: "nav.item.dataTables",
                    url: resolve("/data-browser/data-tables"),
                    icon: Table2Icon
                },
                {
                    title: "nav.item.sqlConsole",
                    url: resolve("/sql-editor"),
                    icon: SquareTerminalIcon,
                    adminOnly: true
                },
                {
                    title: "nav.item.crawlers",
                    url: resolve("/data-browser/crawlers"),
                    icon: RadarIcon,
                    adminOnly: true
                },
                {
                    title: "nav.item.usersRoles",
                    url: resolve("/node-management/users-roles"),
                    icon: ShieldIcon,
                    adminOnly: true
                },
                { title: "nav.item.systemInfo", url: resolve("/system-info"), icon: CpuIcon }
            ]
        },
        {
            title: "nav.group.studio",
            items: [
                { title: "nav.item.beaconNodes", url: resolve("/beacon-nodes"), icon: LinkIcon },
                { title: "nav.item.settings", url: resolve("/settings"), icon: Settings2Icon }
            ]
        }
    ];

    const footerLinks: MenuItem[] = [
        {
            title: "nav.item.aboutStudio",
            url: BRAND.links.about,
            icon: InfoIcon,
            target: "_blank"
        },
        {
            title: "nav.item.documentation",
            url: BRAND.links.docs,
            icon: BookOpenIcon,
            target: "_blank"
        },
        {
            title: "nav.item.github",
            url: BRAND.links.source,
            icon: LifeBuoyIcon,
            target: "_blank"
        }
    ];

    let shownGroups = $derived(visibleGroups(groups, $settings.adminFeatures));

    let hasSession = $derived(!!$currentNode && $signedInNodeIds.has($currentNode.id));

    function lockOf(item: MenuItem): string | undefined {
        if (!isLocked(item, hasSession)) return undefined;
        if (!$currentNode) return $t("nav.adminLock.noNode");

        return $t("nav.adminLock.signIn", { node: $currentNode.name });
    }

    // A brand hides a link with a null URL.
    const shownFooterLinks = footerLinks.filter((item) => item.url !== null);

    // The layout owns both flags, because the page header holds the menu button.
    let {
        collapsed = $bindable(false),
        isMobile = false
    }: { collapsed?: boolean; isMobile?: boolean } = $props();

    const toggleLabel = $derived.by(() => {
        if (collapsed) return $t("nav.openMenu");
        return $t("nav.closeMenu");
    });

    // A short wait, so a mouse that only crosses the rail does not open it.
    const PEEK_DELAY_MS = 150;

    let hovered = $state(false);
    let keyboardFocus = $state(false);
    let languageMenuOpen = $state(false);
    let themeMenuOpen = $state(false);
    let peekTimer: ReturnType<typeof setTimeout> | undefined;

    // A collapsed sidebar opens over the page. An open footer menu keeps it open,
    // because the menu is outside the sidebar.
    const peek = $derived(
        collapsed && !isMobile && (hovered || keyboardFocus || languageMenuOpen || themeMenuOpen)
    );
    const compact = $derived(collapsed && !peek);

    function onPointerEnter(event: PointerEvent): void {
        // A touch has no hover, so a tap does not open the panel.
        if (event.pointerType !== "mouse") return;

        clearTimeout(peekTimer);
        peekTimer = setTimeout(() => (hovered = true), PEEK_DELAY_MS);
    }

    function onPointerLeave(): void {
        clearTimeout(peekTimer);
        hovered = false;
    }

    // The rail hides the toggle. Keyboard focus opens the panel, so a keyboard user can reach it.
    function onFocusIn(event: FocusEvent): void {
        if (event.target instanceof Element && event.target.matches(":focus-visible")) {
            keyboardFocus = true;
        }
    }

    function onFocusOut(event: FocusEvent): void {
        const next = event.relatedTarget;
        if (next instanceof Node && (event.currentTarget as Element).contains(next)) return;

        keyboardFocus = false;
    }

    function toggleCollapsed(): void {
        collapsed = !collapsed;

        // A collapse under the mouse closes the panel. It opens again on the next entry.
        clearTimeout(peekTimer);
        hovered = false;
        keyboardFocus = false;
    }

    // The sidebar shows the status of the selection on every page. Refresh a
    // stale result. `ensureFresh` skips a check that is not due.
    $effect(() => {
        const node = $currentNode;
        if (node) void ensureFresh(node);
    });

    // The routes that work with an empty list. Both of them can add a node.
    const NODE_FREE_ROUTES = new Set(["/", "/beacon-nodes"]);

    // `page.route.id` carries no base path, so it needs no `resolve`.
    function needsNode(routeId: string | null | undefined): boolean {
        return !NODE_FREE_ROUTES.has(routeId ?? "");
    }

    function warnNoNode(): void {
        addToast({ type: "error", key: "nav.needsNode" });
    }

    // The app needs at least one node for every route but the two above: this
    // selection is the node of the browse pages and of a new query, and a query
    // record holds its own node. Block the navigation instead of following it, so
    // the user stays on the page they came from and sees why the target failed.
    beforeNavigate((navigation) => {
        // The public list can still add a node. Let the move through until it lands.
        if (!$openNodesSettled) return;
        if ($nodes.length > 0) return;
        if (!needsNode(navigation.to?.route.id)) return;

        navigation.cancel();
        warnNoNode();
    });

    onMount(() => {
        // Give the browse pages a node, with no modal. A query carries its own node,
        // and the builder asks for one where it is missing.
        selectFirstIfNone();
    });

    // `beforeNavigate` never runs for the page a session opens on. A direct load of
    // a blocked route (a bookmark, a refresh, a shared link) has no prior page to
    // stay on, so send it home instead. A first visit has no saved node, so this
    // waits for the public list before the app gives up on the page.
    $effect(() => {
        if (!$openNodesSettled) return;
        if ($nodes.length > 0) return;
        if (!needsNode(page.route.id)) return;

        warnNoNode();
        goto(resolve("/"));
    });

    // The id of the open "please wait" toast. A plain let, so the effect below
    // does not re-run on its own write.
    let waitToastId: number | null = null;

    // Name the wait. The app reads the public node list on a first visit only.
    $effect(() => {
        if ($openNodesSettled) {
            if (waitToastId !== null) {
                dismissToast(waitToastId);
                waitToastId = null;
            }
            return;
        }

        if (waitToastId !== null) return;
        if ($nodes.length > 0) return;
        if (!needsNode(page.route.id)) return;

        waitToastId = addToast({
            type: "info",
            timeout: 0,
            key: "nav.waitForNodes"
        });
    });

    // Close the overlay sidebar after navigating on mobile
    afterNavigate(() => {
        if (isMobile) collapsed = true;
    });
</script>

{#if isMobile && !collapsed}
    <button
        class="sidebar-backdrop"
        aria-label={$t("nav.closeMenu")}
        onclick={() => (collapsed = true)}
    ></button>
{/if}

<div class="sidebar-slot" class:collapsed>
    <div
        class="sidebar"
        class:collapsed
        class:compact
        class:peek
        onpointerenter={onPointerEnter}
        onpointerleave={onPointerLeave}
        onfocusin={onFocusIn}
        onfocusout={onFocusOut}
    >
        <div class="sidebar-header">
            <div class="logo-wrapper">
                <a class="header-link" href={resolve("/")} title={compact ? BRAND.name : undefined}>
                    <img src={BRAND.logo} alt={$t("app.logoAlt")} class="beacon-logo" />
                    <span class="app-name">{BRAND.name}</span>
                </a>
                <button
                    class="collapse-toggle"
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                    title={toggleLabel}
                    onclick={(e) => {
                        e.stopPropagation();
                        toggleCollapsed();
                    }}
                >
                    {#if collapsed}
                        <PanelLeftOpenIcon class="toggle-icon" />
                    {:else}
                        <PanelLeftCloseIcon class="toggle-icon" />
                    {/if}
                </button>
            </div>
        </div>

        <div class="sidebar-content">
            {#each shownGroups as group (group.title)}
                <div class="menu-group">
                    <span class="menu-title">{$t(group.title)}</span>
                    {#each group.items as item (item.url)}
                        {#if item.children?.length}
                            <SidebarCollapsibleMenu
                                title={$t(item.title)}
                                url={item.url}
                                match={item.match}
                                icon={item.icon}
                                items={item.children.map((child) => ({
                                    title: $t(child.title),
                                    url: child.url
                                }))}
                                {compact}
                            />
                        {:else}
                            <SidebarMenuItem
                                title={$t(item.title)}
                                url={item.url}
                                match={item.match}
                                icon={item.icon}
                                lock={lockOf(item)}
                                {compact}
                            />
                        {/if}
                    {/each}
                </div>
            {/each}
        </div>

        <div class="sidebar-footer">
            <div class="menu-group">
                {#each shownFooterLinks as item (item.url)}
                    <SidebarMenuItem
                        title={$t(item.title)}
                        url={item.url}
                        icon={item.icon}
                        target={item.target}
                        {compact}
                    />
                {/each}
                <LanguageMenu {compact} bind:open={languageMenuOpen} />
                <ThemeMenu {compact} bind:open={themeMenuOpen} />
                <SidebarMenuItem
                    title={$t("nav.item.feedback")}
                    icon={SendIcon}
                    onclick={() => openFeedback(page.route.id)}
                    {compact}
                />
            </div>
        </div>
    </div>
</div>

<BuildVersion />

<style lang="scss">
    // Holds the place of the sidebar in the layout. The page then stays put while a collapsed sidebar opens.
    .sidebar-slot {
        display: flex;
        position: relative;

        &.collapsed {
            flex-shrink: 0;
            width: 3.25rem;
        }

        // The phone sidebar is an overlay and takes no place.
        @media (max-width: 767px) {
            display: contents;
        }
    }

    .sidebar {
        --sidebar-bold-font-weight: 600;

        background: var(--sidebar);
        border-right: 1px solid var(--sidebar-border);

        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        min-width: 250px;
        // Keep the sidebar inside the viewport. The menu list scrolls on its own.
        max-height: 100dvh;
        overflow: hidden;
        transition:
            min-width 0.2s ease,
            width 0.2s ease,
            box-shadow 0.2s ease;

        .sidebar-header {
            flex-shrink: 0;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--sidebar-border);

            .logo-wrapper {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                // No side padding: the logo then lines up with the menu icons.
                padding: 0.5rem 0;

                .header-link {
                    flex-grow: 1;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    text-decoration: none;
                    color: inherit;
                    border-radius: 0.5rem;

                    .beacon-logo {
                        width: 1.75rem;
                        height: 1.75rem;
                        // padding: 0.5rem;
                        margin: 0.25rem;
                    }

                    .app-name {
                        flex-grow: 1;
                        font-size: var(--font-size-md);
                        font-weight: 600;
                        line-height: 1.5rem;
                        margin: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }

                    &:hover {
                        background-color: color-mix(
                            in srgb,
                            var(--background) 90%,
                            var(--primary) 10%
                        );
                    }
                }

                .collapse-toggle {
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0.25rem;
                    border-radius: 0.375rem;
                    color: inherit;

                    :global(.toggle-icon) {
                        width: 1rem;
                        height: 1rem;
                    }

                    &:hover {
                        background-color: color-mix(
                            in srgb,
                            var(--background) 90%,
                            var(--primary) 10%
                        );
                    }
                }
            }
        }

        .sidebar-content {
            flex-grow: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .sidebar-footer {
            flex-shrink: 0;

            .menu-group {
                border-top: 1px solid var(--sidebar-border);
            }
        }

        .menu-group {
            padding-top: 1rem;
            padding-bottom: 1rem;
            gap: 0.5rem;
            display: flex;
            flex-direction: column;

            .menu-title {
                font-size: var(--font-size-xs);
                font-weight: 600;
                line-height: 1rem;
                text-transform: uppercase;
                color: var(--foreground);
            }

            :global(> .menu-item > .item-title),
            :global(.submenu-title) {
                font-weight: var(--sidebar-bold-font-weight);
            }
        }

        // Collapsed: the sidebar lies over the page, so a hover can open it without a page reflow.
        // The labels stay on one line, so every icon keeps the place it has in the open sidebar.
        &.collapsed {
            white-space: nowrap;

            @media (min-width: 768px) {
                position: absolute;
                top: 0;
                bottom: 0;
                left: 0;
                z-index: 30;
                min-width: unset;
                width: 3.25rem;
            }
        }

        &.peek {
            width: 250px;
            box-shadow: 0 0 1rem rgba(0, 0, 0, 0.15);
        }

        // Compact: an icon rail. Each element keeps its height, so no icon moves.
        &.compact {
            .sidebar-header .logo-wrapper {
                .header-link .app-name {
                    opacity: 0;
                }

                .collapse-toggle {
                    display: none;
                }
            }

            .sidebar-content {
                scrollbar-width: none;
            }

            // A line replaces the group title.
            .menu-group .menu-title {
                color: transparent;
                background: linear-gradient(var(--sidebar-border), var(--sidebar-border)) center /
                    100% 1px no-repeat;
            }
        }

        // --- Mobile: overlay the content instead of taking layout space ---
        @media (max-width: 767px) {
            position: fixed;
            top: 0;
            left: 0;
            height: 100dvh;
            width: 16rem;
            max-width: 85vw;
            z-index: 50;
            background: var(--app-background);
            box-shadow: 0 0 1rem rgba(0, 0, 0, 0.25);

            // Closed: leave the screen. The page header keeps the menu button.
            &.collapsed {
                display: none;
            }
        }
    }

    .sidebar-backdrop {
        position: fixed;
        inset: 0;
        z-index: 40;
        border: none;
        padding: 0;
        background: var(--overlay);
        cursor: pointer;
    }
</style>
