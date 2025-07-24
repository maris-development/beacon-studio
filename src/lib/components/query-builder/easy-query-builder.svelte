<script lang="ts">
	import { currentBeaconInstance, type BeaconInstance } from '$lib/stores/config';
	import { BeaconClient, type TableDefinition } from '@/beacon-api/client';
	import { onMount } from 'svelte';
	import type { PresetTableType } from '@/beacon-api/models/preset_table';

	// import * as Form from '$lib/components/ui/form/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { buttonVariants } from '$lib/components/ui/button/index.js';

	const output_formats = ['Parquet', 'CSV', 'JSON', 'Arrow', 'NetCDF'];

	let selected_output_format = $state(output_formats[0]);

	let easy_tables = $state<Array<TableDefinition>>([]);
	let selected_table_name = $state('');

	const selected_table_content_name = $derived(
		easy_tables.find((t) => t.table_name === selected_table_name)?.table_name ?? 'Select a table'
	);

	const selected_preset_table_type: PresetTableType = $derived.by(() => {
		let easy_table_type = easy_tables.find((t) => t.table_name === selected_table_name)?.table_type;
		if (easy_table_type === undefined || easy_table_type === null) {
			return null;
		}
		if ('preset' in easy_table_type) {
			// ‣ here TS knows table: { preset: PresetTableType }
			return easy_table_type.preset;
		}
		// extract preset table type from the easy_table_type
		return null;
	});

	let currentBeaconInstanceValue: BeaconInstance | null = $state(null);
	let client: BeaconClient;

	onMount(() => {
		currentBeaconInstanceValue = $currentBeaconInstance;
		client = BeaconClient.new(currentBeaconInstanceValue);

		onAsyncMount();

		return () => {};
	});

	async function onAsyncMount() {
		let preset_tables = await client.getPresetTables();

		easy_tables = preset_tables;

		// By default, select the first table if available
		if (easy_tables.length > 0) {
			selected_table_name = easy_tables[0].table_name;
		}
	}
</script>

<h1>Beacon Query Builder</h1>
<Label for="dataCollection">Selected Data Collection</Label>
<Select.Root type="single" name="dataCollection" bind:value={selected_table_name}>
	<Select.Trigger class="w-[180px]">
		{selected_table_name}
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
<div>
	<h2 class="text-lg font-medium">Query Parameters</h2>
	{#if selected_preset_table_type === null}
		<div class="mt-4 text-sm text-gray-500">
			<p>Select a table to see available query parameters.</p>
		</div>
	{:else}
		<div class="mt-4 grid gap-4">
			<Collapsible.Root class="w-[350px] space-y-2" open>
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">Data Columns</h4>
					<Collapsible.Trigger
						class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
					>
						<ChevronsUpDownIcon />
						<span class="sr-only">Toggle</span>
					</Collapsible.Trigger>
				</div>
				<Collapsible.Content class="space-y-2">
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@huntabyte/bits-ui</div>
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@melt-ui/melt-ui</div>
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@sveltejs/svelte</div>
				</Collapsible.Content>
			</Collapsible.Root>

			{#each selected_preset_table_type.data_columns as param (param.column_name)}
				<div class="flex items-center gap-2">
					<Label
						class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
					>
						<Checkbox
							id={param.column_name}
							class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
						/>
						<div class="grid gap-2">
							<Label for={param.column_name} class="text-lg font-medium"
								>{param.alias}
								{#each Object.entries(param) as [field, value] (field)}
									{#if field !== 'alias' && field !== 'column_name'}
										<div class="text-sm text-gray-500">
											<strong>{field}:</strong>
											{value}
										</div>
									{/if}
								{/each}
							</Label>
						</div>
					</Label>
				</div>
			{/each}

			<Collapsible.Root class="w-[350px] space-y-2">
				<div class="flex items-center justify-between">
					<h4 class="text-sm font-semibold">Metadata Columns</h4>
					<Collapsible.Trigger
						class={buttonVariants({ variant: 'default', size: 'sm', class: 'w-9 p-0' })}
					>
						<ChevronsUpDownIcon />
						<span class="sr-only">Toggle</span>
					</Collapsible.Trigger>
				</div>
				<Collapsible.Content class="space-y-2">
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@huntabyte/bits-ui</div>
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@melt-ui/melt-ui</div>
					<div class="rounded-md border px-4 py-3 font-mono text-sm">@sveltejs/svelte</div>
				</Collapsible.Content>
			</Collapsible.Root>

			<Collapsible.Root>
				<Collapsible.Trigger>Metadata Columns</Collapsible.Trigger>
				<Collapsible.Content>
					{#each selected_preset_table_type.metadata_columns as param (param.column_name)}
						<div class="flex items-center gap-2">
							<Label
								class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
							>
								<Checkbox
									id={param.column_name}
									class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
								/>
								<div class="grid gap-2">
									<Label for={param.column_name} class="text-lg font-medium"
										>{param.alias}
										{#each Object.entries(param) as [field, value] (field)}
											{#if field !== 'alias' && field !== 'column_name'}
												<span class="text-sm text-gray-500">
													<strong>{field}:</strong>
													{value}
												</span>
											{/if}
										{/each}
									</Label>
								</div>
							</Label>
						</div>
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		</div>
	{/if}

	<!-- <div class="mt-8 flex items-start gap-4">
		<Checkbox id="terms-2" checked={false} />
		<div class="grid gap-2">
			<Label for="terms-2">Temperature</Label>
			<p class="text-muted-foreground text-sm">
				By clicking this checkbox, you agree to the terms and conditions.
			</p>
		</div>
	</div> -->
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
