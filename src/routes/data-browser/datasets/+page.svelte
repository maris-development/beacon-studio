<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { page } from "$app/state";
    import { untrack } from "svelte";
    import FolderIcon from "@lucide/svelte/icons/folder";
    import FileIcon from "@lucide/svelte/icons/file";
    import HouseIcon from "@lucide/svelte/icons/house";
    import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
    import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
    import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
    import Button from "@/components/buttons/Button.svelte";
    import { Badge } from "@/components/ui/badge";
    import Cookiecrumb from "@/components/cookiecrumb/CookieCrumb.svelte";
    import NodePicker from "@/components/NodePicker.svelte";
    import AdminAction from "@/components/AdminAction.svelte";
    import UploadDialog from "@/components/data-browser/UploadDialog.svelte";
    import StorageBar from "@/components/data-browser/StorageBar.svelte";
    import ListCard from "@/components/data-browser/ListCard.svelte";
    import SearchInput from "@/components/input/SearchInput.svelte";
    import { makeBeaconClient } from "@/beacon-api/client";
    import { currentNode } from "@/services/beacon-node";
    import { track } from "@/telemetry";
    import { withBack } from "@/data-browser/back";
    import { normalizeFolder } from "@/data-browser/folders";
    import {
        DATASET_LIST_LIMIT,
        datasetDetailQuery,
        fileName,
        folderParts,
        formatSize,
        listFolder,
        parseEntries,
        searchEntries,
        sortFiles,
        type DatasetEntry,
        type FileSort
    } from "@/data-browser/datasets";
    import { parseDate } from "@/data-browser/editor-link";
    import { sqlError } from "@/sql/statement";
    import { formatDate, formatNumber, t, type Message } from "@/i18n";

    const PAGE_SIZE = 100;
    const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

    let loadedUrl: string | null = null;

    let entries: DatasetEntry[] = $state([]);
    let loading = $state(false);
    let error: Message | null = $state(null);
    let uploadOpen = $state(false);
    // `q` is the parameter of old bookmarks.
    let needle = $state(
        page.url.searchParams.get("search") ?? page.url.searchParams.get("q") ?? ""
    );
    let sortKey: FileSort = $state("name");
    let sortDirection: "asc" | "desc" = $state("asc");
    // The page lives in the URL, so browser Back restores it with the folder.
    let requestedPage = $derived(Number(page.url.searchParams.get("page") ?? "1") || 1);

    let node = $derived($currentNode);
    let nodeUrl = $derived(node?.url ?? null);
    let folder = $derived(normalizeFolder(page.url.searchParams.get("folder") ?? ""));
    let searching = $derived(needle.trim() !== "");
    let cut = $derived(entries.length >= DATASET_LIST_LIMIT);

    let listing = $derived.by(() => {
        if (searching) {
            return {
                folders: [],
                files: sortFiles(searchEntries(entries, needle), sortKey, sortDirection)
            };
        }

        const { folders, files } = listFolder(entries, folder);
        return { folders, files: sortFiles(files, sortKey, sortDirection) };
    });

    let rowCount = $derived(listing.folders.length + listing.files.length);
    let pageCount = $derived(Math.max(1, Math.ceil(rowCount / PAGE_SIZE)));
    // A new folder or search can hold fewer pages than the page asked for.
    let pageIndex = $derived(Math.min(Math.max(1, requestedPage), pageCount));
    let pageFolders = $derived(
        listing.folders.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE)
    );
    let pageFiles = $derived.by(() => {
        const start = Math.max(0, (pageIndex - 1) * PAGE_SIZE - listing.folders.length);
        const room = PAGE_SIZE - pageFolders.length;
        return listing.files.slice(start, start + room);
    });

    $effect(() => {
        if (!nodeUrl) return;
        untrack(() => load());
    });

    async function load() {
        const current = node;
        if (!current) return;

        const client = makeBeaconClient(current);
        loading = true;
        error = null;

        // Another node: its file list and folder must not show under the new node.
        if (loadedUrl !== null && current.url !== loadedUrl) {
            entries = [];
            resetLocation();
        }
        loadedUrl = current.url;

        try {
            const raw = await client.datasets({ limit: DATASET_LIST_LIMIT });
            if (current.url !== nodeUrl) return;

            entries = parseEntries(raw);
        } catch (caught) {
            if (current.url === nodeUrl) {
                entries = [];
                error = sqlError(caught);
            }
        } finally {
            if (current.url === nodeUrl) loading = false;
        }
    }

    function listHref(nextFolder: string): string {
        const url = new URL(resolve("/data-browser/datasets"), page.url.origin);
        if (nextFolder) url.searchParams.set("folder", nextFolder);
        return `${url.pathname}${url.search}`;
    }

    function backUrl(): string {
        const url = new URL(page.url);
        url.searchParams.delete("q");
        if (needle.trim()) {
            url.searchParams.set("search", needle.trim());
        } else {
            url.searchParams.delete("search");
        }
        url.searchParams.set("page", String(pageIndex));
        return `${url.pathname}${url.search}`;
    }

    function detailHref(entry: DatasetEntry): string {
        if (!node) return "#";
        const href = `${resolve("/data-browser/datasets/detail")}?${datasetDetailQuery(entry.path, node.url)}`;
        return withBack(href, backUrl());
    }

    function goToPage(next: number) {
        const url = new URL(page.url);
        if (next <= 1) {
            url.searchParams.delete("page");
        } else {
            url.searchParams.set("page", String(next));
        }
        goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
    }

    function resetLocation() {
        const url = new URL(page.url);
        url.searchParams.delete("folder");
        url.searchParams.delete("page");
        if (url.search === page.url.search) return;
        goto(`${url.pathname}${url.search}`, {
            keepFocus: true,
            noScroll: true,
            replaceState: true
        });
    }

    function openFolder(path: string) {
        needle = "";
        goto(listHref(path), { keepFocus: true, noScroll: true });
    }

    function setSort(key: FileSort) {
        if (sortKey === key) {
            if (sortDirection === "asc") {
                sortDirection = "desc";
            } else {
                sortDirection = "asc";
            }
        } else {
            sortKey = key;
            sortDirection = "asc";
        }
    }

    function ariaSort(key: FileSort): "ascending" | "descending" | "none" {
        if (sortKey !== key) return "none";
        if (sortDirection === "asc") return "ascending";
        return "descending";
    }

    function onSearch() {
        if (requestedPage !== 1) goToPage(1);
        if (searching) {
            track("browser.search", {
                props: {
                    scope: "datasets",
                    term: needle.trim().slice(0, 60),
                    results: listing.files.length
                }
            });
        }
    }
