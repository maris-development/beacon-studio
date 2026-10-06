<script lang="ts">
	import { page } from '$app/state';
	import { currentNode, nodes } from '@/services/beacon-node';
	import { BeaconClient } from '@/beacon-api/client';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { goto } from '$app/navigation';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { AffixString } from '@/utils';
	import type { Column } from '@/util-types';
	import { resolve } from '$app/paths';
	import Button from '@/components/buttons/Button.svelte';
	import CreateTableModal from '@/components/modals/CreateTableModal.svelte';
	import NodePicker from '@/components/NodePicker.svelte';
	import AdminAction from '@/components/AdminAction.svelte';

	let selectedNode = $derived($currentNode);
	let client: BeaconClient;

	let columns: Column[] = $state([
		{ key: 'table', header: 'Table', sortable: false, rawHtml: true }
	]);
	let rows: { table: AffixString }[] = $state([]);

	let totalRows: number = $state(0);
	let pageIndex: number = $state(Number(page.url.searchParams.get('page') ?? '1'));
	let pageSize: number = 1000;
	let isLoading = $state(true);
	let firstLoad = true;
	let create_table_modal_open: boolean = $state(false);

	let loadedNodeId: string | null = null;

	$effect(() => {
		if (!selectedNode || selectedNode.id === loadedNodeId) return;
		loadedNodeId = selectedNode.id;

		client = BeaconClient.new(selectedNode);
		pageIndex = 1;

		firstLoad = true; // let getTables() run again despite the isLoading guard
		onAsyncMount();
	});

	async function onAsyncMount() {
		await getTables(pageIndex);

		await getDefaultTable();
	}

	function onChangeSort(column: string, direction: 'asc' | 'desc') {
		console.warn('[NOT IMPLEMENTED] Sorting by', column, 'in', direction, 'order');
	}

	function onPageChange(page: number) {
		pageIndex = page;

		getTables(page);
	}

	async function getTables(page: number) {
		if (isLoading && !firstLoad) return; // prevent multiple requests at once, might break pagination etc.

		firstLoad = false;
		isLoading = true;

		let results = await client.getTables();

		rows = results.map((table) => ({ table: new AffixString(table) }));

		totalRows = rows.length;
		pageIndex = page;

		isLoading = false;
	}

	async function getDefaultTable() {
		const defaultTable = await client.getDefaultTable();

		// console.log('Default table:', defaultTable);

		if (defaultTable) {
			const _rows = [...rows];

			let idx = _rows.findIndex((row) => row.table.main === defaultTable);

			if (_rows[idx]) {
				_rows[idx].table.suffix = ` <span class="default-label">Default</span>`;
			}

			rows = _rows;

			// console.log('Updated rows:', rows);
		}
	}

	function onCellClick(row: { table: AffixString }) {
		if (!selectedNode) return;

		const filename = row.table;

		const url = new URL(resolve('/data-browser/data-tables/detail'), window.location.origin);

		url.searchParams.set('table_name', filename.main);
		url.searchParams.set('node', selectedNode.url);

		goto(url.toString());
	}
</script>

<svelte:head>
	<title>Data Tables - Beacon Studio</title>
</svelte:head>

<Cookiecrumb
	crumbs={[
		{ label: 'Data Browser', href: resolve('/data-browser') },
		{ label: 'Data tables', href: resolve('/data-browser/data-tables') }
	]}
/>
<div class="page-wrapper">
	<div class="page-container">
		<h1>Data Tables</h1>

		<p>Explore and manage the tables that are available in your Beacon node.</p>

		<NodePicker>
			{#snippet actions()}
				{#if $nodes.length > 0}
					<AdminAction>
						{#snippet children({ disabled })}
							<Button {disabled} variant="outline" onclick={() => (create_table_modal_open = true)}>
								Create Table
							</Button>
						{/snippet}
					</AdminAction>
				{/if}
			{/snippet}
		</NodePicker>

		{#if $nodes.length === 0}
			<p>
				No saved Beacon nodes yet. Please add a Beacon node on the Beacon Nodes page to browse data
				tables.
			</p>
		{:else}
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

			{#if create_table_modal_open}
				<CreateTableModal onCancel={() => (create_table_modal_open = false)} node={selectedNode} />
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

	div.page-container :global(td span.default-label) {
		font-size: 0.8em;
		padding: 0.2em 0.4em;
		border-radius: 4px;
		margin-left: 0.5em;
		background-color: var(--primary);
		color: var(--primary-foreground);
	}
</style>
