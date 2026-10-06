<script lang="ts">
	import { page } from '$app/state';
	import { track } from '@/telemetry';
	import { currentNode, nodes } from '@/services/beacon-node';
	import { BeaconClient } from '@/beacon-api/client';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { Utils, VirtualPaginationData } from '@/utils';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import type { Column } from '@/util-types';
	import { resolve } from '$app/paths';
	import Button from '@/components/buttons/Button.svelte';
	import UploadDatasetsModal from '@/components/modals/UploadDatasetsModal.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';
	import { Input } from '@/components/ui/input';

	type Dataset = {
		dataset: string;
	};

	let selectedNode = $derived($currentNode);
	let client: BeaconClient;

	let columns: Column[] = $state([{ key: 'dataset', header: 'Dataset', sortable: false }]);
	let virtualSchemaData: VirtualPaginationData<Dataset> = new VirtualPaginationData<Dataset>([]);
	let rows: { dataset: string }[] = $state([]);
	let upload_files_modal_open: boolean = $state(false);

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let offset = $state(0);
	let isLoading = $state(true);
	let pageSize: number = 20;
	let firstLoad = true;

	let loadedNodeId: string | null = null;

	$effect(() => {
		if (!selectedNode || selectedNode.id === loadedNodeId) return;
		loadedNodeId = selectedNode.id;

		client = BeaconClient.new(selectedNode);
		pageIndex = 1;
		virtualSchemaData.resetFilter();

		const searchInput = document.getElementById('search') as HTMLInputElement | null;
		if (searchInput) searchInput.value = '';

		firstLoad = true; // let getDatasets() run again despite the isLoading guard
		getDatasets();
	});

	async function getDatasets() {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		const datasets: string[] = await client.getDatasets();

		if (datasets) {
			totalRows = datasets.length;
			virtualSchemaData.setData(datasets.map((dataset) => ({ dataset })));
			getPage();
		}
	}

	function getPage() {
		offset = (pageIndex - 1) * pageSize;

		const data = virtualSchemaData.getPageData(offset, pageSize);

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

		if (!searchTerm) {
			totalRows = virtualSchemaData.resetFilter();
			getPage();
			return;
		}

		totalRows = virtualSchemaData.filter(function (field: Dataset) {
			for (const value of Object.values(field)) {
				if (typeof value === 'string') {
					return value.toLowerCase().includes(searchTerm.toLowerCase());
				}
			}

			return false;
		});

		track('browser.search', {
			props: { scope: 'datasets', term: searchTerm.slice(0, 60), results: totalRows }
		});

		getPage();
	}

	function onCellClick(row: { dataset: string }) {
		if (!selectedNode) return;

		const filename = row.dataset;

		const url = new URL(resolve('/data-browser/datasets/detail'), window.location.origin);

		url.searchParams.set('file', filename);
		url.searchParams.set('node', selectedNode.url);

		goto(url.toString());
	}

	function onChangeSort(column: string, direction: 'asc' | 'desc') {
		console.warn('[NOT IMPLEMENTED] Sorting by', column, 'in', direction, 'order');
	}
</script>

<svelte:head>
	<title>Datasets - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Datasets', href: resolve('/data-browser/datasets') }
	]}
/>

<div class="page-wrapper">
	<div class="page-container">
		<h1>Datasets</h1>

		<p>Explore and manage the datasets that are available in your Beacon node.</p>

		<NodePicker />

		{#if $nodes.length === 0}
			<p>
				No saved Beacon nodes yet. Please add a Beacon node on the Beacon Nodes page to browse
				datasets.
			</p>
		{:else}
			<div class="table-header-row">
				<Input
					type="search"
					id="search"
					placeholder="Search..."
					class="search-input"
					onchange={onSearchBoxChange}
				/>

				<AdminAction>
					{#snippet children({ disabled })}
						<Button {disabled} variant="outline" onclick={() => (upload_files_modal_open = true)}>
							Upload Datasets
						</Button>
					{/snippet}
				</AdminAction>
			</div>

			<DataTable
				rowClass="arrow-row"
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

			{#if upload_files_modal_open}
				<UploadDatasetsModal
					onCancel={() => (upload_files_modal_open = false)}
					node={selectedNode}
				/>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	div.table-header-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	div.page-container :global(tr.arrow-row) {
		position: relative;

		cursor: pointer;

		&::after {
			content: '';
			position: absolute;
			top: 50%;
			right: 1rem;
			width: 1em;
			height: 1em;
			transform: translateY(-50%);

			mask: url('/icons/arrow-right.svg') no-repeat center/contain;
			background-color: currentColor;
		}
	}
</style>
