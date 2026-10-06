<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { error as kitError } from '@sveltejs/kit';
	import type { BeaconClient as SdkClient } from '@maris-development/beacon-client';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import BackLink from '@/components/data-browser/BackLink.svelte';
	import SchemaTable from '@/components/data-browser/SchemaTable.svelte';
	import PreviewGrid from '@/components/data-browser/PreviewGrid.svelte';
	import DetailTabs from '@/components/data-browser/DetailTabs.svelte';
	import { saveBlob } from '@/components/sql-editor/save-blob';
	import { makeBeaconClient } from '@/beacon-api/client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { findByUrl } from '@/services/beacon-node';
	import { whenOpenNodesSettled } from '@/services/open-nodes-import';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { track } from '@/telemetry';
	import { backTarget } from '@/data-browser/back';
	import {
		datasetEditorSql,
		fileName,
		folderOf,
		formatSize,
		parseEntries,
		previewQuery,
		type DatasetEntry
	} from '@/data-browser/datasets';
	import { parseSchema } from '@/sql/catalog';

	const LIST = resolve('/data-browser/datasets');

	const file = page.url.searchParams.get('file') ?? '';
	if (!file) throw kitError(400, 'Missing `file` query parameter');

	// The node URL, not its id. An id exists in one browser only, so a shared link names the node.
	const nodeUrl = page.url.searchParams.get('node') ?? '';
	if (!nodeUrl) throw kitError(400, 'Missing `node` query parameter');

	const FOLDER_LIST = `${LIST}?folder=${encodeURIComponent(folderOf(file))}`;
	// The base path without its trailing slash.
	const PREFIX = resolve('/').replace(/\/$/, '');

	// Admin actions need a saved node: the sign-in session belongs to its id.
	let savedNode: BeaconNode | null = $state(null);
	let client: SdkClient | null = $state(null);

	// The list builds the detail link from a known entry. A share link has only the path.
	let entry: DatasetEntry = $state({
		path: file,
		format: '',
		canInspect: true,
		size: null,
		lastModified: null
	});
	let tab = $state('schema');
	let columns: string[] | null = $state(null);
	let busy = $state(false);

	let folderList = $derived(backTarget(page.url.searchParams.get('back'), PREFIX, FOLDER_LIST));

	// A node outside the list gets a client with no token.
	function readNode(): BeaconNode {
		if (savedNode) return savedNode;

		return {
			id: '',
			name: nodeUrl,
			url: nodeUrl,
			status: 'unknown',
			latencyMs: null,
			lastCheckedAt: null
		};
	}

	onMount(async () => {
		track('browser.dataset.open', { nodeHost: nodeUrl, props: { file } });

		// On a first visit the public nodes arrive after this page mounts.
		await whenOpenNodesSettled();
		savedNode = findByUrl(nodeUrl);
		const current = makeBeaconClient(readNode());

		try {
			const found = parseEntries(await current.datasets({ pattern: file, limit: 1 }));
			if (found[0]?.path === file) entry = found[0];
		} catch {
			// The details stay unknown. Schema and preview still try.
		}

		client = current;
		// The user can open Preview before the client is ready.
		void loadColumns();
	});

	async function loadSchema(): Promise<unknown> {
		if (!client) return null;

		const schema = await client.datasetSchema(file);
		columns = parseSchema(schema).map((column) => column.name);
		return schema;
	}

	async function loadColumns() {
		if (tab !== 'preview' || columns !== null || !client || !entry.canInspect) return;

		try {
			await loadSchema();
		} catch {
			columns = [];
		}
	}

	function selectTab(id: string) {
		tab = id;
		void loadColumns();
	}

	async function download() {
		if (!savedNode) return;
		busy = true;

		try {
			const blob = await withAdmin(savedNode, (admin) => admin.admin.downloadDataset(file));
			if (blob !== null) saveBlob(blob, fileName(file));
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!savedNode) return;

		const sure = await askConfirm({
			title: `Delete ${fileName(file)}`,
			message: `Delete "${file}" from ${savedNode.name}?`,
			note: 'A table that reads this file stops working.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!sure) return;

		busy = true;

		try {
			const done = await withAdmin(savedNode, async (admin) => {
				await admin.admin.deleteDataset(file);
				return true;
			});
			if (done) {
				addToast({ type: 'success', message: `Deleted ${fileName(file)}.` });
				goto(folderList);
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	function openInEditor() {
		goto(`${resolve('/sql-editor')}?sql=${encodeURIComponent(datasetEditorSql(entry))}`);
	}
</script>

<svelte:head>
	<title>Dataset {fileName(file)} - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Datasets', href: LIST },
		{ label: fileName(file), href: '' }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<BackLink label="Datasets" fallback={FOLDER_LIST} />

		<header class="head">
			<div>
				<h1>{fileName(file)}</h1>
				<p class="meta">
					{file}
					{#if entry.format}· {entry.format}{/if}
					{#if entry.size !== null}· {formatSize(entry.size)}{/if}
					{#if entry.lastModified}· {entry.lastModified}{/if}
					· {savedNode?.name ?? nodeUrl}
				</p>
			</div>

			<div class="actions">
				<Button variant="outline" onclick={openInEditor}>
					<SquareTerminalIcon />
					Open in SQL Editor
				</Button>

				{#if savedNode}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="outline" disabled={disabled || busy} onclick={download}>
								Download
							</Button>
						{/snippet}
					</AdminAction>
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="destructive" disabled={disabled || busy} onclick={remove}>
								Delete
							</Button>
						{/snippet}
					</AdminAction>
				{/if}
			</div>
		</header>

		<DetailTabs
			tabs={[
				{ id: 'schema', label: 'Schema' },
				{ id: 'preview', label: 'Preview' }
			]}
			active={tab}
			onSelect={selectTab}
		/>

		{#if !client}
			<p class="muted">Loading the file...</p>
		{:else if !entry.canInspect}
			<p class="muted">Beacon cannot read this file format.</p>
		{:else if tab === 'schema'}
			<SchemaTable load={loadSchema} />
		{:else if columns === null}
			<p class="muted">Loading the columns...</p>
		{:else if columns.length === 0}
			<p class="muted">This file has no columns to preview.</p>
		{:else}
			<PreviewGrid source={client} query={previewQuery(entry, columns)} />
		{/if}
	</div>
</div>

<style lang="scss">
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;

		h1 {
			margin: 0;
			word-break: break-all;
		}
	}

	.meta {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-family: monospace;
		word-break: break-all;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.muted {
		color: var(--muted-foreground);
	}
</style>