</script>

<svelte:head>
    <title>{$t("app.pageTitle", { page: $t("nav.item.datasets") })}</title>
</svelte:head>

{#snippet sortMark(key: FileSort)}
    {#if sortKey === key}
        {#if sortDirection === "asc"}
            <ArrowUpIcon size={12} aria-hidden="true" />
        {:else}
            <ArrowDownIcon size={12} aria-hidden="true" />
        {/if}
    {/if}
{/snippet}

<Cookiecrumb
    crumbs={[
        { label: $t("nav.item.dataBrowser"), href: resolve("/data-browser") },
        { label: $t("nav.item.datasets"), href: resolve("/data-browser/datasets") }
    ]}
/>

<div class="page-wrapper">
    <div class="page-container plain">
        <h1>{$t("nav.item.datasets")}</h1>

        <p class="page-intro">{$t("dataBrowser.datasets.intro")}</p>

        <NodePicker>
            {#snippet actions()}
                <AdminAction>
                    {#snippet children({ disabled })}
                        <Button
                            variant="outline"
                            disabled={disabled || !node}
                            onclick={() => (uploadOpen = true)}
                        >
                            {$t("dataBrowser.datasets.upload")}
                        </Button>
                    {/snippet}
                </AdminAction>
            {/snippet}
        </NodePicker>

        {#if !node}
            <p>{$t("dataBrowser.datasets.pickNode")}</p>
        {:else}
            <StorageBar {node} />

            {#if cut}
                <p class="warning">
                    {$t("dataBrowser.datasets.listCut", { limit: DATASET_LIST_LIMIT })}
                </p>
            {/if}

            <ListCard>
                {#snippet head()}
                    {#if !searching}
                        <nav class="path" aria-label={$t("dataBrowser.datasets.folderNav")}>
                            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- listHref resolves the path -->
                            <a
                                href={listHref("")}
                                aria-label={$t("dataBrowser.datasets.all")}
                                title={$t("dataBrowser.datasets.all")}
                            >
                                <HouseIcon size={16} />
                            </a>
                            {#each folderParts(folder) as part (part.path)}
                                <ChevronRightIcon size={14} class="separator" aria-hidden="true" />
                                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- listHref resolves the path -->
                                <a href={listHref(part.path)}>{part.name}</a>
                            {/each}
                        </nav>
                    {/if}
                {/snippet}

                {#snippet tools()}
                    <SearchInput
                        placeholder={$t("dataBrowser.datasets.search")}
                        bind:value={needle}
                        onchange={onSearch}
                    />
                {/snippet}

                {#if loading && entries.length === 0}
                    <p class="state muted">{$t("dataBrowser.datasets.loading")}</p>
                {:else if error}
                    <p class="state error">{$t(error)}</p>
                {:else if rowCount === 0}
                    <p class="state muted">{$t("dataBrowser.datasets.empty")}</p>
                {:else}
                    <div class="table-scroll">
                        <table class="files">
                            <thead>
                                <tr>
                                    <th aria-sort={ariaSort("name")}>
                                        <button type="button" onclick={() => setSort("name")}>
                                            {$t("common.name")}
                                            {@render sortMark("name")}
                                        </button>
                                    </th>
                                    <th>{$t("dataBrowser.datasets.column.format")}</th>
                                    <th class="number" aria-sort={ariaSort("size")}>
                                        <button type="button" onclick={() => setSort("size")}>
                                            {$t("dataBrowser.datasets.column.size")}
                                            {@render sortMark("size")}
                                        </button>
                                    </th>
                                    <th aria-sort={ariaSort("date")}>
                                        <button type="button" onclick={() => setSort("date")}>
                                            {$t("dataBrowser.datasets.column.modified")}
                                            {@render sortMark("date")}
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each pageFolders as row (row.path)}
                                    {@const modified = parseDate(row.lastModified)}
                                    <tr>
                                        <td>
                                            <button
                                                type="button"
                                                class="link"
                                                onclick={() => openFolder(row.path)}
                                            >
                                                <FolderIcon class="folder-icon size-4" />
                                                {row.name}
                                            </button>
                                        </td>
                                        <td class="muted">
                                            {$t("dataBrowser.datasets.fileCount", {
                                                count: row.count
                                            })}
                                        </td>
                                        <td class="number">{formatSize(row.size, $formatNumber)}</td
                                        >
                                        <td class="muted"
                                            >{#if modified}{$formatDate(
                                                    modified,
                                                    DATE_TIME
                                                )}{/if}</td
                                        >
                                    </tr>
                                {/each}
                                {#each pageFiles as entry (entry.path)}
                                    {@const modified = parseDate(entry.lastModified)}
                                    <tr>
                                        <td>
                                            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- detailHref resolves the path -->
                                            <a class="link" href={detailHref(entry)}>
                                                <FileIcon class="file-icon size-4" />
                                                {#if searching}{entry.path}{:else}{fileName(
                                                        entry.path
                                                    )}{/if}
                                            </a>
                                        </td>
                                        <td>
                                            {#if entry.format}
                                                <Badge variant="outline">{entry.format}</Badge>
                                            {/if}
                                        </td>
                                        <td class="number"
                                            >{formatSize(entry.size, $formatNumber)}</td
                                        >
                                        <td class="muted"
                                            >{#if modified}{$formatDate(
                                                    modified,
                                                    DATE_TIME
                                                )}{/if}</td
                                        >
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>

                    {#if pageCount > 1}
                        <div class="pager">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pageIndex <= 1}
                                onclick={() => goToPage(pageIndex - 1)}
                                >{$t("dataBrowser.datasets.previous")}</Button
                            >
                            <span class="muted">
                                {$t("dataBrowser.datasets.pageOf", {
                                    page: pageIndex,
                                    count: pageCount
                                })}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pageIndex >= pageCount}
                                onclick={() => goToPage(pageIndex + 1)}
                                >{$t("dataBrowser.datasets.next")}</Button
                            >
                        </div>
                    {/if}
                {/if}
            </ListCard>
        {/if}
    </div>
</div>

{#if uploadOpen && node}
    <UploadDialog {node} {folder} onClose={() => (uploadOpen = false)} onUploaded={load} />
{/if}

<style lang="scss">
    .path {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
        min-width: 0;

        a {
            display: inline-flex;
            color: var(--muted-foreground);
            text-decoration: none;

            &:hover {
                color: var(--foreground);
            }

            // The open folder.
            &:last-child {
                color: var(--foreground);
                font-weight: 600;
            }
        }

        :global(.separator) {
            color: var(--muted-foreground);
        }
    }

    .state {
        margin: 0;
        padding: 1rem;
    }

    // A narrow screen scrolls the table, not the page.
    .table-scroll {
        overflow-x: auto;
    }

    .files {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-sm);

        th,
        td {
            padding: 0.625rem 1rem;
            border-bottom: 1px solid var(--border);
            text-align: left;
            white-space: nowrap;
        }

        th {
            color: var(--muted-foreground);
            font-size: var(--font-size-xs);
            font-weight: 600;
            text-transform: uppercase;
        }

        th button {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            padding: 0;
            border: 0;
            background: none;
            color: inherit;
            font: inherit;
            text-transform: inherit;
            cursor: pointer;
        }

        .number {
            text-align: right;
            font-variant-numeric: tabular-nums;
        }

        tbody tr:last-child td {
            border-bottom: 0;
        }

        tbody tr:hover {
            background: color-mix(in srgb, var(--muted) 50%, transparent);
        }

        :global(.folder-icon) {
            color: var(--primary);
        }

        :global(.file-icon) {
            color: var(--muted-foreground);
        }
    }

    .link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
        word-break: break-all;

        &:hover {
            text-decoration: underline;
        }
    }

    .pager {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--border);
    }

    .muted {
        color: var(--muted-foreground);
    }

    .warning,
    .error {
        color: var(--destructive);
    }
</style>
