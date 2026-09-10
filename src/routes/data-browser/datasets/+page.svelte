<script lang="ts">
	import { page } from '$app/state';
	import { nodes } from '@/services/beacon-node';
	import { ensureFresh } from '@/services/beacon-node-connect';
	import { BeaconClient } from '@/beacon-api/client';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { Utils, VirtualPaginationData } from '@/utils';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import type { Column } from '@/util-types';
	import { resolve } from '$app/paths';
	import Button from '@/components/buttons/Button.svelte';
	import UploadDatasetsModal from '@/components/modals/UploadDatasetsModal.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import BeaconNodeStatus from '@/components/BeaconNodeStatus.svelte';
	import { dataBrowserNodeId } from '@/stores/data-browser-node';

	type Dataset = {
		dataset: string;
	};

	let selectedNodeId = dataBrowserNodeId;
	let selectedNode = $derived(
		$nodes.find((node) => node.id === $selectedNodeId) ?? $nodes[0] ?? null
	);
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

		// Persist a fallback pick (e.g. first node) the same as an explicit one.
		if ($selectedNodeId !== selectedNode.id) selectedNodeId.set(selectedNode.id);

		client = BeaconClient.new(selectedNode);
		pageIndex = 1;
		virtualSchemaData.resetFilter();

		const searchInput = document.getElementById('search') as HTMLInputElement | null;
		if (searchInput) searchInput.value = '';

		firstLoad = true; // let getDatasets() run again despite the isLoading guard
		getDatasets();
	});

	// Show a true status dot for the picker. `ensureFresh` skips a check that is
	// not due, so this costs nothing on a second visit.
	$effect(() => {
		for (const node of $nodes) void ensureFresh(node);
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

		getPage();
	}

	function onCellClick(row: Record<string, string>, column: Column) {
		const filename = row[column.key];

		const url = new URL(resolve('/data-browser/dataset-detail'), window.location.origin);

		url.searchParams.set('file', filename);

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

		<div class="mb-4 flex items-center gap-2 node-picker">
			<Select.Root
				type="single"
				name="beaconNode"
				value={selectedNode?.id ?? ''}
				onValueChange={(id) => selectedNodeId.set(id)}
			>
				<Select.Trigger class="node-select-trigger">
					{selectedNode?.name ?? 'Select a node'}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Label>Nodes</Select.Label>
						{#each $nodes as node (node.id)}
							<Select.Item value={node.id} label={node.name}>
								{node.name}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>

			{#if selectedNode}
				<BeaconNodeStatus health={selectedNode} variant="dot" />
			{/if}
		</div>

		{#if $nodes.length === 0}
			<p>No saved Beacon nodes yet. Please add a Beacon node on the Beacon Nodes page to browse datasets.</p>
		{:else}
			<div class="mb-4 flex items-center justify-between">
				<input
					type="search"
					id="search"
					placeholder="Search..."
					class="search-input"
					onchange={onSearchBoxChange}
				/>
				<Button
					onclick={() => {
						upload_files_modal_open = true;
					}}
					variant="outline">Upload Datasets</Button
				>
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
