<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import FolderPicker from '@/components/data-browser/FolderPicker.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import {
		FILE_TYPES,
		externalTableErrors,
		externalTableSpec,
		type ExternalTableForm
	} from '@/data-browser/external-table';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';

	type Props = {
		node: BeaconNode;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onCreated: (name: string) => void;
	};

	let { node, loadPaths, onClose, onCreated }: Props = $props();

	let form: ExternalTableForm = $state({
		name: '',
		location: '',
		fileType: 'PARQUET',
		partitionCols: '',
		options: [],
		ifNotExists: false
	});
	let busy = $state(false);
	let errors: string[] = $state([]);

	let hint = $derived(FILE_TYPES.find((type) => type.value === form.fileType)?.hint ?? '');
	let requestJson = $derived(JSON.stringify(externalTableSpec(form), null, 2));

	async function create() {
		errors = externalTableErrors(form);
		if (errors.length > 0) return;

		busy = true;

		try {
			const spec = externalTableSpec(form);
			const done = await withAdmin(node, async (client) => {
				await client.admin.createExternalTable(spec);
				return true;
			});
			if (done) onCreated(form.name.trim());
		} catch (caught) {
			errors = [adminErrorMessage(caught)];
		} finally {
			busy = false;
		}
	}
</script>

<Modal title="Create external table" {onClose} canCloseModal={!busy} width="640px">
	<div class="form">
		<div class="field">
			<Label for="ext-name">Name</Label>
			<Input id="ext-name" bind:value={form.name} />
		</div>

		<div class="field">
			<Label for="ext-type">File type</Label>
			<select id="ext-type" bind:value={form.fileType}>
				{#each FILE_TYPES as type (type.value)}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>
			<span class="hint">{hint}</span>
		</div>

		<div class="field">
			<Label for="ext-location">Location</Label>
			<div class="row">
				<Input id="ext-location" bind:value={form.location} placeholder="argo/**/*.nc" />
				<FolderPicker {loadPaths} onPick={(folder) => (form.location = `${folder}**/*`)} />
			</div>
			<span class="hint">A path or glob in the datasets store. A picked folder ends in **/*.</span>
		</div>

		<div class="field">
			<Label for="ext-partitions">Partition columns</Label>
			<Input id="ext-partitions" bind:value={form.partitionCols} placeholder="year, month" />
		</div>

		<div class="field">
			<Label>Options</Label>
			{#each form.options as option, index (index)}
				<div class="row">
					<Input placeholder="key" bind:value={option.key} />
					<Input placeholder="value" bind:value={option.value} />
					<button
						type="button"
						class="icon"
						aria-label="Remove option"
						onclick={() => form.options.splice(index, 1)}
					>
						<XIcon class="size-4" />
					</button>
				</div>
			{/each}
			<div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => form.options.push({ key: '', value: '' })}
				>
					<PlusIcon />
					Add option
				</Button>
			</div>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={form.ifNotExists} />
			Only if it does not exist
		</label>

		<details>
			<summary>Request</summary>
			<pre>{requestJson}</pre>
		</details>

		{#each errors as message (message)}
			<p class="error" role="alert">{message}</p>
		{/each}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
		<Button onclick={create} disabled={busy}>Create</Button>
	</div>
</Modal>

<style lang="scss">
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.375rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--background);
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.icon {
		display: flex;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	pre {
		padding: 0.5rem;
		overflow: auto;
		border-radius: 0.375rem;
		background: var(--secondary);
		font-size: 0.75rem;
	}

	.error {
		margin: 0;
		color: var(--destructive);
		white-space: pre-wrap;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
