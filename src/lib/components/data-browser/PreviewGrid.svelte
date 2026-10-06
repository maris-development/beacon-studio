<!-- The first rows of a table or file. It runs when it mounts, so a tab loads it on open. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { QueryInput } from '@maris-development/beacon-client';
	import ResultGrid from '@/components/sql-editor/ResultGrid.svelte';
	import { DETAIL_PREVIEW_ROWS } from '@/data-browser/tables';
	import { runPreview, type BatchSource, type PreviewResult } from '@/sql/run';
	import { sqlErrorMessage } from '@/sql/statement';

	let { source, query }: { source: BatchSource; query: QueryInput } = $props();

	let result: PreviewResult | null = $state(null);
	let error = $state('');

	onMount(() => {
		const controller = new AbortController();

		runPreview(source, query, { signal: controller.signal, limit: DETAIL_PREVIEW_ROWS }).then(
			(value) => (result = value),
			(caught) => (error = sqlErrorMessage(caught))
		);

		return () => controller.abort();
	});
</script>

{#if error}
	<p class="error">{error}</p>
{:else if !result}
	<p class="muted">Loading the first {DETAIL_PREVIEW_ROWS} rows...</p>
{:else if result.rows.length === 0}
	<p class="muted">No rows.</p>
{:else}
	<p class="muted">First {result.rows.length} rows.</p>
	<ResultGrid columns={result.columns} types={result.types} rows={result.rows} />
{/if}

<style lang="scss">
	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive);
	}
</style>
