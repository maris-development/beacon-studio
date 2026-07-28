<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import Card from '@/components/card/Card.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { queryHistory, removeHistoryEntry, clearHistory } from '@/stores/query-history';
	import type { QueryHistoryEntry } from '@/stores/query-history';
	import { Utils } from '@/utils';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import TableIcon from '@lucide/svelte/icons/table';
	import MapIcon from '@lucide/svelte/icons/map';
	import ChartPieIcon from '@lucide/svelte/icons/chart-pie';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import InfoIcon from '@lucide/svelte/icons/info';
	import CacheInfoModal from '@/components/modals/CacheInfoModal.svelte';

	// Newest activity first.
	const entries = $derived([...$queryHistory].sort((a, b) => b.lastExecutedAt - a.lastExecutedAt));

	/** Comma-separated selected columns, for a compact query summary. */
	function columnSummary(entry: QueryHistoryEntry): string {
		const columns = (entry.query.query_parameters ?? []).map((p) => p.alias ?? p.column);
		return columns.length ? columns.join(', ') : '(no columns)';
	}

	function filterCount(entry: QueryHistoryEntry): number {
		return entry.query.filters?.length ?? 0;
	}

	function lastExecuted(entry: QueryHistoryEntry): string {
		return formatDistanceToNow(entry.lastExecutedAt, { addSuffix: true });
	}

	/**
	 * Navigates to a page that runs the query, passing it via the gzipped `?query=`
	 * payload. `resolvedPath` is a route already run through `resolve()` at the call
	 * site (SvelteKit's `resolve` only accepts route literals, not a generic string).
	 */
	function openWith(resolvedPath: string, entry: QueryHistoryEntry): void {
		const gzipped = Utils.objectToGzipString(entry.query);
		if (gzipped) {
			goto(resolvedPath + `?query=${encodeURIComponent(gzipped)}`);
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
				<h2>Query History</h2>
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
			<div class="executed-queries">
				{#each entries as entry (entry.key)}
					<Card>
						<div class="entry">
							<div class="entry-main">
								<h2 class="columns" title={columnSummary(entry)}>{columnSummary(entry)}</h2>
								<div class="meta">
									<span class="badge">{entry.instanceName || entry.instanceUrl}</span>
									<span>{entry.rowCount.toLocaleString()} rows</span>
									<span>{filterCount(entry)} filter{filterCount(entry) === 1 ? '' : 's'}</span>
									<span>{Math.round(entry.duration).toLocaleString()} ms</span>
									<span title={new Date(entry.lastExecutedAt).toLocaleString()}>
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
									onclick={() => removeHistoryEntry(entry.key)}
									title="Remove from history"
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
