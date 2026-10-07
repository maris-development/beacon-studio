<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Button from '@/components/buttons/Button.svelte';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminOnlyNotice from '@/components/data-browser/AdminOnlyNotice.svelte';
	import CrawlerDialog from '@/components/data-browser/CrawlerDialog.svelte';
	import CrawlerReport from '@/components/data-browser/CrawlerReport.svelte';
	import { makeBeaconClient } from '@/beacon-api/client';
	import { runCrawlerReport, type CrawlReport } from '@/beacon-api/crawler-run';
	import { currentNode, normalizeUrl } from '@/services/beacon-node';
	import { adminErrorMessage, credentialsOf, withAdmin } from '@/services/admin-session';
	import { askConfirm } from '@/stores/confirm';
	import { addToast } from '@/stores/toasts';
	import { settings } from '@/stores/settings';
	import { withBack } from '@/data-browser/back';
	import {
		describeFormats,
		describeNaming,
		describeSchedule,
		parseCrawlers,
		type Crawler
	} from '@/data-browser/crawlers';
	import { DATASET_LIST_LIMIT, parseEntries } from '@/data-browser/datasets';

	type Phase = 'idle' | 'loading' | 'needs-sign-in' | 'ready' | 'error';

	let phase: Phase = $state('idle');
	let crawlers: Crawler[] = $state([]);
	let error = $state('');
	// The busy crawler of each node URL. A run goes on when the user looks at another node.
	let runningByUrl: Record<string, string> = $state({});
	let reports: Record<string, CrawlReport> = $state({});
	let dialog: { crawler: Crawler | null } | null = $state(null);
	let reportsUrl: string | null = null;

	let node = $derived($currentNode);
	let nodeUrl = $derived(node?.url ?? null);
	let admin = $derived($settings.adminFeatures);
	let running = $derived.by(() => {
		if (nodeUrl === null) return null;
		return runningByUrl[nodeUrl] ?? null;
	});

	// Opening this page counts as an admin action, so it can ask for a sign-in.
	$effect(() => {
		if (!admin || !nodeUrl) return;
		untrack(() => load());
	});

	async function load() {
		const current = node;
		if (!current) return;

		phase = 'loading';

		// A report stays until the page reloads, unless the node changes.
		if (current.url !== reportsUrl) {
			reports = {};
			reportsUrl = current.url;
		}

		try {
			const raw = await withAdmin(current, (client) => client.admin.listCrawlers<unknown>());
			if (current.url !== nodeUrl) return;

			if (raw === null) {
				phase = 'needs-sign-in';
				return;
			}

			crawlers = parseCrawlers(raw).sort((a, b) => a.name.localeCompare(b.name));
			phase = 'ready';
		} catch (caught) {
			if (current.url === nodeUrl) {
				error = adminErrorMessage(caught);
				phase = 'error';
			}
		}
	}

	let pathsLoad: { url: string; promise: Promise<string[]> } | null = null;

	// The dialog and its folder picker share one request of up to 100,000 paths.
	function loadPaths(): Promise<string[]> {
		if (!node) return Promise.resolve([]);
		if (pathsLoad && pathsLoad.url === node.url) return pathsLoad.promise;

		const promise = makeBeaconClient(node)
			.datasets({ limit: DATASET_LIST_LIMIT })
			.then((raw) => parseEntries(raw).map((entry) => entry.path));
		promise.catch(() => (pathsLoad = null));
		pathsLoad = { url: node.url, promise };

		return promise;
	}

	async function run(crawler: Crawler) {
		const current = node;
		if (!current || running) return;

		const url = current.url;
		runningByUrl[url] = crawler.name;

		try {
			// The credentials are read inside, so a retry after a new sign-in uses the new ones.
			const report = await withAdmin(current, () => {
				const credentials = credentialsOf(current.id);
				if (!credentials) throw new Error('No admin session.');
				return runCrawlerReport(normalizeUrl(current.url), credentials, crawler.name);
			});
			// A node switch during the run makes this report belong to another node.
			if (report !== null && current.url === nodeUrl) reports[crawler.name] = report;
		} catch (caught) {
			if (current.url === nodeUrl) addToast({ type: 'error', message: adminErrorMessage(caught) });
		} finally {
			delete runningByUrl[url];
		}
	}

	async function remove(crawler: Crawler) {
		const current = node;
		if (!current) return;

		const sure = await askConfirm({
			title: `Delete crawler ${crawler.name}`,
			message: `Delete the crawler "${crawler.name}" from ${current.name}?`,
			note: 'Tables that this crawler made stay. Delete them on the Tables page.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!sure) return;

		try {
			const done = await withAdmin(current, async (client) => {
				await client.admin.dropCrawler(crawler.name);
				return true;
			});
			if (done) {
				addToast({ type: 'success', message: `Deleted the crawler ${crawler.name}.` });
				await load();
			}
		} catch (caught) {
			addToast({ type: 'error', message: adminErrorMessage(caught) });
		}
	}

	function tableHref(name: string): string {
		if (!node) return '#';
		const query = new URLSearchParams({ table_name: name, node: node.url }).toString();
		return withBack(
			`${resolve('/data-browser/data-tables/detail')}?${query}`,
			`${page.url.pathname}${page.url.search}`
		);
	}

	async function onSaved() {
		dialog = null;
		await load();
	}
</script>

<svelte:head>
	<title>Crawlers - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Crawlers', href: resolve('/data-browser/crawlers') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Crawlers</h1>

		<p>A crawler scans a folder of the node and creates a table for each group of files.</p>

		{#if !admin}
			<AdminOnlyNotice />
		{:else}
			<NodePicker>
				{#snippet actions()}
					<Button
						variant="outline"
						disabled={!node || phase !== 'ready'}
						onclick={() => (dialog = { crawler: null })}
					>
						<PlusIcon />
						New crawler
					</Button>
				{/snippet}
			</NodePicker>

			{#if !node}
				<p>Pick a Beacon node.</p>
			{:else if phase === 'loading'}
				<p class="muted">Loading the crawlers...</p>
			{:else if phase === 'needs-sign-in'}
				<p>Sign in to see the crawlers of {node.name}.</p>
				<Button onclick={load}>Sign in</Button>
			{:else if phase === 'error'}
				<p class="error">{error}</p>
				<Button variant="outline" onclick={load}>Try again</Button>
			{:else if phase === 'ready' && crawlers.length === 0}
				<p class="muted">No crawlers on this node, or the node could not list them.</p>
			{:else if phase === 'ready'}
				<ul class="cards">
					{#each crawlers as crawler (crawler.name)}
						<li class="card">
							<div class="card-head">
								<h3>{crawler.name}</h3>
								<div class="card-actions">
									<Button size="sm" disabled={running !== null} onclick={() => run(crawler)}>
										<PlayIcon />
										{#if running === crawler.name}Busy...{:else}Run{/if}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={running !== null}
										onclick={() => (dialog = { crawler })}>Edit</Button
									>
									<Button
										size="sm"
										variant="destructive"
										disabled={running !== null}
										onclick={() => remove(crawler)}>Delete</Button
									>
								</div>
							</div>

							<dl>
								<dt>Folder</dt>
								<dd class="mono">{crawler.targetPrefix}</dd>
								<dt>Formats</dt>
								<dd>{describeFormats(crawler.formatFilter)}</dd>
								<dt>Table names</dt>
								<dd>{describeNaming(crawler.tableNaming)}</dd>
								<dt>Partitions</dt>
								<dd>{crawler.detectPartitions ? 'On' : 'Off'}</dd>
								<dt>Schedule</dt>
								<dd>{describeSchedule(crawler.scheduleSecs)}</dd>
								<dt>Options</dt>
								<dd>{Object.keys(crawler.options).length}</dd>
							</dl>

							{#if reports[crawler.name]}
								<CrawlerReport report={reports[crawler.name]} {tableHref} />
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

{#if dialog && node}
	<CrawlerDialog
		{node}
		crawler={dialog.crawler}
		{loadPaths}
		onClose={() => (dialog = null)}
		{onSaved}
	/>
{/if}

<style lang="scss">
	.cards {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}

	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;

		h3 {
			margin: 0;
		}
	}

	.card-actions {
		display: flex;
		gap: 0.5rem;
	}

	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0.75rem 0 0;
		font-size: var(--font-size-sm);
	}

	dt {
		color: var(--muted-foreground);
	}

	dd {
		margin: 0;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
