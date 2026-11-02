<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { page } from "$app/state";
    import { untrack } from "svelte";
    import type { CatalogTable } from "@maris-development/beacon-client";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import EyeIcon from "@lucide/svelte/icons/eye";
    import Table2Icon from "@lucide/svelte/icons/table-2";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import Button from "@/components/buttons/Button.svelte";
    import { Badge } from "@/components/ui/badge";
    import ListCard from "@/components/data-browser/ListCard.svelte";
    import SearchInput from "@/components/input/SearchInput.svelte";
    import Cookiecrumb from "@/components/cookiecrumb/CookieCrumb.svelte";
    import NodePicker from "@/components/NodePicker.svelte";
    import AdminAction from "@/components/AdminAction.svelte";
    import CreateViewDialog from "@/components/data-browser/CreateViewDialog.svelte";
    import CreateExternalTableDialog from "@/components/data-browser/CreateExternalTableDialog.svelte";
    import { makeBeaconClient } from "@/beacon-api/client";
    import { currentNode } from "@/services/beacon-node";
    import { track } from "@/telemetry";
    import { withBack } from "@/data-browser/back";
    import { DATASET_LIST_LIMIT, parseEntries } from "@/data-browser/datasets";
    import { splitTree, tableDetailQuery, tableKind } from "@/data-browser/tables";
    import { buildTree, filterTree, type CatalogTree } from "@/sql/catalog";
    import type { TableRef } from "@/sql/identifiers";
    import { sqlError } from "@/sql/statement";
    import { t, type Message } from "@/i18n";

    type Dialog = "view" | "materialized" | "external" | null;

    let tree: CatalogTree | null = $state(null);
    let defaultTable: string | null = $state(null);
    let loading = $state(false);
    let error: Message | null = $state(null);
    // `q` is the parameter of old bookmarks.
    let needle = $state(
        page.url.searchParams.get("search") ?? page.url.searchParams.get("q") ?? ""
    );
    let othersOpen = $state(false);
    let dialog: Dialog = $state(null);

    let node = $derived($currentNode);
    let nodeUrl = $derived(node?.url ?? null);

    let shown = $derived.by(() => {
        if (!tree) return null;
        return splitTree(filterTree(tree, needle));
    });

    let searching = $derived(needle.trim() !== "");

    let wasSearching = false;

    // A search opens the other schemas once. The user can fold them again.
    $effect(() => {
        if (searching && !wasSearching) othersOpen = true;
        wasSearching = searching;
    });

    $effect(() => {
        if (!nodeUrl) return;
        untrack(() => load());
    });

    async function load() {
        const current = node;
        if (!current) return;

        const client = makeBeaconClient(current);
        // The tree of the previous node must not link to this node.
        tree = null;
        defaultTable = null;
        loading = true;
        error = null;

        try {
            const [view, fallback] = await Promise.all([
                client.catalogs(),
                client.defaultTable<unknown>().catch(() => null)
            ]);

            // A node switch during the load makes this answer stale.
            if (current.url !== nodeUrl) return;

            tree = buildTree(view);
            if (typeof fallback === "string") {
                defaultTable = fallback;
            } else {
                defaultTable = null;
            }
        } catch (caught) {
            if (current.url === nodeUrl) {
                tree = null;
                error = sqlError(caught);
            }
        } finally {
            if (current.url === nodeUrl) loading = false;
        }
    }

    function listUrl(): string {
        const url = new URL(page.url);
        url.searchParams.delete("q");
        if (needle.trim() === "") {
            url.searchParams.delete("search");
        } else {
            url.searchParams.set("search", needle.trim());
        }
        return `${url.pathname}${url.search}`;
    }

    function detailHref(ref: TableRef): string {
        if (!tree || !node) return "#";

        const href = `${resolve("/data-browser/data-tables/detail")}?${tableDetailQuery(ref, tree.defaults, node.url)}`;
        return withBack(href, listUrl());
    }

    function onSearch() {
        if (searching && shown) {
            const results = shown.defaultTables.length;
            track("browser.search", {
                props: { scope: "tables", term: needle.trim().slice(0, 60), results }
            });
        }
    }

    async function loadPaths(): Promise<string[]> {
        if (!node) return [];

        const list = await makeBeaconClient(node).datasets({ limit: DATASET_LIST_LIMIT });
        return parseEntries(list).map((entry) => entry.path);
    }

    function onCreated(name: string) {
        dialog = null;
        if (!tree || !node) return;

        const ref = { catalog: tree.defaults.catalog, schema: tree.defaults.schema, name };
        goto(detailHref(ref));
    }
</script>

<svelte:head>
    <title>{$t("app.pageTitle", { page: $t("nav.item.dataTables") })}</title>
</svelte:head>

