<script lang="ts">
	import { untrack } from 'svelte';
	import type { BeaconClient as SdkClient } from '@maris-development/beacon-client';
	import PlayIcon from '@lucide/svelte/icons/play';
	import SquareIcon from '@lucide/svelte/icons/square';
	import ListTreeIcon from '@lucide/svelte/icons/list-tree';
	import PanelRightIcon from '@lucide/svelte/icons/panel-right';
	import Button from '@/components/buttons/Button.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { resolve } from '$app/paths';
	import SqlEditor from '@/components/sql-editor/SqlEditor.svelte';
	import SqlTabs from '@/components/sql-editor/SqlTabs.svelte';
	import CatalogTree from '@/components/sql-editor/CatalogTree.svelte';
	import ResultGrid from '@/components/sql-editor/ResultGrid.svelte';
	import PlanTree from '@/components/sql-editor/PlanTree.svelte';
	import DownloadMenu from '@/components/sql-editor/DownloadMenu.svelte';
	import { saveBlob } from '@/components/sql-editor/save-blob';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { currentNode } from '@/services/beacon-node';
	import { withAdmin } from '@/services/admin-session';
	import { settings } from '@/stores/settings';
	import { CatalogCache, type CatalogTree as Tree, type SchemaColumn } from '@/sql/catalog';
	import { buildCompletions, parseFunctions, type FnMeta } from '@/sql/completion';
	import { downloadFileName, type DownloadFormat } from '@/sql/download';
	import type { TableRef } from '@/sql/identifiers';
	import { planRoot } from '@/sql/plan';
	import { withAdminFallback } from '@/sql/privilege';
	import { PREVIEW_ROW_LIMIT, runPreview, type PreviewResult } from '@/sql/run';
	import { isSqlDisabled, sqlErrorMessage, sqlToRun } from '@/sql/statement';
	import {
		addTab,
		closeTab,
		loadTabs,
		renameTab,
		saveTabs,
		selectTab,
		setTabSql,
		type TabsState
	} from '@/sql/tabs';

	type Action = 'run' | 'explain' | 'analyze';

	type Outcome =
		| { kind: 'busy'; action: Action }
		| { kind: 'rows'; result: PreviewResult }
		| { kind: 'plan'; plan: unknown; analyzed: boolean }
		| { kind: 'error'; message: string; hint?: string }
		| { kind: 'notice'; message: string };

	const ADMIN_HINT = 'Turn on "Show admin features" in Settings';

	let tabs: TabsState = $state(loadTabs());
	let outcomes: Record<string, Outcome> = $state({});
	let busy = $state(false);
	let downloading = $state(false);
	let catalogOpen = $state(false);
	let editor: SqlEditor | undefined = $state();

	// The action that owns the result area of each tab. A newer action on the tab replaces it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- owners are not view state
	const owners = new Map<string, AbortController>();
	let controller: AbortController | null = null;

	const cache = new CatalogCache();
	let tree: Tree | null = $state(null);
	let treeLoading = $state(false);
	let treeError = $state('');
	let functions: FnMeta[] = $state([]);
	let columnsVersion = $state(0);

	let activeTab = $derived(tabs.tabs.find((tab) => tab.id === tabs.activeId) ?? tabs.tabs[0]);
	let node = $derived($currentNode);
	// The node object changes on every health check. The URL changes only on a real switch.
	let nodeUrl = $derived(node?.url ?? null);
	let outcome = $derived(outcomes[activeTab.id] ?? null);

	let completions = $derived.by(() => {
		void columnsVersion;

		let loaded: ReturnType<CatalogCache['loadedColumns']> = [];
		if (nodeUrl) loaded = cache.loadedColumns(nodeUrl);

		return buildCompletions({ tree, functions, columns: loaded });
	});

	$effect(() => {
		saveTabs($state.snapshot(tabs));
	});

	$effect(() => {
		if (!nodeUrl) return;
		untrack(() => loadCatalogue(false));
	});

	async function loadCatalogue(refresh: boolean) {
		const current = node;
		if (!current) return;

		const client = makeBeaconClient(current);
		treeLoading = true;
		treeError = '';

		try {
			const result = await cache.tree(current.url, client, refresh);
			// A node switch during the load makes this answer stale.
			if (current.url === nodeUrl) tree = result;
		} catch (error) {
			if (current.url === nodeUrl) {
				tree = null;
				treeError = sqlErrorMessage(error);
			}
		} finally {
			if (current.url === nodeUrl) treeLoading = false;
		}

		// A failure removes the function suggestions only.
		client.functions().then(
			(raw) => {
				if (current.url === nodeUrl) functions = parseFunctions(raw);
			},
			() => {
				if (current.url === nodeUrl) functions = [];
			}
		);
	}

	async function loadColumns(ref: TableRef): Promise<SchemaColumn[]> {
		const current = node;
		if (!current) return [];

		const result = await cache.columnsOf(current.url, makeBeaconClient(current), ref);
		columnsVersion += 1;

		return result;
	}

	function begin(action: Action): { own: AbortController; tabId: string } {
		controller?.abort();

		const own = new AbortController();
		controller = own;
		busy = true;

		const tabId = activeTab.id;
		owners.set(tabId, own);
		outcomes[tabId] = { kind: 'busy', action };

		return { own, tabId };
	}

	function finish(own: AbortController, tabId: string, result: Outcome) {
		if (owners.get(tabId) === own) {
			owners.delete(tabId);
			outcomes[tabId] = result;
		}

		if (controller === own) {
			controller = null;
			busy = false;
		}
	}

	function stop() {
		controller?.abort();
	}

	function statement(): string {
		return sqlToRun(activeTab.sql, editor?.selectedText() ?? '');
	}

	async function perform(
		action: Action,
		work: (client: SdkClient, sql: string, signal: AbortSignal) => Promise<Outcome>
	) {
		const current = node;
		if (!current) return;

		const sql = statement();
		if (sql === '') return;

		const { own, tabId } = begin(action);

		try {
			const result = await withAdminFallback((client: SdkClient) => work(client, sql, own.signal), {
				client: makeBeaconClient(current),
				adminFeatures: $settings.adminFeatures,
				asAdmin: (run) => withAdmin(current, run)
			});

			if (result.kind === 'done') {
				finish(own, tabId, result.value);
			} else if (result.kind === 'cancelled') {
				finish(own, tabId, { kind: 'notice', message: 'Cancelled.' });
			} else {
				finish(own, tabId, {
					kind: 'error',
					message: sqlErrorMessage(result.error),
					hint: ADMIN_HINT
				});
			}
		} catch (error) {
			if (own.signal.aborted) {
				finish(own, tabId, { kind: 'notice', message: 'Stopped.' });
			} else if (isSqlDisabled(error)) {
				finish(own, tabId, { kind: 'notice', message: 'SQL is turned off on this Beacon node.' });
			} else {
				finish(own, tabId, { kind: 'error', message: sqlErrorMessage(error) });
			}
		}
	}

	function run() {
		void perform('run', async (client, sql, signal) => {
			const result = await runPreview(client, sql, { signal });
			return { kind: 'rows', result };
		});
	}

	function explain(analyzed: boolean) {
		let action: Action = 'explain';
		if (analyzed) action = 'analyze';

		void perform(action, async (client, sql, signal) => {
			let plan: unknown;
			if (analyzed) {
				plan = await client.explainAnalyzeQuery(sql, signal);
			} else {
				plan = await client.explainQuery(sql, signal);
			}
			return { kind: 'plan', plan, analyzed };
		});
	}

	// Download leaves the result area alone, unless it fails.
	async function download(format: DownloadFormat) {
		const current = node;
		if (!current || downloading) return;

		const sql = statement();
		if (sql === '') return;

		const tabId = activeTab.id;
		downloading = true;

		try {
			const fetchFile = async (client: SdkClient) => {
				const response = await client.queryRaw(sql, format.format);
				return response.blob();
			};

			const result = await withAdminFallback(fetchFile, {
				client: makeBeaconClient(current),
				adminFeatures: $settings.adminFeatures,
				asAdmin: (fn) => withAdmin(current, fn)
			});

			if (result.kind === 'done') {
				saveBlob(result.value, downloadFileName(format, new Date()));
			} else if (result.kind === 'needs-admin-features') {
				outcomes[tabId] = {
					kind: 'error',
					message: sqlErrorMessage(result.error),
					hint: ADMIN_HINT
				};
			}
		} catch (error) {
			if (isSqlDisabled(error)) {
				outcomes[tabId] = { kind: 'notice', message: 'SQL is turned off on this Beacon node.' };
			} else {
				outcomes[tabId] = { kind: 'error', message: sqlErrorMessage(error) };
			}
		} finally {
			downloading = false;
		}
	}

	function onClose(id: string) {
		owners.get(id)?.abort();
		owners.delete(id);
		delete outcomes[id];
		tabs = closeTab(tabs, id);
	}
