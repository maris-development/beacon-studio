<!-- src/lib/components/modals/CacheInfoModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	import Modal from '$lib/components/modals/Modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { queryStore, type MemoryCacheStats } from '@/stores/query-store.svelte';
	import {
		opfsArrowCache,
		type DiskCacheStats,
		type OpfsDatasetMeta
	} from '@/stores/opfs-arrow-cache';

	let { onClose = () => {} } = $props();

	let memory = $state<MemoryCacheStats | null>(null);
	let disk = $state<DiskCacheStats | null>(null);
	let loading = $state(true);

	async function load(): Promise<void> {
		loading = true;
		memory = queryStore.stats();
		disk = await opfsArrowCache.stats();
		loading = false;
	}

	async function clearAll(): Promise<void> {
		// Clears the in-memory cache and the OPFS tier (see queryStore.invalidate()).
		queryStore.invalidate();
		await load();
	}

	onMount(load);

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let value = n;
		let unit = -1;
		do {
			value /= 1024;
			unit++;
		} while (value >= 1024 && unit < units.length - 1);
		return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
	}

	function formatAge(epochMs: number): string {
		return formatDistanceToNow(epochMs, { addSuffix: true });
	}

	function formatDuration(ms: number): string {
		return `${(ms / (60 * 60 * 1000)).toFixed(0)}h`;
	}

	function pct(used: number, cap: number): number {
		if (cap <= 0) return 0;
		return Math.min(100, Math.round((used / cap) * 100));
	}

	/** Beacon's query id, or `n/a` (only absent when the query failed). */
	function displayId(entry: OpfsDatasetMeta): string {
		return entry.queryId ?? 'n/a';
	}
</script>

