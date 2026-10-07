<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FileIcon from '@lucide/svelte/icons/file';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import UploadDialog from '@/components/data-browser/UploadDialog.svelte';
	import StorageBar from '@/components/data-browser/StorageBar.svelte';
	import { Input } from '@/components/ui/input';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { track } from '@/telemetry';
	import { withBack } from '@/data-browser/back';
	import { normalizeFolder } from '@/data-browser/folders';
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
	} from '@/data-browser/datasets';
	import { sqlErrorMessage } from '@/sql/statement';

	const PAGE_SIZE = 100;

	let loadedUrl: string | null = null;

	let entries: DatasetEntry[] = $state([]);
	let total: number | null = $state(null);
	let loading = $state(false);
	let error = $state('');
	let uploadOpen = $state(false);
	let needle = $state(page.url.searchParams.get('q') ?? '');
	let sortKey: FileSort = $state('name');
	let sortDirection: 'asc' | 'desc' = $state('asc');
	// The page lives in the URL, so browser Back restores it with the folder.
	let requestedPage = $derived(Number(page.url.searchParams.get('page') ?? '1') || 1);

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let folder = $derived(normalizeFolder(page.url.searchParams.get('folder') ?? ''));
	let searching = $derived(needle.trim() !== '');
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
		error = '';

		// Another node: its file list must not show under the new node.
		if (loadedUrl !== null && current.url !== loadedUrl) {
			entries = [];
			total = null;
			if (requestedPage !== 1) goToPage(1);
		}
		loadedUrl = current.url;

		try {
			const [raw, count] = await Promise.all([
				client.datasets({ limit: DATASET_LIST_LIMIT }),
				client.totalDatasets().catch(() => null)
			]);
			if (current.url !== nodeUrl) return;

			entries = parseEntries(raw);
			total = count;
		} catch (caught) {
			if (current.url === nodeUrl) {
				entries = [];
				error = sqlErrorMessage(caught);
			}
		} finally {
			if (current.url === nodeUrl) loading = false;
		}
	}

	function listHref(nextFolder: string): string {
		const url = new URL(resolve('/data-browser/datasets'), page.url.origin);
		if (nextFolder) url.searchParams.set('folder', nextFolder);
		return `${url.pathname}${url.search}`;
	}

	function backUrl(): string {
		const url = new URL(page.url);
		if (needle.trim()) {
			url.searchParams.set('q', needle.trim());
		} else {
			url.searchParams.delete('q');
		}
		url.searchParams.set('page', String(pageIndex));
		return `${url.pathname}${url.search}`;
	}

	function detailHref(entry: DatasetEntry): string {
		if (!node) return '#';
		const href = `${resolve('/data-browser/datasets/detail')}?${datasetDetailQuery(entry.path, node.url)}`;
		return withBack(href, backUrl());
	}

	function goToPage(next: number) {
		const url = new URL(page.url);
		if (next <= 1) {
			url.searchParams.delete('page');
		} else {
			url.searchParams.set('page', String(next));
		}
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	function openFolder(path: string) {
		needle = '';
		goto(listHref(path), { keepFocus: true, noScroll: true });
	}

	function setSort(key: FileSort) {
		if (sortKey === key) {
			if (sortDirection === 'asc') {
				sortDirection = 'desc';
			} else {
				sortDirection = 'asc';
			}
		} else {
			sortKey = key;
			sortDirection = 'asc';
		}
	}

	function onSearch() {
		if (requestedPage !== 1) goToPage(1);
		if (searching) {
			track('browser.search', {
				props: {
					scope: 'datasets',
					term: needle.trim().slice(0, 60),
					results: listing.files.length
				}
			});
		}
	}
</script>

<svelte:head>
	<title>Datasets - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Datasets', href: resolve('/data-browser/datasets') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Datasets</h1>

		<p>Explore the files of your Beacon node.</p>

		<NodePicker>
			{#snippet actions()}
				<AdminAction>
					{#snippet children({ disabled })}
						<Button
							variant="outline"
							disabled={disabled || !node}
							onclick={() => (uploadOpen = true)}
						>
							Upload
						</Button>
					{/snippet}
				</AdminAction>
			{/snippet}
		</NodePicker>

		{#if !node}
			<p>Pick a Beacon node.</p>
		{:else}
			<StorageBar {node} />

			<div class="toolbar">
				<Input
					type="search"
					placeholder="Search all folders"
					bind:value={needle}
					onchange={onSearch}
				/>
				{#if total !== null}<span class="muted">{total.toLocaleString()} files</span>{/if}
			</div>

			{#if cut}
				<p class="warning">This node has more than 100,000 files. The list is incomplete.</p>
			{/if}

			{#if !searching}
				<nav class="path" aria-label="Folder">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- listHref resolves the path -->
					<a href={listHref('')}>All</a>
					{#each folderParts(folder) as part (part.path)}
						<span>/</span>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- listHref resolves the path -->
						<a href={listHref(part.path)}>{part.name}</a>
					{/each}
				</nav>
			{/if}

			{#if loading && entries.length === 0}
				<p class="muted">Loading the files...</p>
			{:else if error}
				<p class="error">{error}</p>
			{:else if rowCount === 0}
				<p class="muted">No files here.</p>
			{:else}
				<table class="files">
					<thead>
						<tr>
							<th><button type="button" onclick={() => setSort('name')}>Name</button></th>
							<th>Format</th>
							<th><button type="button" onclick={() => setSort('size')}>Size</button></th>
							<th><button type="button" onclick={() => setSort('date')}>Modified</button></th>
						</tr>
					</thead>
					<tbody>
						{#each pageFolders as row (row.path)}
							<tr>
								<td colspan="4">
									<button type="button" class="link" onclick={() => openFolder(row.path)}>
										<FolderIcon class="size-4" />
										{row.name}
										<span class="muted">({row.count})</span>
									</button>
								</td>
							</tr>
						{/each}
						{#each pageFiles as entry (entry.path)}
							<tr>
								<td>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- detailHref resolves the path -->
									<a class="link" href={detailHref(entry)}>
										<FileIcon class="size-4" />
										{#if searching}{entry.path}{:else}{fileName(entry.path)}{/if}
									</a>
								</td>
								<td>{entry.format}</td>
								<td>{formatSize(entry.size)}</td>
								<td>{entry.lastModified?.slice(0, 10) ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>

				{#if pageCount > 1}
					<div class="pager">
						<Button
							variant="outline"
							size="sm"
							disabled={pageIndex <= 1}
							onclick={() => goToPage(pageIndex - 1)}>Previous</Button
						>
						<span class="muted">Page {pageIndex} of {pageCount}</span>
						<Button
							variant="outline"
							size="sm"
							disabled={pageIndex >= pageCount}
							onclick={() => goToPage(pageIndex + 1)}>Next</Button
						>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{#if uploadOpen && node}
	<UploadDialog {node} {folder} onClose={() => (uploadOpen = false)} onUploaded={load} />
{/if}

<style lang="scss">
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.path {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
		font-family: monospace;
	}

	.files {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;

		th,
		td {
			padding: 0.375rem 0.5rem;
			border-bottom: 1px solid var(--border);
			text-align: left;
		}

		th button {
			padding: 0;
			border: 0;
			background: none;
			font-weight: 600;
			cursor: pointer;
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
		margin-top: 0.75rem;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.warning,
	.error {
		color: var(--destructive);
	}
</style>
