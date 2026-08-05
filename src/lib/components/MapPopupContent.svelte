<script lang="ts">
	import { ApacheArrowUtils } from '@/arrow-utils';
	import type { Column, SortDirection } from '@/util-types';
	import { VirtualPaginationData } from '@/utils';
	import { getArrowWorker } from '@/workers/ArrowProcessingWorkerManager';
	import * as ApacheArrow from 'apache-arrow';
	import { onMount } from 'svelte';
	import DataTable from './visualisation/DataTable.svelte';

	let {
		rowData,
		table,
		datasetKey,
		latitudeColumnName,
		longitudeColumnName,
		groupByDecimals = 3 // Default to 3 decimals for grouping
	}: {
		rowData: unknown[];
		table: ApacheArrow.Table;
		datasetKey: string;
		latitudeColumnName: string;
		longitudeColumnName: string;
		groupByDecimals?: number;
	} = $props();

	let columns: Column[] = $state([]);
	let virtualSchemaData: VirtualPaginationData<number[]> = new VirtualPaginationData<number[]>([]);
	let rows: number[][] = $state([]);
	let offset = $state(0);
	let isLoading = $state(true);
	let totalRows: number = $state(0);
	let pageIndex = $state(1);
	let pageSize: number = 10;

	onMount(() => {
		const record = ApacheArrowUtils.arrayToRecord(rowData, table.schema);

		columns = table.schema.fields
			.filter((field) => field.name != 'geometry')
			.map((field) => ({
				key: field.name,
				header: field.name,
				sortable: true
			}));

		const currentLatLon: [number, number] = [
			Number(record[latitudeColumnName]),
			Number(record[longitudeColumnName])
		];

		const otherData = getArrowWorker().findSimilarRowsByLatLon(
			datasetKey,
			table,
			currentLatLon,
			groupByDecimals,
			latitudeColumnName,
			longitudeColumnName,
			1000
		);

		otherData.then((data) => {
			const newData = [rowData, ...data] as number[][];
			virtualSchemaData.setData(newData);
			totalRows = newData.length;
			getPage();
		});
	});

	function getPage() {
		offset = (pageIndex - 1) * pageSize;

		const data = virtualSchemaData.getPageData(offset, pageSize).map((row) => {
			return ApacheArrowUtils.arrayToRecord(row, table.schema);
		});

		setData(data);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function setData(fields: any[]) {
		rows = fields;

		isLoading = false;
	}

	function onPageChange(page: number) {
		pageIndex = page;

		getPage();
	}

	function onChangeSort(column: string, direction: SortDirection) {
		let columnIndex = columns.findIndex((col) => col.key === column);

		virtualSchemaData.orderBy(columnIndex, direction);

		getPage();
	}
</script>

<div class="map-popup-content">
	<DataTable
		{onPageChange}
		{onChangeSort}
		{columns}
		{rows}
		{totalRows}
		{pageSize}
		{pageIndex}
		{isLoading}
		size="small"
	/>
</div>

<style lang="scss">
	.map-popup-content {
		max-width: 50vw;
	}
</style>
