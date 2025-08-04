<script lang="ts">
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { onMount } from 'svelte';
	import { BeaconClient } from '@/beacon-api/client';
	import type { DataType } from '@/beacon-api/models/misc';
	import { util } from 'apache-arrow';
	import { Utils } from '@/utils';
	import type { RangeFilterColumn } from '@/beacon-api/models/preset_table';
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import AdvancedParameter from './advanced-parameter.svelte';

	let {
		table_name,
		client
	}: {
		table_name: string;
		client: BeaconClient;
	} = $props();

	const output_formats = ['Parquet', 'CSV', 'JSON', 'Arrow', 'NetCDF'];

	let selected_output_format = $state(output_formats[0]);
	let fields: { name: string; type: DataType }[] = $state([]);
	let selected_fields: { name: string; type: DataType }[] = $state([]);

	$effect(() => {
		if (table_name && client) {
			client.getTableSchema(table_name).then((schema) => {
				fields = schema.fields.map((field) => {
					return {
						name: field.name,
						type: field.data_type
					};
				});
			});
		} else {
			fields = []; // Reset fields if no table or client is available
		}
	});

	let open = $state(false);
</script>

<!-- <svelte:document onkeydown={handleKeydown} /> -->
<div class="flex flex-row justify-between">
	<h4>Query Parameters</h4>
	<Button variant="outline" size="sm" class="w-fit" onclick={() => (open = true)}>
		<PlusIcon class="mr-2 size-4" />
		<span>Add Parameter</span>
	</Button>
</div>
<Command.Dialog bind:open>
	<Command.Input placeholder="Type a command or search..." />
	<Command.List>
		<Command.Empty>No columns found.</Command.Empty>
		<Command.Group heading="Available Columns">
			{#each fields as field (field.name)}
				<Command.Item
					value={field.name}
					onclick={() => {
						console.log('Selected field:', field.name);
						selected_fields.push({ name: field.name, type: field.type });
						open = false;
						console.log('Selected fields:', selected_fields);
					}}
				>
					<span class="font-semibold">{field.name}</span>
					<span class="text-muted-foreground text-sm">{field.type}</span>
				</Command.Item>
			{/each}
		</Command.Group>
		<Command.Separator />
	</Command.List>
</Command.Dialog>

<div class="flex flex-col gap-2">
	<Label for="dataCollection">Selected Fields</Label>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
		{#each selected_fields as field (field.name)}
			<AdvancedParameter column={field} />
		{/each}
	</div>
</div>

<Label for="dataCollection">Selected Output Format</Label>
<Select.Root type="single" name="dataCollection" bind:value={selected_output_format}>
	<Select.Trigger class="w-[180px]">
		{selected_output_format}
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			<Select.Label>Tables</Select.Label>
			{#each output_formats as format (format)}
				<Select.Item value={format} label={format}>
					{format}
				</Select.Item>
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>

<div class="flex flex-row gap-2">
	<Button>Run Query</Button>
	<Button>Explore Data</Button>
	<Button>Visualize on Map</Button>
</div>
