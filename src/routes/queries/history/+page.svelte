<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { queryHistory, clearHistory } from '@/stores/query-history';
	import { buildShareLink, SHARE_LINK_PATH, type StoredQuery } from '@/stores/stored-query';
	import { addToast } from '@/stores/toasts';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import TableIcon from '@lucide/svelte/icons/table';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import CacheInfoModal from '@/components/modals/CacheInfoModal.svelte';

	// Newest activity first.
	const entries = $derived(
		[...$queryHistory].sort((a, b) => (b.lastExecutedAt ?? 0) - (a.lastExecutedAt ?? 0))
	);

	/** Comma-separated selected columns, for a compact query summary. */
	function columnSummary(entry: StoredQuery): string {
		const columns = (entry.compiled?.query_parameters ?? []).map((p) => p.alias ?? p.column);
		if (!columns.length) return '(no columns)';
		return columns.join(', ');
	}

	function filterCount(entry: StoredQuery): number {
		return entry.compiled?.filters?.length ?? 0;
	}

	function lastExecuted(entry: StoredQuery): string {
		if (!entry.lastExecutedAt) return 'never';
		return formatDistanceToNow(entry.lastExecutedAt, { addSuffix: true });
	}

	/**
	 * Open a page that runs the query. The link carries only the record id. The
	 * target page finds the record in the library.
	 *
	 * The caller sends `resolvedPath` through `resolve()` first, because
	 * SvelteKit accepts only a route literal there, not a string.
	 */
	function openWith(resolvedPath: string, entry: StoredQuery): void {
		if (!entry.compiled) return;
		goto(`${resolvedPath}?q=${encodeURIComponent(entry.id)}`);
	}

	/**
	 * Copy a link for the browser of another person. A record id works only in the
	 * storage of this browser. Therefore a shared link carries the query itself.
	 * Every shared link opens the workbench. That page accepts a query with no
	 * record.
	 *
	 * The link also carries the node of the query. A query runs on one node only,
	 * so the receiver needs it. The link never carries the token.
	 */
	async function copyShareLink(entry: StoredQuery): Promise<void> {
		const link = buildShareLink(entry.compiled, resolve(SHARE_LINK_PATH), entry.instance);

		if (!link) {
			addToast({ type: 'warning', message: 'This entry has no shareable query.' });
			return;
		}

		try {
			await navigator.clipboard.writeText(link);
			addToast({ type: 'success', message: 'Share link copied to clipboard.' });
		} catch (error) {
			console.error('Failed to copy share link.', error);
			addToast({ type: 'error', message: 'Could not copy the share link.' });
		}
	}

	let showInfoModal = $state(false);

	function showInfo(): void {
		showInfoModal = true;
	}

	function closeInfo(): void {
		showInfoModal = false;
	}
</script>

<svelte:head>
	<title>Query History - Beacon Studio</title>
</svelte:head>

{#if showInfoModal}
	<CacheInfoModal onClose={() => closeInfo()} />
{/if}

<Cookiecrumb crumbs={[{ label: 'Queries', href: resolve('/queries') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<div class="header">
			<div>
				<h1>Query History</h1>
				<p>Queries you've executed. Re-run, view, or edit any of them.</p>
			</div>
			<div class="buttons">
				<Button variant="outline" onclick={() => showInfo()}>
					<InfoIcon />
				</Button>

				{#if entries.length > 0}
					<Button variant="outline" onclick={() => clearHistory()}>
						Clear history
						<Trash2Icon />
					</Button>
				{/if}
			</div>
		</div>

		{#if entries.length === 0}
			<Card>
				<h2>No queries yet</h2>
				<p>Once you execute a query, it will show up here.</p>
			</Card>
		{:else}
			<ul class="executed-queries">
				{#each entries as entry (entry.id)}
					<li>
						<Card>
							<div class="entry">
								<div class="entry-main">
									<div class="columns" title={columnSummary(entry)}>{columnSummary(entry)}</div>
									<div class="meta">
										<span class="badge">{entry.instance.name || entry.instance.url}</span>
										<span>{(entry.rowCount ?? 0).toLocaleString()} rows</span>
										<span>{filterCount(entry)} filter{filterCount(entry) === 1 ? '' : 's'}</span>
										<span>{Math.round(entry.duration ?? 0).toLocaleString()} ms</span>
										<span title={entry.lastExecutedAt ? new Date(entry.lastExecutedAt).toLocaleString() : ''}>
											{lastExecuted(entry)}
										</span>
										{#if entry.executionCount > 1}
											<span>· run {entry.executionCount}×</span>
										{/if}
									</div>
								</div>

								<div class="actions">
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/table-explorer'), entry)}
									>
										Table
										<TableIcon />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/map-viewer'), entry)}
									>
										Map
										<MapIcon />
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/chart-explorer'), entry)}
									>
										Chart
										<ChartPieIcon />
									</Button>
									<!-- <Button
									size="sm"
									variant="outline"
									onclick={() => openWith(resolve('/queries/query-editor'), entry)}
								>
									Edit
									<PencilIcon />
								</Button> -->
									<Button
										size="sm"
										variant="ghost"
										onclick={() => copyShareLink(entry)}
										title="Copy a link that works in any browser"
									>
										<Share2Icon />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onclick={() => queryHistory.remove(entry.id)}
										title="Remove from history"
									>
										<Trash2Icon />
									</Button>
								</div>
							</div>
						</Card>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style lang="scss">
	.header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;

		.buttons {
			display: flex;
			gap: 0.5rem;
		}
	}

	.executed-queries {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.entry {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.entry-main {
		min-width: 0;
		flex: 1 1 20rem;
	}

	.columns {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.35rem;
		font-size: 0.85rem;
		color: color-mix(in oklab, var(--foreground) 65%, transparent);
	}

	.badge {
		padding: 0.05rem 0.5rem;
		border-radius: 0.375rem;
		background-color: color-mix(in oklab, var(--accent) 60%, transparent);
		color: var(--foreground);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
</style>
