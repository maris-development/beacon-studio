<!-- src/lib/components/modals/NoQueryAvailableModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import HammerIcon from '@lucide/svelte/icons/hammer';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { BeaconNode } from '@/beacon-api/types';
	import * as Select from '$lib/components/ui/select/index.js';
	import { t, translate } from '@/i18n';

	let { onCancel = () => {}, node }: { onCancel: (boolean) => void; node: BeaconNode } =
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
			message = translate('upload.table.nameMissing');
			return;
		}

		if (!selected_file_format) {
			message = translate('upload.table.formatMissing');
			return;
		}

		if (seperated_glob_paths.length === 0) {
			message = translate('upload.table.pathMissing');
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
		// console.log('Creating table with config:', json);
		try {
			const res = await fetch(`${node.url}/api/admin/create-table`, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${token}`,
					'Content-Type': 'application/json'
				},
				body: json
			});

			if (!res.ok) {
				const err = await res.text();
				// console.log('Upload failed:', err);
				throw new Error(err || translate('upload.failed'));
			}

			// console.log('Response:', res);

			const data = await res.json();
			message = translate('upload.table.created', { name: table_name });
			onCancel(true);
		} catch (err: any) {
			// console.log('Create error:', err);
			message = `❌ ${err.message}`;
		}
	}
</script>

<Modal title={$t('upload.table.title')} onClose={() => onCancel(false)} width="50vw">
	<div>
		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="username">{$t('upload.username')}</Label>
			<Input id="username" type="text" bind:value={username} required />
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="password">{$t('upload.password')}</Label>
			<Input id="password" type="password" bind:value={password} required />
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="table_name">{$t('upload.table.name')}</Label>
			<Input
				id="table_name"
				type="text"
				bind:value={table_name}
				required
				placeholder={$t('upload.example', { example: 'my_table' })}
			/>
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="glob_paths">{$t('upload.table.paths')}</Label>
			<Input
				id="glob_paths"
				type="text"
				bind:value={glob_paths}
				placeholder={$t('upload.example', { example: '/data/example*.parquet, /more_data/*.parquet' })}
			/>
			<p class="text-muted-foreground text-sm">
				{$t('upload.table.pathsHint')}
			</p>
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="file_format">{$t('upload.table.format')}</Label>
			<Select.Root type="single" name="file_format" bind:value={selected_file_format}>
				<Select.Trigger class="w-[180px]">
					{selected_file_format ? selected_file_format : $t('upload.table.formatPlaceholder')}
				</Select.Trigger>
				<Select.Content id="file_format_options">
					<Select.Label>{$t('upload.table.format')}</Select.Label>
					{#each file_formats as format}
						<Select.Item label={format} value={format} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<Button class="mt-4" onclick={createTable}>
			{$t('upload.table.title')}
			<HammerIcon class="mr-2 size-4" />
		</Button>

		{#if message}
			<p class="mt-4">{message}</p>
		{/if}
	</div>
</Modal>
