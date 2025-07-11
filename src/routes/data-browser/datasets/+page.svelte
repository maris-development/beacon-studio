<script lang="ts">
    import { page } from '$app/state';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import { onMount } from 'svelte';
	import DataTable, { VirtualPaginationData, type Column } from '$lib/components/data-table.svelte';
  	import { goto } from '$app/navigation';
	import { Utils } from '@/utils';

	type Dataset = {
		dataset: string;
	};

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	let columns: Column[] = [
		{ key: 'dataset', header: 'Dataset', sortable: false }
	];
    let virtualSchemaData: VirtualPaginationData<Dataset> = new VirtualPaginationData<Dataset>([]);
	let rows: { dataset: string }[] = $state([]);

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let isLoading = $state(true);
	let pageSize: number = 20;
	let firstLoad = true;

	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		getDatasets();
	});

	async function getDatasets() {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		const datasets: string[] = await client.getDatasets();

		if(datasets){
            totalRows = datasets.length;
			virtualSchemaData.setData(datasets.map((dataset) => ({ dataset })));
			getPage();
		}
	}

	
    function getPage() {
        offset = (pageIndex - 1) * pageSize;

        const data = virtualSchemaData.getData(offset, pageSize);
        
        setData(data);

        Utils.setPageUrlParameter(pageIndex);
    }

	
    function setData(datasets: Dataset[]) {
        rows = datasets;

        isLoading = false;
    }

	function onPageChange(page: number) {
		pageIndex = page;

		getPage();
	}

	function onSearchBoxChange() {
        const searchTerm = (document.getElementById('search') as HTMLInputElement).value;

        if(!searchTerm) {
            totalRows = virtualSchemaData.resetFilter();
            getPage();
            return;
        }


        totalRows = virtualSchemaData.filter(function(field: Dataset) {

            for(const [_, value] of Object.entries(field)) {
                if (typeof value === 'string') {
                    return value.toLowerCase()
                        .includes(searchTerm.toLowerCase());
                }
            }

            return false;
        });


        getPage();
    }

	function onCellClick(row: Record<string, any>, column: Column) {
		const filename = row[column.key];

		const url = new URL('/data-browser/dataset-detail', window.location.origin);
		
		url.searchParams.set('file', filename);

		goto(url.toString());
	}

	
	function onChangeSort(column: string, direction: 'asc' | 'desc') {
		console.log('Sorting by', column, 'in', direction, 'order');
	}


</script>

<svelte:head>
	<title>Datasets - Beacon Studio</title>
</svelte:head>

<div class="page-container">
	<h1>Datasets</h1>

	<p>Explore and manage the datasets that are available in your Beacon instance.</p>

	<input type="search" id="search" placeholder="Search..." class="search-input" onchange={onSearchBoxChange} />

	<DataTable
		rowClass="arrow-row"
		defaultSort={{ column: 'dataset', direction: 'asc' }}
		
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
</style>
