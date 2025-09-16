<script lang="ts">
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import type { TableDefinition } from '@/beacon-api/types';
	import { onMount } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import EasyQueryBuilder from './easy-query-builder.svelte';

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;
	let selected_table_name = $state('');
	let easy_tables = $state<Array<TableDefinition>>([]);

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		let preset_tables = await client.getPresetTables();

		easy_tables = preset_tables;

		// By default, select the first table if available
		if (easy_tables.length > 0) {
			selected_table_name = easy_tables[0].table_name;
		}
	});
</script>

<div id="easy-query-builder">
	<h4>Select Data Collection</h4>
	<Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
		<Select.Trigger>
			{selected_table_name ?? 'Select a table'}
		</Select.Trigger>
		<Select.Content>
			<Select.Group>
				<Select.Label>Tables</Select.Label>
				{#each easy_tables as table (table.table_name)}
					<Select.Item value={table.table_name} label={table.table_name}>
						{table.table_name}
					</Select.Item>
				{/each}
			</Select.Group>
		</Select.Content>
	</Select.Root>
	<svelte:boundary>
		<EasyQueryBuilder {selected_table_name} />

		{#snippet pending()}
			<p>loading...</p>
		{/snippet}
	</svelte:boundary>
</div>

<style lang="scss">
	#easy-query-builder {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>
