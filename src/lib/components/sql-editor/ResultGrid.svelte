<script lang="ts">
	import type * as ApacheArrow from 'apache-arrow';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { ApacheArrowUtils } from '@/arrow-utils';
	import { PREVIEW_ROW_LIMIT } from '@/sql/run';
	import type { Column } from '@/util-types';

	let {
		columns,
		types = [],
		rows,
		loading = false
	}: {
		columns: string[];
		types?: unknown[];
		rows: Record<string, unknown>[];
		loading?: boolean;
	} = $props();

	let tableColumns: Column[] = $derived(
		columns.map((key) => ({ key, header: key, sortable: false }))
	);

	let textRows = $derived(
		rows.map((row) => {
			const text: Record<string, string | null> = {};
			columns.forEach((key, index) => {
				const value = row[key];
				if (value === null || value === undefined) {
					text[key] = null;
				} else {
					text[key] = ApacheArrowUtils.typedValueToString(value, types[index] as ApacheArrow.DataType);
				}
			});
			return text;
		})
	);
</script>

<!-- The preview holds at most PREVIEW_ROW_LIMIT rows, so one page shows all of them. -->
<DataTable
	columns={tableColumns}
	rows={textRows}
	totalRows={rows.length}
	pageSize={PREVIEW_ROW_LIMIT}
	isLoading={loading}
	pagination={false}
	size="small"
/>
