<!-- Columns of a table or a file: name, type, nullable. A filter, and 500 at a time. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Input } from '@/components/ui/input';
	import { COLUMN_PAGE_SIZE, stringifyType } from '@/sql/catalog';
	import { sqlErrorMessage } from '@/sql/statement';

	type Row = { name: string; dataType: string; nullable: string };

	let {
		load,
		onFilter
	}: {
		load: () => Promise<unknown>;
		onFilter?: (term: string, results: number) => void;
	} = $props();

	let rows: Row[] = $state([]);
	let loading = $state(true);
	let error = $state('');
	let needle = $state('');
	let shown = $state(COLUMN_PAGE_SIZE);

	// The raw Arrow fields also hold `nullable`, which `parseSchema` leaves out.
	function toRows(schema: unknown): Row[] {
		const fields = (schema as { fields?: unknown })?.fields;
		if (!Array.isArray(fields)) return [];

		return fields
			.filter((field) => field && typeof field.name === 'string')
			.map((field) => {
				let nullable = '';
				if (field.nullable === true) nullable = 'yes';
				if (field.nullable === false) nullable = 'no';

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
			error = sqlErrorMessage(caught);
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
	<p class="muted">Loading the columns...</p>
{:else if error}
	<p class="error">{error}</p>
{:else}
	<div class="head">
		<Input type="search" placeholder="Filter columns" bind:value={needle} onchange={onChange} />
		<span class="muted">{matches.length} of {rows.length} columns</span>
	</div>

	<table class="schema">
		<thead>
			<tr><th>Column</th><th>Type</th><th>Nullable</th></tr>
		</thead>
		<tbody>
			{#each matches.slice(0, shown) as row (row.name)}
				<tr>
					<td>{row.name}</td>
					<td class="type">{row.dataType}</td>
					<td>{row.nullable}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if matches.length > shown}
		<button type="button" class="more" onclick={() => (shown += COLUMN_PAGE_SIZE)}>
			Show more ({matches.length - shown} left)
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
		font-size: 0.875rem;

		th,
		td {
			padding: 0.375rem 0.5rem;
			border-bottom: 1px solid var(--border);
			text-align: left;
		}
	}

	.type {
		font-family: monospace;
		font-size: 0.8125rem;
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
