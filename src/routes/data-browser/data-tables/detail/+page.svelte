<script lang="ts">

    import { page } from '$app/state';
	import { BeaconClient } from '@/beacon-api/client';
	import { findByUrl } from '@/services/beacon-node';
    import { error } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { track } from '@/telemetry';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { Utils, VirtualPaginationData } from '@/utils';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import type { SchemaField, Schema } from '@/beacon-api/types';
	import type { Column, SortDirection } from '@/util-types';
    import { resolve } from '$app/paths';
	import { Input } from '@/components/ui/input';
	import { t, translate, type MessageKey } from '@/i18n';
    
    const tableName = page.url.searchParams.get('table_name') || '';

    if (!tableName) {
        throw error(400, translate('browser.error.missingParam', { name: 'table_name' }));
    }

    // The node URL, and not its id. An id exists in one browser only, so a
    // shared link must name the node itself.
    const nodeUrl = page.url.searchParams.get('node') || '';

    if (!nodeUrl) {
        throw error(400, translate('browser.error.missingParam', { name: 'node' }));
    }

	let client: BeaconClient;

	const SCHEMA_HEADERS: Record<string, MessageKey> = {
		name: 'browser.schema.field',
		data_type: 'browser.schema.dataType',
		nullable: 'browser.schema.nullable',
		dict_id: 'browser.schema.dictId',
		dict_is_ordered: 'browser.schema.isOrdered',
		metadata: 'browser.schema.metadata'
	};

    let columns: Column[] = $state([
        { key: 'name', header: '', sortable: true },
        { key: 'data_type', header: '', sortable: true },
        { key: 'nullable', header: '', sortable: true },
        { key: 'dict_id', header: '', sortable: true },
        { key: 'dict_is_ordered', header: '', sortable: true },
        { key: 'metadata', header: '', sortable: false }
    ]);

	// The headers follow the language. The objects stay, so the sort state stays.
	$effect.pre(() => {
		for (const column of columns) column.header = $t(SCHEMA_HEADERS[column.key]);
	});
    let virtualSchemaData: VirtualPaginationData<SchemaField> = new VirtualPaginationData<SchemaField>([]);
	let rows: SchemaField[] = $state([]);

	let totalRows: number = $state(0);
    let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let isLoading = $state(true);
    let pageSize: number = 20;
	let firstLoad = true;
    
	onMount(() => {
		// A receiver without this node still reads it, over a client with no token.
		const saved = findByUrl(nodeUrl);

		if (saved) {
			client = BeaconClient.new(saved);
		} else {
			client = new BeaconClient(nodeUrl);
		}

		track('browser.table.open', { nodeHost: nodeUrl, props: { table: tableName } });

		getTableSchemaData();
    });

    async function getTableSchemaData(){
        if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

        const schema: Schema|null = await client.getTableSchema(tableName);

        if(schema){
            totalRows = schema.fields.length;
            virtualSchemaData.setData(schema.fields);
            getPage();
        }
    }

    function getPage() {
        offset = (pageIndex - 1) * pageSize;

        const data = virtualSchemaData.getPageData(offset, pageSize);
        
        setData(data);

        Utils.setPageUrlParameter(pageIndex);
    }

    function setData(fields: SchemaField[]) {
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


        totalRows = virtualSchemaData.filter(function(field: SchemaField) {

            for (const value of Object.values(field)) {                
                if (typeof value === 'string') {
                    return value.toLowerCase()
                        .includes(searchTerm.toLowerCase());
                }
            }

            return false;
        });

        track('browser.search', { props: { scope: 'table-fields', term: searchTerm.slice(0, 60), results: totalRows } });


        getPage();
    }

	function onChangeSort(column: keyof SchemaField, direction: SortDirection) {

		virtualSchemaData.orderBy(column, direction);

		getPage();
	}

</script>


<svelte:head>
	<title>{$t('app.pageTitle', { page: $t('browser.table.title', { name: tableName }) })}</title>
</svelte:head>

<Cookiecrumb crumbs={[
    { label: $t('nav.item.dataBrowser'), href: resolve('/data-browser') }, 
    { label: $t('nav.item.dataTables'), href: resolve('/data-browser/data-tables') }, 
    { label: $t('browser.table.title', { name: tableName }), href: '' }]} 
/>

<div class="page-wrapper">
    <div class="page-container">
        <h1>{$t('browser.table.heading', { name: tableName, count: totalRows })}</h1>

        <p class="node-line">{$t('browser.nodeLine', { url: nodeUrl })}</p>

        <Input type="search" id="search" placeholder={$t('browser.searchPlaceholder')} class="search-input" onchange={onSearchBoxChange} />

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
</div>

<style lang="scss">
    :global(.search-input) {
        margin-bottom: 0.5rem;
    }
    p.node-line {
        margin-bottom: 1rem;

        color: var(--muted-foreground);
    }
</style>