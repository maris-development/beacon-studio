<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import CreateViewDialog from '@/components/data-browser/CreateViewDialog.svelte';
	import CreateExternalTableDialog from '@/components/data-browser/CreateExternalTableDialog.svelte';
	import { Input } from '@/components/ui/input';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { track } from '@/telemetry';
	import { withBack } from '@/data-browser/back';
	import { splitTree, tableDetailQuery, tableKind } from '@/data-browser/tables';
	import { buildTree, filterTree, type CatalogTree } from '@/sql/catalog';
	import type { TableRef } from '@/sql/identifiers';
	import { sqlError } from '@/sql/statement';
	import { t, type Message } from '@/i18n';

	type Dialog = 'view' | 'materialized' | 'external' | null;

	let tree: CatalogTree | null = $state(null);
	let defaultTable: string | null = $state(null);
	let loading = $state(false);
	let error: Message | null = $state(null);
	let needle = $state(page.url.searchParams.get('q') ?? '');
	let othersOpen = $state(false);
	let dialog: Dialog = $state(null);

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);

	let shown = $derived.by(() => {
		if (!tree) return null;
		return splitTree(filterTree(tree, needle));
	});

	let searching = $derived(needle.trim() !== '');

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
			if (typeof fallback === 'string') {
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
		if (needle.trim() === '') {
			url.searchParams.delete('q');
		} else {
			url.searchParams.set('q', needle.trim());
		}
		return `${url.pathname}${url.search}`;
	}

	function detailHref(ref: TableRef): string {
		if (!tree || !node) return '#';

		const href = `${resolve('/data-browser/data-tables/detail')}?${tableDetailQuery(ref, tree.defaults, node.url)}`;
		return withBack(href, listUrl());
	}

	function onSearch() {
		if (searching && shown) {
			const results = shown.defaultTables.length;
			track('browser.search', {
				props: { scope: 'tables', term: needle.trim().slice(0, 60), results }
			});
		}
	}

	async function loadPaths(): Promise<string[]> {
		if (!node) return [];

		const list = await makeBeaconClient(node).datasets<{ file_path: string }[]>({
			limit: 100000
		});
		return list.map((entry) => entry.file_path);
	}

	function onCreated(name: string) {
		dialog = null;
		if (!tree || !node) return;

		const ref = { catalog: tree.defaults.catalog, schema: tree.defaults.schema, name };
		goto(detailHref(ref));
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('nav.item.dataTables') })}</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: $t('nav.item.dataBrowser'), href: resolve('/data-browser') },
		{ label: $t('nav.item.dataTables'), href: resolve('/data-browser/data-tables') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.dataTables')}</h1>

		<p>{$t('dataBrowser.tables.intro')}</p>

		<NodePicker>
			{#snippet actions()}
				<AdminAction>
					{#snippet children({ disabled })}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger disabled={disabled || !node}>
								<Button variant="outline" disabled={disabled || !node}>
									{$t('dataBrowser.tables.create')}
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content class="w-52">
								<DropdownMenu.Item onclick={() => (dialog = 'view')}>
									{$t('dataBrowser.tables.createView')}
								</DropdownMenu.Item>
								<DropdownMenu.Item onclick={() => (dialog = 'materialized')}>
									{$t('dataBrowser.tables.createMaterialized')}
								</DropdownMenu.Item>
								<DropdownMenu.Item onclick={() => (dialog = 'external')}>
									{$t('dataBrowser.tables.createExternal')}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/snippet}
				</AdminAction>
			{/snippet}
		</NodePicker>

		{#if !node}
			<p>{$t('dataBrowser.common.pickNode')}</p>
		{:else}
			<Input
				type="search"
				placeholder={$t('dataBrowser.tables.search')}
				bind:value={needle}
				onchange={onSearch}
			/>

			{#if loading && !tree}
				<p class="muted">{$t('dataBrowser.tables.loading')}</p>
			{:else if error}
				<p class="error">{$t(error)}</p>
			{:else if shown}
				{#if shown.defaultTables.length === 0}
					<p class="muted">{$t('dataBrowser.tables.noMatch')}</p>
				{:else}
					<ul class="tables">
						{#each shown.defaultTables as table (table.name)}
							{@const ref = {
								catalog: shown.others.defaults.catalog,
								schema: shown.others.defaults.schema,
								name: table.name
							}}
							<li>
								<a href={detailHref(ref)}>
									<span class="name">{table.name}</span>
									{#if tableKind(table.table_type) === 'view'}
										<span class="badge">{$t('dataBrowser.tables.kindView')}</span>
									{:else}
										<span class="badge">{$t('dataBrowser.tables.kindTable')}</span>
									{/if}
									{#if table.name === defaultTable}
										<span class="badge default">{$t('dataBrowser.tables.default')}</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				{#if shown.others.catalogs.length > 0}
					<details class="others" open={othersOpen || searching}>
						<summary
							onclick={(event) => {
								event.preventDefault();
								othersOpen = !othersOpen;
							}}
						>
							<ChevronRightIcon class="chevron size-4" />
							{$t('dataBrowser.tables.otherSchemas')}
						</summary>

						{#each shown.others.catalogs as catalog (catalog.name)}
							{#each catalog.schemas as schema (schema.name)}
								<h3 class="schema-title">{catalog.name}.{schema.name}</h3>
								<ul class="tables">
									{#each schema.tables as table (table.name)}
										{@const ref = { catalog: catalog.name, schema: schema.name, name: table.name }}
										<li>
											<a href={detailHref(ref)}>
												<span class="name">{table.name}</span>
												{#if tableKind(table.table_type) === 'view'}
													<span class="badge">{$t('dataBrowser.tables.kindView')}</span>
												{:else}
													<span class="badge">{$t('dataBrowser.tables.kindTable')}</span>
												{/if}
											</a>
										</li>
									{/each}
								</ul>
							{/each}
						{/each}
					</details>
				{/if}
			{/if}
		{/if}
	</div>
</div>

{#if node && (dialog === 'view' || dialog === 'materialized')}
	<CreateViewDialog
		{node}
		materialized={dialog === 'materialized'}
		onClose={() => (dialog = null)}
		{onCreated}
	/>
{/if}

{#if node && dialog === 'external'}
	<CreateExternalTableDialog {node} {loadPaths} onClose={() => (dialog = null)} {onCreated} />
{/if}

<style lang="scss">
	.tables {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;

		li a {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 0.25rem;
			border-bottom: 1px solid var(--border);
			color: inherit;
			text-decoration: none;

			&:hover {
				background: var(--accent);
			}
		}
	}

	.name {
		font-weight: 500;
		word-break: break-all;
	}

	.badge {
		padding: 0 0.375rem;
		border-radius: 0.25rem;
		background: var(--secondary);
		color: var(--muted-foreground);
		font-size: var(--font-size-xs);

		&.default {
			background: var(--primary);
			color: var(--primary-foreground);
		}
	}

	.others {
		margin-top: 1rem;

		summary {
			display: flex;
			align-items: center;
			gap: 0.25rem;
			cursor: pointer;
			font-weight: 600;
			list-style: none;
		}

		&[open] :global(.chevron) {
			transform: rotate(90deg);
		}
	}

	.schema-title {
		margin: 0.75rem 0 0;
		color: var(--muted-foreground);
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
