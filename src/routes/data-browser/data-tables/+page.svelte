<script lang="ts">
	import { page } from '$app/state';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { onMount } from 'svelte';
	import DataTable, { AffixString, type Column } from '$lib/components/data-table.svelte';
  	import { goto } from '$app/navigation';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';

	

	let columns: Column[] = [{ key: 'table', header: 'Table', sortable: false, rawHtml: true }];
	let rows: { table: AffixString }[] = $state([]);

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = 0;
	let pageSize: number = 1000;
	let isLoading = $state(true);
	let firstLoad = true;

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	
	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		onAsyncMount();

		return () => {};
	});

	async function onAsyncMount() {
		await getTables(pageIndex);

		await getDefaultTable();
	}
	
	function onChangeSort(column: string, direction: 'asc' | 'desc') {
		console.log('Sorting by', column, 'in', direction, 'order');
	}

	function onPageChange(page: number) {
		pageIndex = page;

		getTables(page);
	}


	async function getTables(page: number) {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		offset = (page - 1) * pageSize;
		let results = await client.getTables();

		rows = results.map((table) => ({table: new AffixString(table)}));

		totalRows = rows.length;
		pageIndex = page;

		isLoading = false;
	}

	async function getDefaultTable() {
		const defaultTable = await client.getDefaultTable();

		console.log('Default table:', defaultTable);

		if (defaultTable) {
			const _rows = [...rows];

			let idx = _rows.findIndex((row) => row.table.main === defaultTable);

			if(_rows[idx]) {
				_rows[idx].table.suffix = ` <span class="default-label">Default</span>`;
			}

			rows = _rows;

			console.log('Updated rows:', rows);
			
		}
	}

	function onCellClick(row: Record<string, AffixString>, column: Column) {
		const filename = row[column.key];

		const url = new URL('/data-browser/table-detail', window.location.origin);

		url.searchParams.set('table_name', filename.main);

		goto(url.toString());
	}

</script>

<svelte:head>
	<title>Data Tables - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Data Browser', href: '/data-browser' }, { label: 'Data tables', href: '/data-browser/data-tables' }]} />

<div class="page-container">
	<h1>Data Tables</h1>

	<p>Explore and manage the tables that are available in your Beacon instance.</p>

	<DataTable
		rowClass="arrow-row"
		defaultSort={{ column: 'table', direction: 'asc' }}
		
		{onChangeSort}
		{onPageChange}
		{onCellClick}
		
		{columns}
		{rows}
		{totalRows}
		{pageSize}
		{pageIndex}
		{isLoading}
	/>
	
</div>


<style lang="scss">
	div.page-container :global(tr.arrow-row) {
		position: relative;

		cursor: pointer;

		&::after {
			content: '';
			position: absolute;
			top: 50%; right: 1rem;
			width: 1em; height: 1em;
			transform: translateY(-50%);

			mask: url('/icons/arrow-right.svg') no-repeat center/contain;
			background-color: currentColor;
		}
	}

	div.page-container :global(td span.default-label)  {

		font-size: 0.8em;
		padding: 0.2em 0.4em;
		border-radius: 4px;
		margin-left: 0.5em;
		background-color: var(--primary);
		color: var(--primary-foreground);

	}
</style>