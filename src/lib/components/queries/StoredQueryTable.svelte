<script lang="ts">
	/**
	 * The table of a saved-query list or a history list. Each row has an Open
	 * button and a delete button. The modal that holds the table owns the store
	 * and the confirmation.
	 */
	import Button from '@/components/buttons/Button.svelte';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { SQLQueryBuilder } from '@/beacon-api/query';
	import type { StoredQuery } from '@/stores/stored-query';
	import { t, formatDate, formatNumber } from '@/i18n';

	type QueryListKind = 'saved' | 'history';

	let {
		entries,
		kind,
		emptyText,
		deleteTitle,
		onOpen,
		onDelete
	}: {
		entries: StoredQuery[];
		/** A history list shows the last run and the row count. A saved list shows the save time. */
		kind: QueryListKind;
		emptyText: string;
		deleteTitle: string;
		onOpen: (entry: StoredQuery) => void;
		onDelete: (entry: StoredQuery) => void;
	} = $props();

	/** The query as SQL on one line, or an empty string. */
	function sqlLine(entry: StoredQuery): string {
		if (!entry.compiled) return '';

		try {
			return SQLQueryBuilder.toSQL(entry.compiled).replace(/\s+/g, ' ');
		} catch {
			// The SQL export does not know every filter.
			return '';
		}
	}

	/** The time in the date column, or null when the entry has none. */
	function timeOf(entry: StoredQuery): number | null {
		if (kind === 'history') {
			return entry.lastExecutedAt;
		}

		return entry.createdAt;
	}

	function formatTime(ms: number | null): string {
		if (ms === null) return '';
		return $formatDate(new Date(ms), { dateStyle: 'medium', timeStyle: 'short' });
	}

	const timeHeader = $derived.by(() => {
		if (kind === 'history') {
			return $t('queryList.column.lastRun');
		}

		return $t('queryList.column.saved');
	});
</script>

{#if entries.length === 0}
	<p class="empty">{emptyText}</p>
{:else}
	<table class="query-list">
		<thead>
			<tr>
				<th>{$t('common.name')}</th>
				<th>{$t('queryList.column.node')}</th>
				<th>{timeHeader}</th>
				{#if kind === 'history'}
					<th class="num">{$t('queryList.column.rows')}</th>
				{/if}
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each entries as entry (entry.id)}
				{@const sql = sqlLine(entry)}
				<tr>
					<td class="name">
						<div class="query-name" title={entry.name}>{entry.name}</div>
						<div class="query-sql" title={sql}>{sql}</div>
					</td>
					<td>{entry.node.name || entry.node.url}</td>
					<td class="time">{formatTime(timeOf(entry))}</td>
					{#if kind === 'history'}
						<td class="num">{entry.rowCount === null ? '' : $formatNumber(entry.rowCount)}</td>
					{/if}
					<td>
						<div class="row-actions">
							<Button variant="outline" size="sm" onclick={() => onOpen(entry)}>
								{$t('queryList.open')}
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => onDelete(entry)}
								title={deleteTitle}
								aria-label={deleteTitle}
							>
								<Trash2Icon class="delete-icon" />
							</Button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style lang="scss">
	.empty {
		margin: 0;
		color: var(--muted-foreground);
	}

	.query-list {
		width: 100%;
		border-collapse: collapse;

		th,
		td {
			padding: 0.75rem 1rem;
			text-align: left;
			vertical-align: middle;
			white-space: nowrap;
			border-bottom: 1px solid var(--table-border);
		}

		th {
			font-size: var(--font-size-sm);
			font-weight: var(--font-weight-semibold);
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--muted-foreground);
		}

		tbody tr:last-child td {
			border-bottom: none;
		}

		// The name cell takes the free width, so its two lines can end in an ellipsis.
		.name {
			width: 100%;
			max-width: 0;
		}

		.query-name,
		.query-sql {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.query-name {
			font-weight: var(--font-weight-semibold);
		}

		.query-sql {
			margin-top: 0.25rem;
			font-family: var(--font-family-mono);
			font-size: var(--font-size-sm);
			color: var(--muted-foreground);
		}

		.time {
			color: var(--muted-foreground);
		}

		.num {
			text-align: right;
			font-variant-numeric: tabular-nums;
		}

		.row-actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 0.5rem;

			:global(.delete-icon) {
				color: var(--destructive);
			}
		}
	}
</style>
