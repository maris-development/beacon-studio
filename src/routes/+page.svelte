<script lang="ts">
    import { nodes } from "@/services/beacon-node";
    import { ensureFresh, ensureHostNode } from "@/services/beacon-node-connect";
    import Cookiecrumb from "@/components/cookiecrumb/CookieCrumb.svelte";
    import Card from "@/components/card/Card.svelte";
    import HeroNetwork from "@/components/HeroNetwork.svelte";
    import BeaconNodeStatus from "@/components/BeaconNodeStatus.svelte";
    import HowItWorks from "@/components/home/HowItWorks.svelte";
    import QuickStartExamples from "@/components/home/QuickStartExamples.svelte";
    import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import { openNodesSettled } from "@/services/open-nodes-import";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import Button from "@/components/buttons/Button.svelte";
    import { addToast } from "@/stores/toasts";
    import { t } from "@/i18n";
    import { BRAND } from "@/brand";

    import { resolve } from "$app/paths";

    const BETA_TOAST_STORAGE_KEY = "beacon-studio.home.beta-toast-shown";

    // The Connected Nodes card cycles through every configured node, so
    // each one needs a true status dot. `ensureFresh` skips a check that is not due.
    $effect(() => {
        for (const node of $nodes) void ensureFresh(node);
    });

    const CYCLE_INTERVAL_MS = 5_000;

    /** Advances every `CYCLE_INTERVAL_MS`. The Connected Nodes card uses it to
     * step through `$nodes`. */
    let cycleIndex = $state(0);

    /** The node the Connected Nodes card shows now, or `null` if none is configured. */
    let displayedNode = $derived($nodes.length > 0 ? $nodes[cycleIndex % $nodes.length] : null);

    // A first visit has no node until the public list lands, so wait for it.
    let needsNode = $derived($openNodesSettled && $nodes.length === 0);

    onMount(() => {
        // The app can run on the same host as a Beacon node. Add that node once.
        void ensureHostNode(window.location.origin);

        if (!localStorage.getItem(BETA_TOAST_STORAGE_KEY)) {
            addToast({
                type: "info",
                timeout: 20000,
                key: "home.betaToast"
            });
            localStorage.setItem(BETA_TOAST_STORAGE_KEY, "true");
        }

        const timer = setInterval(() => (cycleIndex += 1), CYCLE_INTERVAL_MS);
        return () => clearInterval(timer);
    });
</script>

<svelte:head>
    <title>{BRAND.name}</title>
</svelte:head>

<Cookiecrumb />

<HeroNetwork />

{#snippet connectedNodes()}
    <section class="home-section">
        <h2>{$t("home.nodes.title", { count: $nodes.length })}</h2>

        <div class="connected-nodes">
            <Card>
                <div class="current-node">
                    {#key displayedNode?.id ?? "none"}
                        <div class="cycle-content" transition:fade={{ duration: 500 }}>
                            {#if displayedNode}
                                <div class="current-node-info">
                                    <div class="name-url">
                                        <p class="name">{displayedNode.name}</p>
                                        <a
                                            class="url"
                                            href={displayedNode.url}
                                            rel="noopener noreferrer"
                                            target="_blank">{displayedNode.url}</a
                                        >
                                    </div>
                                    <BeaconNodeStatus health={displayedNode} />
                                </div>
                            {:else}
                                <p class="no-node">{$t("home.nodes.empty")}</p>
                            {/if}
                        </div>
                    {/key}
                </div>
                <Button href={resolve("/beacon-nodes")}>{$t("home.nodes.manage")}</Button>
            </Card>
        </div>
    </section>
{/snippet}

<div class="page-wrapper">
    <div class="header">
        <h1 class="title">
            {$t("home.title.beforeHighlight")}
            <span class="highlight">{$t("home.title.highlight")}</span>
        </h1>
        <p class="subtitle">{$t("home.subtitle")}</p>
        <div class="start">
            {#if needsNode}
                <Button size="lg" href={resolve("/beacon-nodes")}>
                    <PlusIcon />
                    {$t("home.start.addNode")}
                </Button>
            {:else}
                <Button size="lg" href={resolve("/queries/workbench")}>
                    {$t("home.start.explore")}
                    <ArrowRightIcon />
                </Button>
            {/if}
        </div>
    </div>

    {#if needsNode}
        {@render connectedNodes()}
    {/if}

    <section class="home-section">
        <QuickStartExamples />
    </section>

    <section class="home-section">
        <HowItWorks />
    </section>

    {#if !needsNode}
        {@render connectedNodes()}
    {/if}
</div>

<style lang="scss">
    .page-wrapper {
        padding: 2rem;

        :global(.card) {
            background-color: var(--background);
        }

        .header {
            padding-bottom: 3rem;
            .title {
                .highlight {
                    color: var(--highlight);
                }
            }

            .start {
                margin-top: 1.5rem;
            }
        }

        .home-section + .home-section {
            margin-top: 3rem;
        }

        .connected-nodes {
            :global(.card-content) {
                display: flex;
                flex-direction: row;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
            }
        }

        .current-node {
            // Grid stacks the outgoing and incoming .cycle-content in one cell, so
            // the crossfade overlaps in place instead of shifting the layout.
            display: grid;
            flex: 1;

            .cycle-content {
                grid-column: 1;
                grid-row: 1;
            }

            .no-node {
                color: var(--muted-foreground);
            }

            .current-node-info {
                display: flex;
                flex-direction: row;
                align-items: center;
                gap: 1rem;

                .name-url {
                    display: flex;
                    flex-direction: column;

                    p {
                        margin: 0;
                        font-weight: bold;
                    }
                    .url {
                        color: var(--primary);
                    }
                }
            }
        }
    }
</style>