<Modal title="Cache information" onClose={() => onClose()} width="820px">
	{#if loading && !memory}
		<p>Loading cache information…</p>
	{:else}
		<div class="cache-info">
			<!-- Memory tier -->
			<section>
				<div class="section-head">
					<h2>Memory cache</h2>
					<span class="subtle">decoded Arrow tables, this session</span>
				</div>

				<div class="stat-grid">
					<div class="stat">
						<span class="stat-label">Items</span>
						<span class="stat-value">{memory?.entryCount} / {memory?.maxEntries}</span>
						<div class="meter">
							<div class="fill" style="width: {pct(memory?.entryCount ?? 0, memory?.maxEntries ?? 1)}%"></div>
						</div>
					</div>
					<div class="stat">
						<span class="stat-label">Memory used</span>
						<span class="stat-value">{formatBytes(memory?.totalBytes ?? 0)}</span>
					</div>
					<div class="stat">
						<span class="stat-label">Cells</span>
						<span class="stat-value">{(memory?.totalCells ?? 0).toLocaleString()}</span>
						<div class="meter">
							<div class="fill" style="width: {pct(memory?.totalCells ?? 0, memory?.maxTotalCells ?? 1)}%"></div>
						</div>
					</div>
					<div class="stat">
						<span class="stat-label">Derived tables</span>
						<span class="stat-value">{memory?.derivedTableCount ?? 0}</span>
					</div>
				</div>

				{#if memory && memory.entries.length > 0}
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th>Columns</th>
									<th class="num">Rows</th>
									<th class="num">Cols</th>
									<th class="num">Size</th>
								</tr>
							</thead>
							<tbody>
								{#each memory.entries as entry (entry.key)}
									<tr>
										<td class="cols" title={entry.columns.join(', ')}>
											{entry.columns.join(', ') || '—'}
											{#if entry.isCurrent}<span class="badge">current</span>{/if}
										</td>
										<td class="num">{entry.rowCount.toLocaleString()}</td>
										<td class="num">{entry.colCount}</td>
										<td class="num">{formatBytes(entry.bytes)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="empty">No datasets held in memory.</p>
				{/if}
			</section>

			<!-- Disk tier -->
			<section>
				<div class="section-head">
					<h2>Disk cache (OPFS)</h2>
					<span class="subtle">
						persists across reloads · expires {disk ? formatDuration(disk.maxAgeMs) : '—'} after storing
					</span>
				</div>

				{#if disk && !disk.supported}
					<p class="empty">Not available in this environment (OPFS unsupported).</p>
				{:else}
					<div class="stat-grid">
						<div class="stat">
							<span class="stat-label">Items</span>
							<span class="stat-value">{disk?.entryCount} / {disk?.maxEntries}</span>
							<div class="meter">
								<div class="fill" style="width: {pct(disk?.entryCount ?? 0, disk?.maxEntries ?? 1)}%"></div>
							</div>
						</div>
						<div class="stat">
							<span class="stat-label">Disk used</span>
							<span class="stat-value">{formatBytes(disk?.totalBytes ?? 0)} / {formatBytes(disk?.maxTotalBytes ?? 0)}</span>
							<div class="meter">
								<div class="fill" style="width: {pct(disk?.totalBytes ?? 0, disk?.maxTotalBytes ?? 1)}%"></div>
							</div>
						</div>
					</div>

					{#if disk && disk.entries.length > 0}
						<div class="table-scroll">
							<table>
								<thead>
									<tr>
										<th>Query id</th>
										<th class="num">Rows</th>
										<th class="num">Size</th>
										<th>Stored</th>
										<th>Last used</th>
									</tr>
								</thead>
								<tbody>
									{#each disk.entries as entry (entry.key)}
										<tr>
											<td class="id" class:na={!entry.queryId} title={entry.queryId ?? undefined}>{displayId(entry)}</td>
											<td class="num">{entry.rowCount.toLocaleString()}</td>
											<td class="num">{formatBytes(entry.byteLength)}</td>
											<td title={new Date(entry.createdAt).toLocaleString()}>{formatAge(entry.createdAt)}</td>
											<td title={new Date(entry.lastAccessedAt).toLocaleString()}>{formatAge(entry.lastAccessedAt)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="empty">No results stored on disk.</p>
					{/if}
				{/if}
			</section>
		</div>
	{/if}

	<div slot="footer" class="footer-actions">
		<Button variant="outline" size="sm" onclick={() => load()} disabled={loading}>
			Refresh
			<RefreshCwIcon />
		</Button>
		<Button variant="destructive" size="sm" onclick={() => clearAll()} disabled={loading}>
			Clear all caches
			<Trash2Icon />
		</Button>
	</div>
</Modal>

<style lang="scss">
	.cache-info {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		color: #1a1a1a;
		max-height: 65vh;
		overflow-y: auto;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		border-bottom: 1px solid #e5e5e5;
		padding-bottom: 0.35rem;

		h2 {
			margin: 0;
			font-size: 1.05rem;
		}
	}

	.subtle {
		font-size: 0.8rem;
		color: #6b7280;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid #e5e5e5;
		border-radius: 0.5rem;
		background: #fafafa;
	}

	.stat-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #6b7280;
	}

	.stat-value {
		font-size: 1.05rem;
		font-weight: 600;
	}

	.meter {
		height: 5px;
		border-radius: 999px;
		background: #e5e7eb;
		overflow: hidden;
		margin-top: 0.25rem;

		.fill {
			height: 100%;
			background: #3b82f6;
			border-radius: 999px;
		}
	}

	.table-scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;

		th,
		td {
			text-align: left;
			padding: 0.35rem 0.5rem;
			border-bottom: 1px solid #f0f0f0;
			white-space: nowrap;
		}

		th {
			font-weight: 600;
			color: #6b7280;
		}

		td.num,
		th.num {
			text-align: right;
			font-variant-numeric: tabular-nums;
		}

		td.cols {
			max-width: 320px;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	td.na {
		color: #9ca3af;
		font-style: italic;
	}

	.badge {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0.02rem 0.4rem;
		font-size: 0.7rem;
		border-radius: 0.35rem;
		background: #dbeafe;
		color: #1d4ed8;
		vertical-align: middle;
	}

	.empty {
		font-size: 0.85rem;
		color: #6b7280;
		margin: 0;
	}

	.footer-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
