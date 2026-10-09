<script lang="ts">
	import { t, formatDate, formatRelative } from '@/i18n';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { savedQueries, removeSavedQuery, clearSavedQueries, renameSavedQuery } from '@/stores/saved-queries';
	import { buildShareLink, type StoredQuery } from '@/stores/stored-query';
	import { addToast } from '@/stores/toasts';
	import { Utils } from '@/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import TableIcon from '@lucide/svelte/icons/table';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import WorkbenchIcon from '@lucide/svelte/icons/square-terminal';

	const entries = $derived([...$savedQueries]);

	function columnSummary(entry: StoredQuery): string {
		const columns = (entry.compiled?.query_parameters ?? []).map((p) => p.alias ?? p.column);
		if (!columns.length) return $t('query.entry.noColumns');
		return columns.join(', ');
	}

	function filterCount(entry: StoredQuery): number {
		return entry.compiled?.filters?.length ?? 0;
	}

	function savedAgo(entry: StoredQuery): string {
		return $formatRelative(entry.createdAt);
	}

	/**
	 * Open a page that runs the query. The link carries only the record id. The
	 * target page finds the record in the library. Therefore the workbench gets
	 * the saved builder state, and does not rebuild it from the compiled query.
	 */
	function openWith(resolvedPath: string, entry: StoredQuery): void {
		if (!entry.compiled) return;
		goto(`${resolvedPath}?q=${encodeURIComponent(entry.id)}`);
	}

	function openInWorkbench(entry: StoredQuery): void {
		openWith(resolve('/queries/workbench'), entry);
	}

	/**
	 * Copy a link for the browser of another person. A record id works only in the
	 * storage of this browser. Therefore a shared link carries the query itself.
	 * Every shared link opens the workbench. That page accepts a query with no
	 * record.
	 *
	 * The link also carries the name and the node of the query. A query runs on one
	 * node only, so the receiver needs it. The link never carries the token.
	 */
	async function copyShareLink(entry: StoredQuery): Promise<void> {
		const link = buildShareLink(entry);

		if (!link) {
			addToast({ type: 'warning', key: 'query.share.none' });
			return;
		}

		if (await Utils.copyToClipboard(link)) {
			addToast({ type: 'success', key: 'query.share.copied' });
		} else {
			addToast({ type: 'error', key: 'query.share.copyFailed' });
		}
	}

	// Inline rename state
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	function startRename(entry: StoredQuery): void {
		renamingId = entry.id;
		renameValue = entry.name;
	}

	function commitRename(id: string): void {
		if (renameValue.trim()) renameSavedQuery(id, renameValue.trim());
		renamingId = null;
	}

	function cancelRename(): void {
		renamingId = null;
	}
</script>

<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('saved.title') })}</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: $t('nav.item.queries'), href: resolve('/queries') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<div class="header">
			<div>
				<h1>{$t('saved.title')}</h1>
				<p>{$t('saved.intro')}</p>
			</div>
			{#if entries.length > 0}
				<div class="buttons">
					<Button variant="outline" onclick={() => clearSavedQueries()}>
						{$t('saved.clear')}
						<Trash2Icon />
					</Button>
				</div>
			{/if}
		</div>

		{#if entries.length === 0}
			<Card>
				<h2>{$t('saved.empty.title')}</h2>
				<p>
					{$t('saved.empty.beforeLink')}
					<a href={resolve('/queries/workbench')}>{$t('nav.item.queryBuilder')}</a>
					{$t('saved.empty.beforeButton')}
					<strong>{$t('query.actions.save')}</strong>
					{$t('saved.empty.afterButton')}
				</p>
			</Card>
		{:else}
			<ul class="saved-queries">
				{#each entries as entry (entry.id)}
					<li>
						<Card>
							<div class="entry">
								<div class="entry-main">
									{#if renamingId === entry.id}
										<div class="rename-row">
											<input
												class="rename-input"
												bind:value={renameValue}
												onkeydown={(e) => {
													if (e.key === 'Enter') commitRename(entry.id);
													if (e.key === 'Escape') cancelRename();
												}}
											/>
											<Button size="sm" variant="outline" onclick={() => commitRename(entry.id)}>
												{$t('common.save')}
											</Button>
											<Button size="sm" variant="ghost" onclick={cancelRename}>{$t('common.cancel')}</Button>
										</div>
									{:else}
										<div class="entry-name" title={entry.name}>{entry.name}</div>
									{/if}
									<div class="meta">
										{#if entry.node.name || entry.node.url}
											<span class="badge">{entry.node.name || entry.node.url}</span>
										{/if}
										<span class="columns" title={columnSummary(entry)}>{columnSummary(entry)}</span>
										<span>{$t('query.filterCount', { count: filterCount(entry) })}</span>
										<span title={$formatDate(new Date(entry.createdAt), { dateStyle: 'short', timeStyle: 'medium' })}>
											{$t('saved.entry.savedAgo', { time: savedAgo(entry) })}
										</span>
									</div>
								</div>

								<div class="actions">
									<Button
										size="sm"
										variant="outline"
										onclick={() => openInWorkbench(entry)}
										title={$t('query.entry.openInBuilder')}
									>
										<WorkbenchIcon />
										{$t('nav.item.queryBuilder')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/table-explorer'), entry)}
									>
										<TableIcon />
										{$t('query.entry.table')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/map-viewer'), entry)}
									>
										<MapIcon />
										{$t('query.entry.map')}
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/chart-explorer'), entry)}
									>
										<ChartPieIcon />
										{$t('query.entry.chart')}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onclick={() => startRename(entry)}
										title={$t('common.rename')}
									>
										<PencilLineIcon />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onclick={() => copyShareLink(entry)}
										title={$t('query.share.copyTitle')}
									>
										<Share2Icon />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onclick={() => removeSavedQuery(entry.id)}
										title={$t('saved.entry.remove')}
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

	.saved-queries {
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

	.entry-name {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rename-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.rename-input {
		flex: 1 1 12rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--background);
		color: var(--foreground);
		font-size: 1rem;
		font-weight: 600;

		&:focus {
			outline: 2px solid var(--ring);
			outline-offset: 1px;
		}
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.35rem;
		font-size: 0.85rem;
		color: color-mix(in oklab, var(--foreground) 65%, transparent);
	}

	.columns {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 30ch;
	}

	.badge {
		padding: 0.05rem 0.5rem;
		border-radius: 0.375rem;
		background-color: color-mix(in oklab, var(--accent) 60%, transparent);
		color: var(--foreground);
		white-space: nowrap;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
</style>
