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
	import { t, translate } from '@/i18n';
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
				if (!credentials) throw new Error(translate('dataBrowser.crawlers.noSession'));
				return runCrawlerReport(normalizeUrl(current.url), credentials, crawler.name);
			});
			// A node switch during the run makes this report belong to another node.
			if (report !== null && current.url === nodeUrl) reports[crawler.name] = report;
		} catch (caught) {
			if (current.url === nodeUrl) {
				addToast({
					type: 'error',
					key: 'dataBrowser.crawlers.runFailed',
					message: adminErrorMessage(caught)
				});
			}
		} finally {
			delete runningByUrl[url];
		}
	}

	async function remove(crawler: Crawler) {
		const current = node;
		if (!current) return;

		const sure = await askConfirm({
			title: translate('dataBrowser.crawlers.delete.title', { name: crawler.name }),
			message: translate('dataBrowser.crawlers.delete.message', {
				name: crawler.name,
				node: current.name
			}),
			note: translate('dataBrowser.crawlers.delete.note'),
			confirmLabel: translate('common.delete'),
			destructive: true
		});
		if (!sure) return;

		try {
			const done = await withAdmin(current, async (client) => {
				await client.admin.dropCrawler(crawler.name);
				return true;
			});
			if (done) {
				addToast({
					type: 'success',
					key: 'dataBrowser.crawlers.delete.done',
					values: { name: crawler.name }
				});
				await load();
			}
		} catch (caught) {
			addToast({
				type: 'error',
				key: 'dataBrowser.crawlers.delete.failed',
				message: adminErrorMessage(caught)
			});
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
	<title>{$t('app.pageTitle', { page: $t('nav.item.crawlers') })}</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: $t('nav.item.dataBrowser'), href: resolve('/data-browser') },
		{ label: $t('nav.item.crawlers'), href: resolve('/data-browser/crawlers') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>{$t('nav.item.crawlers')}</h1>

		<p>{$t('dataBrowser.crawlers.intro')}</p>

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
						{$t('dataBrowser.crawlers.newCrawler')}
					</Button>
				{/snippet}
			</NodePicker>

			{#if !node}
				<p>{$t('dataBrowser.crawlers.pickNode')}</p>
			{:else if phase === 'loading'}
				<p class="muted">{$t('dataBrowser.crawlers.loading')}</p>
			{:else if phase === 'needs-sign-in'}
				<p>{$t('dataBrowser.crawlers.needsSignIn', { node: node.name })}</p>
				<Button onclick={load}>{$t('dataBrowser.crawlers.signIn')}</Button>
			{:else if phase === 'error'}
				<p class="error">{error}</p>
				<Button variant="outline" onclick={load}>{$t('dataBrowser.crawlers.tryAgain')}</Button>
			{:else if phase === 'ready' && crawlers.length === 0}
				<p class="muted">{$t('dataBrowser.crawlers.empty')}</p>
			{:else if phase === 'ready'}
				<ul class="cards">
					{#each crawlers as crawler (crawler.name)}
						<li class="card">
							<div class="card-head">
								<h3>{crawler.name}</h3>
								<div class="card-actions">
									<Button size="sm" disabled={running !== null} onclick={() => run(crawler)}>
										<PlayIcon />
										{#if running === crawler.name}
											{$t('dataBrowser.crawlers.busy')}
										{:else}
											{$t('dataBrowser.crawlers.run')}
										{/if}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={running !== null}
										onclick={() => (dialog = { crawler })}>{$t('common.edit')}</Button
									>
									<Button
										size="sm"
										variant="destructive"
										disabled={running !== null}
										onclick={() => remove(crawler)}>{$t('common.delete')}</Button
									>
								</div>
							</div>

							<dl>
								<dt>{$t('dataBrowser.crawlers.field.folder')}</dt>
								<dd class="mono">{crawler.targetPrefix}</dd>
								<dt>{$t('dataBrowser.crawlers.field.formats')}</dt>
								<dd>{$t(describeFormats(crawler.formatFilter))}</dd>
								<dt>{$t('dataBrowser.crawlers.field.naming')}</dt>
								<dd>{$t(describeNaming(crawler.tableNaming))}</dd>
								<dt>{$t('dataBrowser.crawlers.field.partitions')}</dt>
								<dd>{$t(crawler.detectPartitions ? 'common.on' : 'common.off')}</dd>
								<dt>{$t('dataBrowser.crawlers.field.schedule')}</dt>
								<dd>{$t(describeSchedule(crawler.scheduleSecs))}</dd>
								<dt>{$t('dataBrowser.crawlers.field.options')}</dt>
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
