<!-- Columns of a table or a file: name, type, nullable. A filter, and 500 at a time. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Input } from '@/components/ui/input';
	import { COLUMN_PAGE_SIZE, stringifyType } from '@/sql/catalog';
	import { sqlError } from '@/sql/statement';
	import { t, type Message } from '@/i18n';

	// `nullable` is null when the field does not say.
	type Row = { name: string; dataType: string; nullable: boolean | null };

	let {
		load,
		onFilter
	}: {
		load: () => Promise<unknown>;
		onFilter?: (term: string, results: number) => void;
	} = $props();

	let rows: Row[] = $state([]);
	let loading = $state(true);
	let error: Message | null = $state(null);
	let needle = $state('');
	let shown = $state(COLUMN_PAGE_SIZE);

	// The raw Arrow fields also hold `nullable`, which `parseSchema` leaves out.
	function toRows(schema: unknown): Row[] {
		const fields = (schema as { fields?: unknown })?.fields;
		if (!Array.isArray(fields)) return [];

		return fields
			.filter((field) => field && typeof field.name === 'string')
			.map((field) => {
				let nullable: boolean | null = null;
				if (typeof field.nullable === 'boolean') nullable = field.nullable;

				return {
					name: field.name,
					dataType: stringifyType(field.data_type ?? field.type),
					nullable
				};
			});
	}

	onMount(async () => {
		try {
			rows = toRows(await load());
		} catch (caught) {
			error = sqlError(caught);
		} finally {
			loading = false;
		}
	});

	let matches = $derived.by(() => {
		const query = needle.trim().toLowerCase();
		if (!query) return rows;
		return rows.filter((row) => row.name.toLowerCase().includes(query));
	});

	function onChange() {
		if (needle.trim() !== '') onFilter?.(needle.trim(), matches.length);
	}
</script>

{#if loading}
	<p class="muted">{$t('dataBrowser.common.schema.loading')}</p>
{:else if error}
	<p class="error">{$t(error)}</p>
{:else}
	<div class="head">
		<Input
			type="search"
			placeholder={$t('dataBrowser.common.schema.filter')}
			bind:value={needle}
			onchange={onChange}
		/>
		<span class="muted">
			{$t('dataBrowser.common.schema.count', { shown: matches.length, total: rows.length })}
		</span>
	</div>

	<table class="schema">
		<thead>
			<tr>
				<th>{$t('dataBrowser.common.schema.column')}</th>
				<th>{$t('dataBrowser.common.schema.type')}</th>
				<th>{$t('dataBrowser.common.schema.nullable')}</th>
			</tr>
		</thead>
		<tbody>
			{#each matches.slice(0, shown) as row (row.name)}
				<tr>
					<td>{row.name}</td>
					<td class="type">{row.dataType}</td>
					<td>
						{#if row.nullable === true}
							{$t('dataBrowser.common.schema.yes')}
						{:else if row.nullable === false}
							{$t('dataBrowser.common.schema.no')}
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if matches.length > shown}
		<button type="button" class="more" onclick={() => (shown += COLUMN_PAGE_SIZE)}>
			{$t('dataBrowser.common.schema.showMore', { count: matches.length - shown })}
		</button>
	{/if}
{/if}

<style lang="scss">
	.head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;

		span {
			white-space: nowrap;
		}
	}

	.schema {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);

		th,
		td {
			padding: 0.375rem 0.5rem;
			border-bottom: 1px solid var(--border);
			text-align: left;
		}
	}

	.type {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
	}

	.more {
		margin-top: 0.5rem;
		border: 0;
		background: none;
		color: var(--muted-foreground);
		text-decoration: underline;
		cursor: pointer;
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
