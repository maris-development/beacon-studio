<!-- src/lib/components/modals/NoQueryAvailableModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import HammerIcon from '@lucide/svelte/icons/hammer';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { BeaconInstance } from '@/stores/config';
	import * as Select from '$lib/components/ui/select/index.js';

	let { onCancel = () => {}, instance }: { onCancel: (boolean) => void; instance: BeaconInstance } =
		$props();
	let username = $state('');
	let password = $state('');
	let table_name: string | null = $state(null);
	let file_formats = ['bbf', 'arrow', 'parquet', 'netcdf'];
	let selected_file_format: string | null = $state(null);
	let glob_paths: string = $state('');

	let files: FileList | null = $state(null);
	let progress = $state(0);
	let message = $state('');
	let uploading = $state(false);

	async function createTable() {
		let seperated_glob_paths = glob_paths
			.split(',')
			.map((path) => path.trim())
			.filter((path) => path.length > 0);

		if (!table_name) {
			message = 'Please enter a table name.';
			return;
		}

		if (!selected_file_format) {
			message = 'Please select a file format.';
			return;
		}

		if (seperated_glob_paths.length === 0) {
			message = 'Please enter at least one glob path.';
			return;
		}

		let table_config = {
			table_name: table_name,
			table_type: {
				logical: {
					paths: seperated_glob_paths,
					file_format: selected_file_format
				}
			}
		};

		// Encode Basic Auth header
		const token = btoa(`${username}:${password}`);
		let json = JSON.stringify(table_config, null, 2);
		console.log('Creating table with config:', json);
		try {
			const res = await fetch(`${instance.url}/api/admin/create-table`, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${token}`,
					'Content-Type': 'application/json'
				},
				body: json
			});

			if (!res.ok) {
				const err = await res.text();
				console.log('Upload failed:', err);
				throw new Error(err || 'Upload failed');
			}

			console.log('Response:', res);

			const data = await res.json();
			message = `✅ Created table ${table_name}`;
			onCancel(true);
		} catch (err: any) {
			console.log('Create error:', err);
			message = `❌ ${err.message}`;
		}
	}
</script>

<Modal title="Create Table" onClose={() => onCancel(false)} width="50vw">
	<div>
		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="username">Admin Username</Label>
			<Input id="username" type="text" bind:value={username} required />
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="password">Admin Password</Label>
			<Input id="password" type="password" bind:value={password} required />
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="table_name">Table Name</Label>
			<Input
				id="table_name"
				type="text"
				bind:value={table_name}
				required
				placeholder="e.g. my_table"
			/>
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="glob_paths">Glob Paths</Label>
			<Input
				id="glob_paths"
				type="text"
				bind:value={glob_paths}
				placeholder="e.g. /data/example*.parquet, /more_data/*.parquet"
			/>
			<p class="text-muted-foreground text-sm">
				You can specify multiple paths separated by commas.
			</p>
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="file_format">File Format</Label>
			<Select.Root type="single" name="file_format" bind:value={selected_file_format}>
				<Select.Trigger class="w-[180px]">
					{selected_file_format ? selected_file_format : 'Select a file format'}
				</Select.Trigger>
				<Select.Content id="file_format_options">
					<Select.Label>File Format</Select.Label>
					{#each file_formats as format}
						<Select.Item label={format} value={format} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<Button class="mt-4" onclick={createTable}>
			Create Table
			<HammerIcon class="mr-2 size-4" />
		</Button>

		{#if message}
			<p class="mt-4">{message}</p>
		{/if}
	</div>
</Modal>
