<!-- The first rows of a table or file. It runs when it mounts, so a tab loads it on open. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { QueryInput } from '@maris-development/beacon-client';
	import ResultGrid from '@/components/sql-editor/ResultGrid.svelte';
	import { DETAIL_PREVIEW_ROWS } from '@/data-browser/tables';
	import { runPreview, type BatchSource, type PreviewResult } from '@/sql/run';
	import { sqlError } from '@/sql/statement';
	import { t, type Message } from '@/i18n';

	let { source, query }: { source: BatchSource; query: QueryInput } = $props();

	let result: PreviewResult | null = $state(null);
	let error: Message | null = $state(null);

	onMount(() => {
		const controller = new AbortController();

		runPreview(source, query, { signal: controller.signal, limit: DETAIL_PREVIEW_ROWS }).then(
			(value) => (result = value),
			(caught) => (error = sqlError(caught))
		);

		return () => controller.abort();
	});
</script>

{#if error}
	<p class="error">{$t(error)}</p>
{:else if !result}
	<p class="muted">{$t('dataBrowser.common.preview.loading', { count: DETAIL_PREVIEW_ROWS })}</p>
{:else if result.rows.length === 0}
	<p class="muted">{$t('dataBrowser.common.preview.none')}</p>
{:else}
	<p class="muted">{$t('dataBrowser.common.preview.first', { count: result.rows.length })}</p>
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
