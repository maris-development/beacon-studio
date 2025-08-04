<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { onMount } from 'svelte';

	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient } from '@/beacon-api/client';
	import AdvancedQueryBuilderBlock from './advanced-query-builder-block.svelte';

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient = $state(null);

	onMount(async () => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		let tables = await client.getTables();
		let default_table = await client.getDefaultTable();

		// By default, select the first table if available
		selected_table_name = default_table;
		table_names = tables;
	});

	let selected_table_name = $state('');
	let table_names = $state<string[]>([]);
</script>

<Label for="dataCollection">Selected Data Table</Label>
<Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
	<Select.Trigger class="w-[180px]">
		{selected_table_name ?? 'Select a table'}
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			<Select.Label>Tables</Select.Label>
			{#each table_names as table_name}
				<Select.Item value={table_name} label={table_name}>
					{table_name}
				</Select.Item>
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>

<AdvancedQueryBuilderBlock table_name={selected_table_name} {client} />
