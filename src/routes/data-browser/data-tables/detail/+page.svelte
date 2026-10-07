<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { error as kitError } from '@sveltejs/kit';
	import type { BeaconClient as SdkClient } from '@maris-development/beacon-client';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import SquareTerminalIcon from '@lucide/svelte/icons/square-terminal';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import BackLink from '@/components/data-browser/BackLink.svelte';
	import SchemaTable from '@/components/data-browser/SchemaTable.svelte';
	import PreviewGrid from '@/components/data-browser/PreviewGrid.svelte';
	import DetailTabs from '@/components/data-browser/DetailTabs.svelte';
	import { makeBeaconClient } from '@/beacon-api/client';
	import type { BeaconNode } from '@/beacon-api/types';
	import { findByUrl } from '@/services/beacon-node';
	import { whenOpenNodesSettled } from '@/services/open-nodes-import';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { settings } from '@/stores/settings';
	import { track } from '@/telemetry';
	import {
		canManage,
		dropSql,
		editorSql,
		previewSql,
		refreshSql,
		tableKind
	} from '@/data-browser/tables';
	import type { CatalogDefaults, TableRef } from '@/sql/identifiers';
	import { sqlErrorMessage } from '@/sql/statement';

	const LIST = resolve('/data-browser/data-tables');

	const tableName = page.url.searchParams.get('table_name') ?? '';
	if (!tableName) throw kitError(400, 'Missing `table_name` query parameter');

	// The node URL, not its id. An id exists in one browser only, so a shared link names the node.
	const nodeUrl = page.url.searchParams.get('node') ?? '';
	if (!nodeUrl) throw kitError(400, 'Missing `node` query parameter');

	// Admin actions need a saved node: the sign-in session belongs to its id.
	let savedNode: BeaconNode | null = $state(null);
	let client: SdkClient | null = $state(null);

	let defaults: CatalogDefaults | null = $state(null);
	let tableType = $state('');
	let found = $state(false);
	let loadError = $state('');
	let tab = $state('schema');
	let definition: string | null | undefined = $state(undefined);
	let definitionError = $state('');
	let busy = $state(false);

	let ref: TableRef | null = $derived.by(() => {
		if (!defaults) return null;
		return {
			catalog: page.url.searchParams.get('catalog') ?? defaults.catalog,
			schema: page.url.searchParams.get('schema') ?? defaults.schema,
			name: tableName
		};
	});

	let isView = $derived(tableKind(tableType) === 'view');
	let manageable = $derived(
		found && savedNode !== null && ref !== null && defaults !== null && canManage(ref, defaults)
	);

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
		track('browser.table.open', { nodeHost: nodeUrl, props: { table: tableName } });

		// On a first visit the public nodes arrive after this page mounts.
		await whenOpenNodesSettled();
		savedNode = findByUrl(nodeUrl);
		const current = makeBeaconClient(readNode());

		try {
			const view = await current.catalogs();

			const catalog = page.url.searchParams.get('catalog') ?? view.default_catalog;
			const schema = page.url.searchParams.get('schema') ?? view.default_schema;
			const table = view.catalogs
				.find((c) => c.name === catalog)
				?.schemas.find((s) => s.name === schema)
				?.tables.find((t) => t.name === tableName);

			if (table) {
				tableType = table.table_type;
				found = true;
			} else {
				loadError = `The node has no table "${tableName}" in ${catalog}.${schema}.`;
			}

			client = current;
			defaults = { catalog: view.default_catalog, schema: view.default_schema };
		} catch (caught) {
			loadError = sqlErrorMessage(caught);
		}
	});

	let schemaLoad: Promise<unknown> | null = null;

	// One request per page: a tab switch mounts the schema table again.
	function loadSchema(): Promise<unknown> {
		if (!client || !ref) return Promise.resolve(null);

		if (!schemaLoad) {
			const load = client.tableSchema(tableName, { catalog: ref.catalog, schema: ref.schema });
			// A failure can be tried again on the next open.
			load.catch(() => (schemaLoad = null));
			schemaLoad = load;
		}

		return schemaLoad;
	}

	function onFilter(term: string, results: number) {
		track('browser.search', {
			props: { scope: 'table-fields', term: term.slice(0, 60), results }
		});
	}

	async function loadDefinition() {
		if (!savedNode || !ref || definition !== undefined) return;

		definitionError = '';
		const current = ref;

		try {
			const result = await withAdmin(savedNode, (admin) =>
				admin.admin.tableDefinition(current.name, {
					catalog: current.catalog,
					schema: current.schema
				})
			);
			if (result === null) {
				definitionError = 'Sign in to see the definition. Open this tab again to sign in.';
			} else {
				definition = result.definition;
			}
		} catch (caught) {
			definitionError = adminErrorMessage(caught);
		}
	}

	function selectTab(id: string) {
		tab = id;
		if (id === 'definition' && $settings.adminFeatures) void loadDefinition();
	}

	async function refresh() {
		if (!savedNode || !ref || !defaults) return;

		busy = true;
		const sql = refreshSql(ref, defaults);

		try {
			const done = await withAdmin(savedNode, (admin) => admin.query(sql));
			if (done !== null) addToast({ type: 'success', message: `Refreshed ${tableName}.` });
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	async function drop() {
		if (!savedNode || !ref || !defaults) return;

		const sure = await askConfirm({
			title: `Drop ${tableName}`,
			message: `Drop the table "${tableName}" from ${savedNode.name}?`,
			note: 'The files stay in place.',
			confirmLabel: 'Drop',
			destructive: true
		});
		if (!sure) return;

		busy = true;
		const sql = dropSql(ref, defaults);

		try {
			const done = await withAdmin(savedNode, (admin) => admin.query(sql));
			if (done !== null) {
				addToast({ type: 'success', message: `Dropped ${tableName}.` });
				goto(LIST);
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			busy = false;
		}
	}

	function openInEditor() {
		if (!ref || !defaults) return;
		goto(`${resolve('/sql-editor')}?sql=${encodeURIComponent(editorSql(ref, defaults))}`);
	}

	async function copyDefinition() {
		if (!definition) return;
		await navigator.clipboard.writeText(definition);
		addToast({ type: 'success', message: 'Copied the definition.' });
	}
</script>

<svelte:head>
	<title>Table {tableName} - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Data tables', href: LIST },
		{ label: `Table ${tableName}`, href: '' }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<BackLink label="Tables" fallback={LIST} />

		<header class="head">
			<div>
				<h1>{tableName}</h1>
				<p class="meta">
					{#if ref}{ref.catalog}.{ref.schema}{/if}
					{#if tableType}<span class="badge">{isView ? 'View' : 'Table'}</span>{/if}
					<span class="node">· {savedNode?.name ?? nodeUrl}</span>
				</p>
			</div>

			<div class="actions">
				<Button variant="outline" onclick={openInEditor} disabled={!ref}>
					<SquareTerminalIcon />
					Open in SQL Editor
				</Button>

				{#if manageable}
					{#if !isView}
						<AdminAction>
							{#snippet children({ disabled })}
								<Button variant="outline" disabled={disabled || busy} onclick={refresh}>
									Refresh
								</Button>
							{/snippet}
						</AdminAction>
					{/if}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button variant="destructive" disabled={disabled || busy} onclick={drop}>Drop</Button>
						{/snippet}
					</AdminAction>
				{/if}
			</div>
		</header>

		{#if loadError}
			<p class="error">{loadError}</p>
		{:else if !ref || !defaults || !client}
			<p class="muted">Loading the table...</p>
		{:else}
			<DetailTabs
				tabs={[
					{ id: 'schema', label: 'Schema' },
					{ id: 'preview', label: 'Preview' },
					{ id: 'definition', label: 'Definition' }
				]}
				active={tab}
				onSelect={selectTab}
			/>

			{#if tab === 'schema'}
				<SchemaTable load={loadSchema} {onFilter} />
			{:else if tab === 'preview'}
				<PreviewGrid source={client} query={previewSql(ref, defaults)} />
			{:else if !$settings.adminFeatures}
				<p class="muted">
					The definition needs admin features. Turn on "Show admin features" in Settings.
				</p>
			{:else if !savedNode}
				<p class="muted">Add this node on the Beacon Nodes page to see the definition.</p>
			{:else if definitionError}
				<p class="error">{definitionError}</p>
			{:else if definition === undefined}
				<p class="muted">Loading the definition...</p>
			{:else if definition === null}
				<p class="muted">
					Beacon stores no definition for this table. A crawler made it, or it is an older table.
				</p>
			{:else}
				<div class="definition">
					<Button variant="outline" size="sm" onclick={copyDefinition}>
						<CopyIcon />
						Copy
					</Button>
					<pre>{definition}</pre>
				</div>
			{/if}
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
	}

	.badge {
		padding: 0 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		font-size: var(--font-size-xs);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.definition {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;

		pre {
			width: 100%;
			padding: 0.75rem;
			overflow: auto;
			border-radius: 0.375rem;
			background: var(--secondary);
			white-space: pre-wrap;
		}
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
