<!-- src/lib/components/modals/CacheInfoModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from '$lib/components/modals/Modal.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import DatabaseZapIcon from '@lucide/svelte/icons/database-zap';
	import { BeaconClient, type MemoryCacheStats } from '@/beacon-api/client';
	import {
		opfsArrowCache,
		type DiskCacheStats,
		type OpfsDatasetMeta
	} from '@/stores/opfs-arrow-cache';
	import { t, formatNumber, formatDate, formatRelative } from '@/i18n';

	let { onClose = () => {} } = $props();

	let memory = $state<MemoryCacheStats | null>(null);
	let disk = $state<DiskCacheStats | null>(null);
	let loading = $state(true);
	let cacheEnabled = $state(BeaconClient.isQueryCacheEnabled());

	async function load(): Promise<void> {
		loading = true;
		cacheEnabled = BeaconClient.isQueryCacheEnabled();
		memory = BeaconClient.queryCacheStats();
		disk = await opfsArrowCache.stats();
		loading = false;
	}

	async function clearAll(): Promise<void> {
		// Clears the in-memory cache and the OPFS tier (see BeaconClient.invalidateQueryCache()).
		BeaconClient.invalidateQueryCache();
		await load();
	}

	/**
	 * Toggles the query result cache on/off. Disabling also clears every cached
	 * result (memory + OPFS), so subsequent queries always re-execute until it's
	 * re-enabled.
	 */
	async function toggleCache(): Promise<void> {
		BeaconClient.setQueryCacheEnabled(!cacheEnabled);
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

	function formatDuration(ms: number): string {
		return $t('cache.hours', { hours: (ms / (60 * 60 * 1000)).toFixed(0) });
	}

	function formatStamp(epochMs: number): string {
		return $formatDate(new Date(epochMs), { dateStyle: 'short', timeStyle: 'medium' });
	}

	function pct(used: number, cap: number): number {
		if (cap <= 0) return 0;
		return Math.min(100, Math.round((used / cap) * 100));
	}

	/** Beacon's query id, or `n/a` (only absent when the query failed). */
	function displayId(entry: OpfsDatasetMeta): string {
		return entry.queryId ?? $t('cache.idMissing');
	}
</script>

<Modal title={$t('cache.title')} onClose={() => onClose()} width="820px">
	{#if loading && !memory}
		<p>{$t('cache.loading')}</p>
	{:else}
		<div class="cache-info">
			{#if !cacheEnabled}
				<p class="cache-disabled-note">
					{$t('cache.disabledNote')}
				</p>
			{/if}
			<!-- Memory tier -->
			<section>
				<div class="section-head">
					<h3>{$t('cache.memory.title')}</h3>
					<span class="subtle">{$t('cache.memory.subtitle')}</span>
				</div>

				<div class="stat-grid">
					<div class="stat">
						<span class="stat-label">{$t('cache.stat.items')}</span>
						<span class="stat-value">{memory?.entryCount} / {memory?.maxEntries}</span>
						<div class="meter">
							<div class="fill" style="width: {pct(memory?.entryCount ?? 0, memory?.maxEntries ?? 1)}%"></div>
						</div>
					</div>
					<div class="stat">
						<span class="stat-label">{$t('cache.stat.memoryUsed')}</span>
						<span class="stat-value">{formatBytes(memory?.totalBytes ?? 0)}</span>
					</div>
					<div class="stat">
						<span class="stat-label">{$t('cache.stat.cells')}</span>
						<span class="stat-value">{$formatNumber(memory?.totalCells ?? 0)}</span>
						<div class="meter">
							<div class="fill" style="width: {pct(memory?.totalCells ?? 0, memory?.maxTotalCells ?? 1)}%"></div>
						</div>
					</div>
					<div class="stat">
						<span class="stat-label">{$t('cache.stat.derivedTables')}</span>
						<span class="stat-value">{memory?.derivedTableCount ?? 0}</span>
					</div>
				</div>

				{#if memory && memory.entries.length > 0}
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th>{$t('cache.table.columns')}</th>
									<th class="num">{$t('cache.table.rows')}</th>
									<th class="num">{$t('cache.table.cols')}</th>
									<th class="num">{$t('cache.table.size')}</th>
								</tr>
							</thead>
							<tbody>
								{#each memory.entries as entry (entry.key)}
									<tr>
										<td class="cols" title={entry.columns.join(', ')}>
											{entry.columns.join(', ') || $t('cache.notAvailable')}
											{#if entry.isCurrent}<span class="badge">{$t('cache.current')}</span>{/if}
										</td>
										<td class="num">{$formatNumber(entry.rowCount)}</td>
										<td class="num">{entry.colCount}</td>
										<td class="num">{formatBytes(entry.bytes)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="empty">{$t('cache.memory.empty')}</p>
				{/if}
			</section>

			<!-- Disk tier -->
			<section>
				<div class="section-head">
					<h3>{$t('cache.disk.title')}</h3>
					<span class="subtle">
						{$t('cache.disk.subtitle', { duration: disk ? formatDuration(disk.maxAgeMs) : $t('cache.notAvailable') })}
					</span>
				</div>

				{#if disk && !disk.supported}
					<p class="empty">{$t('cache.disk.unsupported')}</p>
				{:else}
					<div class="stat-grid">
						<div class="stat">
							<span class="stat-label">{$t('cache.stat.items')}</span>
							<span class="stat-value">{disk?.entryCount} / {disk?.maxEntries}</span>
							<div class="meter">
								<div class="fill" style="width: {pct(disk?.entryCount ?? 0, disk?.maxEntries ?? 1)}%"></div>
							</div>
						</div>
						<div class="stat">
							<span class="stat-label">{$t('cache.stat.diskUsed')}</span>
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
										<th>{$t('cache.table.queryId')}</th>
										<th class="num">{$t('cache.table.rows')}</th>
										<th class="num">{$t('cache.table.size')}</th>
										<th>{$t('cache.table.stored')}</th>
										<th>{$t('cache.table.lastUsed')}</th>
									</tr>
								</thead>
								<tbody>
									{#each disk.entries as entry (entry.key)}
										<tr>
											<td class="id" class:na={!entry.queryId} title={entry.queryId ?? undefined}>{displayId(entry)}</td>
											<td class="num">{$formatNumber(entry.rowCount)}</td>
											<td class="num">{formatBytes(entry.byteLength)}</td>
											<td title={formatStamp(entry.createdAt)}>{$formatRelative(entry.createdAt)}</td>
											<td title={formatStamp(entry.lastAccessedAt)}>{$formatRelative(entry.lastAccessedAt)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="empty">{$t('cache.disk.empty')}</p>
					{/if}
				{/if}
			</section>
		</div>
	{/if}

	<div slot="footer" class="footer-actions">
		<Button variant="outline" size="sm" onclick={() => toggleCache()} disabled={loading}>
			{#if cacheEnabled}
				{$t('cache.disable')}
				<DatabaseZapIcon />
			{:else}
				{$t('cache.enable')}
				<DatabaseIcon />
			{/if}
		</Button>
		<Button variant="outline" size="sm" onclick={() => load()} disabled={loading}>
			{$t('common.refresh')}
			<RefreshCwIcon />
		</Button>
		<Button variant="destructive" size="sm" onclick={() => clearAll()} disabled={loading}>
			{$t('cache.clearAll')}
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

	}

	.subtle {
		font-size: 0.8rem;
		color: #6b7280;
	}

	.cache-disabled-note {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		background: #fef3c7;
		color: #92400e;
		font-size: 0.85rem;
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
