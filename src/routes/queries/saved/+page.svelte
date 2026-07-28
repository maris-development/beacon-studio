<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { savedQueries, removeSavedQuery, clearSavedQueries, renameSavedQuery } from '@/stores/saved-queries';
	import type { SavedQueryEntry } from '@/stores/saved-queries';
	import { Utils } from '@/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import TableIcon from '@lucide/svelte/icons/table';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PencilLineIcon from '@lucide/svelte/icons/pencil-line';
	import WorkbenchIcon from '@lucide/svelte/icons/square-terminal';

	const entries = $derived([...$savedQueries]);

	function columnSummary(entry: SavedQueryEntry): string {
		const columns = (entry.query.query_parameters ?? []).map((p) => p.alias ?? p.column);
		return columns.length ? columns.join(', ') : '(no columns)';
	}

	function filterCount(entry: SavedQueryEntry): number {
		return entry.query.filters?.length ?? 0;
	}

	function savedAgo(entry: SavedQueryEntry): string {
		return formatDistanceToNow(entry.createdAt, { addSuffix: true });
	}

	function openWith(resolvedPath: string, entry: SavedQueryEntry): void {
		const gzipped = Utils.objectToGzipString(entry.query);
		if (gzipped) goto(resolvedPath + `?query=${encodeURIComponent(gzipped)}`);
	}

	function openInWorkbench(entry: SavedQueryEntry): void {
		openWith(resolve('/queries/workbench'), entry);
	}

	// Inline rename state
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	function startRename(entry: SavedQueryEntry): void {
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
				<h2>Saved Queries</h2>
				<p>Queries you've saved from the workbench. Re-run, visualise, or open any saved query.</p>
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
					Build a query in the <a href={resolve('/queries/workbench')}>Query Workbench</a> and click
					<strong>Save Query</strong> to add it here.
				</p>
			</Card>
		{:else}
			<div class="saved-queries">
				{#each entries as entry (entry.id)}
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
									<h2 class="entry-name" title={entry.name}>{entry.name}</h2>
								{/if}
								<div class="meta">
									{#if entry.instanceName || entry.instanceUrl}
										<span class="badge">{entry.instanceName || entry.instanceUrl}</span>
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
									onclick={() => removeSavedQuery(entry.id)}
									title="Remove saved query"
								>
									<Trash2Icon />
								</Button>
							</div>
						</div>
					</Card>
				{/each}
			</div>
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
