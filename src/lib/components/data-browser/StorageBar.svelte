<!-- Disk use of the datasets store, as a card. Only with a session: it never asks for a sign-in. -->
<script lang="ts">
    import { untrack } from "svelte";
    import type { DatasetStorage } from "@maris-development/beacon-client";
    import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
    import StatTile from "@/components/system-info/StatTile.svelte";
    import type { BeaconNode } from "@/beacon-api/types";
    import { signedInNodeIds, withAdminSession } from "@/services/admin-session";
    import { settings } from "@/stores/settings";
    import { formatSize } from "@/data-browser/datasets";
    import { formatNumber, t } from "@/i18n";

    let { node }: { node: BeaconNode } = $props();

    let storage: DatasetStorage | null = $state(null);

    let nodeId = $derived(node.id);
    let nodeUrl = $derived(node.url);
    let active = $derived($settings.adminFeatures && $signedInNodeIds.has(nodeId));

    // A health check gives a new node object, so the effect tracks only the id and the URL.
    $effect(() => {
        storage = null;
        if (!active || !nodeUrl) return;

        let current = true;
        // `withAdminSession` signs out on a 401 and never asks for a sign-in.
        withAdminSession(
            untrack(() => node),
            (client) => client.admin.datasetStorage()
        ).then(
            (value) => {
                if (current) storage = value;
            },
            () => {
                if (current) storage = null;
            }
        );

        return () => (current = false);
    });
</script>

{#if storage}
    <div class="storage">
        {#if storage.used_percent !== null}
            <StatTile
                label={$t("dataBrowser.datasets.storage.title")}
                icon={HardDriveIcon}
                value={$formatNumber(storage.used_percent / 100, {
                    style: "percent",
                    maximumFractionDigits: 0
                })}
                detail={$t("dataBrowser.datasets.storage.usedOf", {
                    used: formatSize(storage.used_space, $formatNumber),
                    total: formatSize(storage.total_space, $formatNumber),
                    free: formatSize(storage.free_space, $formatNumber)
                })}
            >
                <div class="bar"><span style="width: {storage.used_percent}%"></span></div>
            </StatTile>
        {:else}
            <StatTile
                label={$t("dataBrowser.datasets.storage.title")}
                icon={HardDriveIcon}
                value={formatSize(storage.used_space, $formatNumber)}
                detail={$t("dataBrowser.datasets.storage.objects", {
                    used: formatSize(storage.used_space, $formatNumber),
                    count: storage.object_count ?? 0,
                    location: storage.location
                })}
            />
        {/if}
    </div>
{/if}

<style lang="scss">
    .storage {
        width: min(100%, 20rem);
        margin-bottom: 1rem;
    }

    .bar {
        height: 0.375rem;
        overflow: hidden;
        border-radius: 0.25rem;
        background: var(--secondary);

        span {
            display: block;
            height: 100%;
            background: var(--primary);
        }
    }
</style>
