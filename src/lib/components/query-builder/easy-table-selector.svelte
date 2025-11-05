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
	// let easy_tables = $state<Array<TableDefinition>>([]);
	let easy_table_names = $state<Array<string>>([]);

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		easy_table_names = (await client.getTables()).filter((tableName => tableName.startsWith('easy')));


		// By default, select the first table if available
		if (easy_table_names.length > 0) {
			selected_table_name = easy_table_names[0];
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
				{#each easy_table_names as table_name}
					<Select.Item value={table_name} label={table_name}>
						{table_name}
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
