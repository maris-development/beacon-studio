<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { savedQueries, removeSavedQuery, clearSavedQueries, renameSavedQuery } from '@/stores/saved-queries';
	import { buildShareLink, SHARE_LINK_PATH, type StoredQuery } from '@/stores/stored-query';
	import { addToast } from '@/stores/toasts';
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
		if (!columns.length) return '(no columns)';
		return columns.join(', ');
	}

	function filterCount(entry: StoredQuery): number {
		return entry.compiled?.filters?.length ?? 0;
	}

	function savedAgo(entry: StoredQuery): string {
		return formatDistanceToNow(entry.createdAt, { addSuffix: true });
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
	<title>Saved Queries - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Queries', href: resolve('/queries') }]} />

<div class="page-wrapper">
	<div class="page-container">
		<div class="header">
			<div>
				<h1>Saved Queries</h1>
				<p>Queries you've saved from the query builder. Re-run, visualise, or open any saved query.</p>
			</div>
			{#if entries.length > 0}
				<div class="buttons">
					<Button variant="outline" onclick={() => clearSavedQueries()}>
						Clear saved
						<Trash2Icon />
					</Button>
				</div>
			{/if}
		</div>

		{#if entries.length === 0}
			<Card>
				<h2>No saved queries yet</h2>
				<p>
					Build a query in the <a href={resolve('/queries/workbench')}>Query Builder</a> and click
					<strong>Save Query</strong> to add it here.
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
												Save
											</Button>
											<Button size="sm" variant="ghost" onclick={cancelRename}>Cancel</Button>
										</div>
									{:else}
										<div class="entry-name" title={entry.name}>{entry.name}</div>
									{/if}
									<div class="meta">
										{#if entry.instance.name || entry.instance.url}
											<span class="badge">{entry.instance.name || entry.instance.url}</span>
										{/if}
										<span class="columns" title={columnSummary(entry)}>{columnSummary(entry)}</span>
										<span>{filterCount(entry)} filter{filterCount(entry) === 1 ? '' : 's'}</span>
										<span title={new Date(entry.createdAt).toLocaleString()}>saved {savedAgo(entry)}</span>
									</div>
								</div>

								<div class="actions">
									<Button
										size="sm"
										variant="outline"
										onclick={() => openInWorkbench(entry)}
										title="Open in Query Workbench"
									>
										<WorkbenchIcon />
										Workbench
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/table-explorer'), entry)}
									>
										<TableIcon />
										Table
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/map-viewer'), entry)}
									>
										<MapIcon />
										Map
									</Button>
									<Button
										size="sm"
										variant="outline"
										onclick={() => openWith(resolve('/visualisations/chart-explorer'), entry)}
									>
										<ChartPieIcon />
										Chart
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onclick={() => startRename(entry)}
										title="Rename"
									>
										<PencilLineIcon />
									</Button>
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
										onclick={() => removeSavedQuery(entry.id)}
										title="Remove saved query"
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