</script>

<svelte:head>
	<title>SQL Editor - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'SQL Editor', href: resolve('/sql-editor') }]} />

<div class="page-wrapper sql-wrapper">
	<div class="page-container sql-page">
		<header class="page-head">
			<h1>SQL Editor</h1>
			<NodePicker />
		</header>

		{#if !node}
			<p>Pick a Beacon node.</p>
		{/if}

		<div class="workspace">
			<section class="main">
				<SqlTabs
					state={tabs}
					onSelect={(id) => (tabs = selectTab(tabs, id))}
					onAdd={() => (tabs = addTab(tabs))}
					{onClose}
					onRename={(id, title) => (tabs = renameTab(tabs, id, title))}
				/>

				<div class="toolbar">
					<Button
						class="catalog-toggle"
						variant="outline"
						onclick={() => (catalogOpen = !catalogOpen)}
						aria-label="Tables"
					>
						<PanelRightIcon />
					</Button>

					{#if busy}
						<Button variant="destructive" onclick={stop}>
							<SquareIcon />
							Stop
						</Button>
					{:else}
						<Button disabled={!node} onclick={run} title="Ctrl+Enter">
							<PlayIcon />
							Run
						</Button>
					{/if}
					<Button variant="outline" disabled={!node || busy} onclick={() => explain(false)}>
						<ListTreeIcon />
						Explain
					</Button>
					<Button variant="outline" disabled={!node || busy} onclick={() => explain(true)}>
						Analyze
					</Button>
					<DownloadMenu disabled={!node} busy={downloading} onDownload={download} />
					<span class="hint">Ctrl+Enter runs the selection, or the whole tab.</span>
				</div>

				<div class="editor-area">
					<SqlEditor
						bind:this={editor}
						tabId={activeTab.id}
						value={activeTab.sql}
						tabIds={tabs.tabs.map((tab) => tab.id)}
						{completions}
						onChange={(id, sql) => (tabs = setTabSql(tabs, id, sql))}
						onRun={() => {
							if (!busy) run();
						}}
					/>
				</div>

				<div class="result-area">
					{#if outcome?.kind === 'plan'}
						{@const root = planRoot(outcome.plan)}
						{#if root}
							<PlanTree node={root} />
						{:else}
							<p class="muted">No plan to show.</p>
						{/if}
					{:else}
						{#if outcome?.kind === 'rows'}
							{@const result = outcome.result}
							{#if result.cancelled && result.rows.length > 0}
								<p class="notice">Stopped. The grid shows the rows received before the stop.</p>
							{:else if result.cancelled}
								<p class="notice">Stopped.</p>
							{:else if result.truncated}
								<p class="notice">First {PREVIEW_ROW_LIMIT} rows. Download for the full result.</p>
							{/if}
						{:else if outcome?.kind === 'error'}
							<div class="error-block" role="alert">
								<pre>{outcome.message}</pre>
								{#if outcome.hint}
									<p>{outcome.hint}</p>
								{/if}
							</div>
						{:else if outcome?.kind === 'notice'}
							<p class="notice">{outcome.message}</p>
						{/if}

						<ResultGrid
							columns={outcome?.kind === 'rows' ? outcome.result.columns : []}
							types={outcome?.kind === 'rows' ? outcome.result.types : []}
							rows={outcome?.kind === 'rows' ? outcome.result.rows : []}
							loading={outcome?.kind === 'busy'}
						/>
					{/if}
				</div>
			</section>

			<aside class="catalog-panel" class:open={catalogOpen}>
				<CatalogTree
					{tree}
					loading={treeLoading}
					error={treeError}
					{loadColumns}
					onInsert={(text) => editor?.insert(text)}
					onRefresh={() => loadCatalogue(true)}
				/>
			</aside>
		</div>
	</div>
</div>

<style lang="scss">
	// The editor fills the height of the page, so the wrapper and the card stretch.
	.sql-wrapper {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.sql-page {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex: 1;
		min-height: 0;
	}

	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;

		h1 {
			margin: 0;
		}

		// Aligns the select with the bottom of the title.
		:global(.node-picker) {
			margin-bottom: 0;
		}
	}

	.workspace {
		display: flex;
		gap: 1rem;
		flex: 1;
		min-height: 0;
	}

	.catalog-panel {
		flex: 0 0 16rem;
		min-height: 0;
		padding-left: 1rem;
		border-left: 1px solid var(--border);
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;

		:global(.catalog-toggle) {
			display: none;
		}
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.editor-area {
		flex: 0 0 38%;
		min-height: 8rem;
	}

	// A flex column lets the grid shrink, so its body scrolls between a fixed header and footer.
	.result-area {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 12rem;
		overflow: auto;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.notice {
		margin: 0 0 0.5rem;
		color: var(--muted-foreground);
	}

	.error-block {
		padding: 0.75rem;
		border: 1px solid var(--destructive);
		border-radius: 0.5rem;
		color: var(--destructive);

		pre {
			margin: 0;
			white-space: pre-wrap;
			word-break: break-word;
		}

		p {
			margin: 0.5rem 0 0;
		}
	}

	@media (max-width: 767px) {
		.workspace {
			flex-direction: column;
		}

		.catalog-panel {
			display: none;
			flex-basis: auto;
			max-height: 40vh;
			order: -1;
			padding-left: 0;
			border-left: 0;

			&.open {
				display: block;
			}
		}

		.toolbar :global(.catalog-toggle) {
			display: inline-flex;
		}
	}
</style>
