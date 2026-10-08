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
	import { t, type Message } from '@/i18n';

	type Props = {
		node: BeaconNode;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onCreated: (name: string) => void;
	};

	let { node, loadPaths, onClose, onCreated }: Props = $props();

	// A path is the same in every language.
	const LOCATION_EXAMPLE = 'argo/**/*.nc';

	let form: ExternalTableForm = $state({
		name: '',
		location: '',
		fileType: 'PARQUET',
		partitionCols: '',
		options: [],
		ifNotExists: false
	});
	let busy = $state(false);
	let errors: Message[] = $state([]);
	// The raw text of a server error.
	let serverError = $state('');

	let hint = $derived(FILE_TYPES.find((type) => type.value === form.fileType)?.hint ?? null);
	let requestJson = $derived(JSON.stringify(externalTableSpec(form), null, 2));

	async function create() {
		errors = externalTableErrors(form);
		serverError = '';
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
			serverError = adminErrorMessage(caught);
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={$t('dataBrowser.tables.external.title')}
	{onClose}
	canCloseModal={!busy}
	width="640px"
>
	<div class="form">
		<div class="field">
			<Label for="ext-name">{$t('common.name')}</Label>
			<Input id="ext-name" bind:value={form.name} />
		</div>

		<div class="field">
			<Label for="ext-type">{$t('dataBrowser.tables.external.fileType')}</Label>
			<select id="ext-type" bind:value={form.fileType}>
				{#each FILE_TYPES as type (type.value)}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>
			{#if hint}
				<span class="hint">{$t(hint)}</span>
			{/if}
		</div>

		<div class="field">
			<Label for="ext-location">{$t('dataBrowser.tables.external.location')}</Label>
			<div class="row">
				<Input id="ext-location" bind:value={form.location} placeholder={LOCATION_EXAMPLE} />
				<FolderPicker {loadPaths} onPick={(folder) => (form.location = `${folder}**/*`)} />
			</div>
			<span class="hint">{$t('dataBrowser.tables.external.locationHint')}</span>
		</div>

		<div class="field">
			<Label for="ext-partitions">{$t('dataBrowser.tables.external.partitions')}</Label>
			<Input
				id="ext-partitions"
				bind:value={form.partitionCols}
				placeholder={$t('dataBrowser.tables.external.partitionsPlaceholder')}
			/>
		</div>

		<div class="field">
			<Label>{$t('dataBrowser.tables.external.options')}</Label>
			{#each form.options as option, index (index)}
				<div class="row">
					<Input
						placeholder={$t('dataBrowser.tables.external.optionKey')}
						bind:value={option.key}
					/>
					<Input
						placeholder={$t('dataBrowser.tables.external.optionValue')}
						bind:value={option.value}
					/>
					<button
						type="button"
						class="icon"
						aria-label={$t('dataBrowser.tables.external.removeOption')}
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
					{$t('dataBrowser.tables.external.addOption')}
				</Button>
			</div>
		</div>

		<label class="check">
			<input type="checkbox" bind:checked={form.ifNotExists} />
			{$t('dataBrowser.tables.external.ifNotExists')}
		</label>

		<details>
			<summary>{$t('dataBrowser.tables.external.request')}</summary>
			<pre>{requestJson}</pre>
		</details>

		{#each errors as error (error.key)}
			<p class="error" role="alert">{$t(error)}</p>
		{/each}
		{#if serverError}
			<p class="error" role="alert">{serverError}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>{$t('common.cancel')}</Button>
		<Button onclick={create} disabled={busy}>{$t('dataBrowser.tables.create')}</Button>
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
		font-size: var(--font-size-sm);
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
		font-size: var(--font-size-xs);
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
