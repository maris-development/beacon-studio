<script lang="ts">
	import { ApacheArrowUtils } from '@/arrow-utils';
	import type { Column, SortDirection } from '@/util-types';
	import { VirtualPaginationData } from '@/utils';
	import { ArrowProcessingWorkerManagager } from '@/workers/ArrowProcessingWorkerManagager';
	import * as ApacheArrow from 'apache-arrow';
	import { onDestroy, onMount } from 'svelte';
	import DataTable from './data-table.svelte';

	let {
		rowData,
		table,
		latitudeColumnName,
		longitudeColumnName,
		groupByDecimals = 3 // Default to 3 decimals for grouping
	}: {
		rowData: unknown[];
		table: ApacheArrow.Table;
		latitudeColumnName: string;
		longitudeColumnName: string;
		groupByDecimals?: number;
	} = $props();

	let arrowWorker: ArrowProcessingWorkerManagager;
	let columns: Column[] = $state([]);
	let virtualSchemaData: VirtualPaginationData<number[]> = new VirtualPaginationData<number[]>([]);
	let rows: number[][] = $state([]);
	let offset = $state(0);
	let isLoading = $state(true);
	let totalRows: number = $state(0);
	let pageIndex = $state(1);
	let pageSize: number = 10;

	onMount(() => {
		arrowWorker = new ArrowProcessingWorkerManagager();

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

		const otherData = arrowWorker.findSimilarRowsByLatLon(
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

	onDestroy(() => {
		console.log('onDestroy called for MapPopupContent');
		arrowWorker.terminate();
	});

	function getPage() {
		offset = (pageIndex - 1) * pageSize;

		const data = virtualSchemaData.getPageData(offset, pageSize).map((row) => {
			return ApacheArrowUtils.arrayToRecord(row, table.schema);
		});

		setData(data);
	}

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
	/>
</div>

<style lang="scss">

</style>