{#snippet tableRow(table: CatalogTable, ref: TableRef, isDefault: boolean)}
    <li>
        <a href={detailHref(ref)}>
            {#if tableKind(table.table_type) === "view"}
                <EyeIcon class="kind-icon size-4" />
                <span class="name">{table.name}</span>
                <Badge variant="outline">{$t("dataBrowser.tables.kindView")}</Badge>
            {:else}
                <Table2Icon class="kind-icon size-4" />
                <span class="name">{table.name}</span>
                <Badge variant="outline">{$t("dataBrowser.tables.kindTable")}</Badge>
            {/if}
            {#if isDefault}
                <Badge>{$t("dataBrowser.tables.default")}</Badge>
            {/if}
        </a>
    </li>
{/snippet}

<Cookiecrumb
    crumbs={[
        { label: $t("nav.item.dataBrowser"), href: resolve("/data-browser") },
        { label: $t("nav.item.dataTables"), href: resolve("/data-browser/data-tables") }
    ]}
/>

<div class="page-wrapper">
    <div class="page-container plain">
        <h1>{$t("nav.item.dataTables")}</h1>

        <p class="page-intro">{$t("dataBrowser.tables.intro")}</p>

        <NodePicker>
            {#snippet actions()}
                <AdminAction>
                    {#snippet children({ disabled })}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger disabled={disabled || !node}>
                                <Button variant="outline" disabled={disabled || !node}>
                                    {$t("dataBrowser.tables.create")}
                                </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content class="w-52">
                                <DropdownMenu.Item onclick={() => (dialog = "view")}>
                                    {$t("dataBrowser.tables.createView")}
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onclick={() => (dialog = "materialized")}>
                                    {$t("dataBrowser.tables.createMaterialized")}
                                </DropdownMenu.Item>
                                <DropdownMenu.Item onclick={() => (dialog = "external")}>
                                    {$t("dataBrowser.tables.createExternal")}
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    {/snippet}
                </AdminAction>
            {/snippet}
        </NodePicker>

        {#if !node}
            <p>{$t("dataBrowser.common.pickNode")}</p>
        {:else}
            <ListCard>
                {#snippet head()}
                    {#if shown}
                        <span class="schema"
                            >{shown.others.defaults.catalog}.{shown.others.defaults.schema}</span
                        >
                    {/if}
                {/snippet}

                {#snippet tools()}
                    <SearchInput
                        placeholder={$t("dataBrowser.tables.search")}
                        bind:value={needle}
                        onchange={onSearch}
                    />
                {/snippet}

                {#if loading && !tree}
                    <p class="state muted">{$t("dataBrowser.tables.loading")}</p>
                {:else if error}
                    <p class="state error">{$t(error)}</p>
                {:else if shown}
                    {#if shown.defaultTables.length === 0}
                        {#if searching}
                            <p class="state muted">{$t("dataBrowser.tables.noMatch")}</p>
                        {:else}
                            <p class="state muted">{$t("dataBrowser.tables.empty")}</p>
                        {/if}
                    {:else}
                        <ul class="tables">
                            {#each shown.defaultTables as table (table.name)}
                                {@render tableRow(
                                    table,
                                    {
                                        catalog: shown.others.defaults.catalog,
                                        schema: shown.others.defaults.schema,
                                        name: table.name
                                    },
                                    table.name === defaultTable
                                )}
                            {/each}
                        </ul>
                    {/if}

                    {#if shown.others.catalogs.length > 0}
                        <details class="others" open={othersOpen}>
                            <summary
                                onclick={(event) => {
                                    event.preventDefault();
                                    othersOpen = !othersOpen;
                                }}
                            >
                                <ChevronRightIcon class="chevron size-4" />
                                {$t("dataBrowser.tables.otherSchemas")}
                            </summary>

                            {#each shown.others.catalogs as catalog (catalog.name)}
                                {#each catalog.schemas as schema (schema.name)}
                                    <h3 class="schema-title">{catalog.name}.{schema.name}</h3>
                                    <ul class="tables">
                                        {#each schema.tables as table (table.name)}
                                            {@render tableRow(
                                                table,
                                                {
                                                    catalog: catalog.name,
                                                    schema: schema.name,
                                                    name: table.name
                                                },
                                                false
                                            )}
                                        {/each}
                                    </ul>
                                {/each}
                            {/each}
                        </details>
                    {/if}
                {/if}
            </ListCard>
        {/if}
    </div>
</div>

{#if node && (dialog === "view" || dialog === "materialized")}
    <CreateViewDialog
        {node}
        materialized={dialog === "materialized"}
        onClose={() => (dialog = null)}
        {onCreated}
    />
{/if}

{#if node && dialog === "external"}
    <CreateExternalTableDialog {node} {loadPaths} onClose={() => (dialog = null)} {onCreated} />
{/if}

<style lang="scss">
    .schema {
        font-weight: 600;
    }

    .state {
        margin: 0;
        padding: 1rem;
    }

    .tables {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: var(--font-size-sm);

        li + li {
            border-top: 1px solid var(--border);
        }

        a {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem 1rem;
            color: inherit;
            text-decoration: none;

            &:hover {
                background: color-mix(in srgb, var(--muted) 50%, transparent);
            }
        }

        :global(.kind-icon) {
            flex-shrink: 0;
            color: var(--muted-foreground);
        }
    }

    .name {
        font-weight: 500;
        word-break: break-all;
    }

    .others {
        border-top: 1px solid var(--border);

        summary {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0.625rem 1rem;
            cursor: pointer;
            font-weight: 600;
            list-style: none;
        }

        &[open] :global(.chevron) {
            transform: rotate(90deg);
        }
    }

    .schema-title {
        margin: 0;
        padding: 0.75rem 1rem 0.25rem;
        color: var(--muted-foreground);
    }

    .muted {
        color: var(--muted-foreground);
    }

    .error {
        color: var(--destructive);
    }
</style>
