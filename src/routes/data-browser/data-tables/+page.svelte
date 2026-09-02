<script lang="ts">
	import { page } from '$app/state';
	import { instances } from '@/services/beacon-instance';
	import { ensureFresh } from '@/services/beacon-instance-connect';
	import { BeaconClient } from '@/beacon-api/client';
	import DataTable from '@/components/visualisation/DataTable.svelte';
	import { goto } from '$app/navigation';
	import Cookiecrumb from '@/components/cookiecrumb/CookieCrumb.svelte';
	import { AffixString } from '@/utils';
	import type { Column } from '@/util-types';
	import { resolve } from '$app/paths';
	import Button from '@/components/buttons/Button.svelte';
	import CreateTableModal from '@/components/modals/CreateTableModal.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import BeaconInstanceStatus from '@/components/BeaconInstanceStatus.svelte';
	import { persisted } from 'svelte-local-storage-store';

	let selectedInstanceId = persisted<string | null>('data-browser-data-tables-instance-id', null);
	let selectedInstance = $derived(
		$instances.find((instance) => instance.id === $selectedInstanceId) ?? $instances[0] ?? null
	);
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

	let loadedInstanceId: string | null = null;

	$effect(() => {
		if (!selectedInstance || selectedInstance.id === loadedInstanceId) return;
		loadedInstanceId = selectedInstance.id;

		// Persist a fallback pick (e.g. first instance) the same as an explicit one.
		if ($selectedInstanceId !== selectedInstance.id) selectedInstanceId.set(selectedInstance.id);

		client = BeaconClient.new(selectedInstance);
		pageIndex = 1;

		firstLoad = true; // let getTables() run again despite the isLoading guard
		onAsyncMount();
	});

	// Show a true status dot for the picker. `ensureFresh` skips a check that is
	// not due, so this costs nothing on a second visit.
	$effect(() => {
		for (const instance of $instances) void ensureFresh(instance);
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

	function onCellClick(row: Record<string, string|AffixString>, column: Column) {
		const filename = row[column.key] as AffixString;

		const url = new URL(resolve('/data-browser/table-detail'), window.location.origin);

		url.searchParams.set('table_name', filename.main);

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

		<p>Explore and manage the tables that are available in your Beacon instance.</p>

		<div class="mb-4 flex items-center gap-2 instance-picker">
			<Select.Root
				type="single"
				name="beaconInstance"
				value={selectedInstance?.id ?? ''}
				onValueChange={(id) => selectedInstanceId.set(id)}
			>
				<Select.Trigger class="instance-select-trigger">
					{selectedInstance?.name ?? 'Select an instance'}
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						<Select.Label>Instances</Select.Label>
						{#each $instances as instance (instance.id)}
							<Select.Item value={instance.id} label={instance.name}>
								{instance.name}
							</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>

			{#if selectedInstance}
				<BeaconInstanceStatus health={selectedInstance} variant="dot" />
			{/if}
		</div>

		{#if $instances.length === 0}
			<p>No saved Beacon instances yet. Add one from the sidebar to browse data tables.</p>
		{:else}
			<div class="mb-4 flex items-center justify-end">
				<Button variant="outline" onclick={() => (create_table_modal_open = true)}
					>Create Table</Button
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

			{#if create_table_modal_open}
				<CreateTableModal
					onCancel={() => (create_table_modal_open = false)}
					instance={selectedInstance}
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

	div.page-container :global(td span.default-label) {
		font-size: 0.8em;
		padding: 0.2em 0.4em;
		border-radius: 4px;
		margin-left: 0.5em;
		background-color: var(--primary);
		color: var(--primary-foreground);
	}
</style>
