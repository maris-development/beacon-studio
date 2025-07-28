<script lang="ts">

    import { page } from '$app/state';
	import { BeaconClient, type Schema, type Field } from '@/beacon-api/client';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
    import { error } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import DataTable, { VirtualPaginationData, type Column } from '$lib/components/data-table.svelte';
	import { Utils } from '@/utils';
	import Cookiecrumb from '@/components/cookiecrumb/cookiecrumb.svelte';

    
    const file = page.url.searchParams.get('file') || '';

    if (!file) {
        throw error(400, 'Missing `file` query parameter');
    }

    let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

    let columns: Column[] = [
        { key: 'name', header: 'Field', sortable: false },
        { key: 'data_type', header: 'Data Type', sortable: false },
        { key: 'nullable', header: 'Nullable', sortable: false },
        { key: 'dict_id', header: 'Dictionary ID', sortable: false },
        { key: 'dict_is_ordered', header: 'Is Ordered', sortable: false },
        { key: 'metadata', header: 'Metadata', sortable: false }
    ];

    let virtualSchemaData: VirtualPaginationData<Field> = new VirtualPaginationData<Field>([]);
	let rows: Field[] = $state([]);
	let totalRows: number = $state(0);
    let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let isLoading = $state(true);
    let pageSize: number = 20;
	let firstLoad = true;
    
	
	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;

		client = BeaconClient.new(currentBeaconInstanceValue);

		getDatasetSchema();
    });

	async function getDatasetSchema() {
        if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

        firstLoad = false;
		isLoading = true;
        
        const schema: Schema|null = await client.getDatasetSchema(file);

        if(schema){
            totalRows = schema.fields.length;
            virtualSchemaData.setData(schema.fields);
            getPage();
        }
    }

    function getPage() {
        offset = (pageIndex - 1) * pageSize;

        const data = virtualSchemaData.getData(offset, pageSize);

        setData(data);

        Utils.setPageUrlParameter(pageIndex);
    }

    function setData(fields: Field[]) {
        rows = fields;

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


        totalRows = virtualSchemaData.filter(function(field: Field) {

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


</script>


<svelte:head>
	<title>Dataset {file} - Beacon Studio</title>
</svelte:head>

<Cookiecrumb crumbs={[{ label: 'Data Browser', href: '/data-browser' }, { label: 'Datasets', href: '/data-browser/datasets' }, { label: `Dataset ${file}`, href: '#' }]} />

<div class="page-container">
	<h1>Dataset {file} ({totalRows} fields)</h1>

    <input type="search" id="search" placeholder="Search..." class="search-input" onchange={onSearchBoxChange} />

    <DataTable
		defaultSort={{ column: 'name', direction: 'asc' }}
		{onPageChange}
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