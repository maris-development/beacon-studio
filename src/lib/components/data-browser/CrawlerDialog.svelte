<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '@maris-development/beacon-client';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import FolderPicker from '@/components/data-browser/FolderPicker.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { DATASET_LIST_LIMIT } from '@/data-browser/datasets';
	import {
		CRAWLER_FORMATS,
		crawlerErrors,
		crawlerRequest,
		emptyCrawlerForm,
		folderHasFiles,
		formFromCrawler,
		tableNameExample,
		type Crawler,
		type CrawlerForm
	} from '@/data-browser/crawlers';

	type Props = {
		node: BeaconNode;
		crawler: Crawler | null;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onSaved: () => void;
	};

	let { node, crawler, loadPaths, onClose, onSaved }: Props = $props();

	function initialForm(): CrawlerForm {
		if (crawler) return formFromCrawler(crawler);
		return emptyCrawlerForm();
	}

	let editing = $derived(crawler !== null);

	let form: CrawlerForm = $state(initialForm());
	let errors: string[] = $state([]);
	let busy = $state(false);
	let paths: string[] | null = $state(null);

	let empty = $derived(
		paths !== null &&
			form.folder.trim() !== '' &&
			!folderHasFiles(form.folder, paths, paths.length >= DATASET_LIST_LIMIT)
	);

	onMount(() => {
		loadPaths().then(
			(value) => (paths = value),
			() => (paths = null)
		);
	});

	function toggleFormat(value: string) {
		if (form.formats.includes(value)) {
			form.formats = form.formats.filter((item) => item !== value);
		} else {
			form.formats = [...form.formats, value];
		}
	}

	async function save() {
		errors = crawlerErrors(form);
		if (errors.length > 0) return;

		busy = true;
		const body = crawlerRequest(form, editing);

		try {
			const done = await withAdmin(node, async (client) => {
				await client.admin.createCrawler(body);
				return true;
			});
			if (done) onSaved();
		} catch (caught) {
			if (caught instanceof ApiError && caught.status === 409) {
				errors = ['A crawler with this name exists.'];
			} else {
				errors = [adminErrorMessage(caught)];
			}
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={editing ? `Edit crawler ${form.name}` : 'New crawler'}
	{onClose}
	canCloseModal={!busy}
	width="640px"
>
	<div class="form">
		<div class="field">
			<Label for="crawler-name">Name</Label>
			<Input id="crawler-name" bind:value={form.name} disabled={editing} />
		</div>

		<div class="field">
			<Label for="crawler-folder">Folder</Label>
			<div class="row">
				<Input id="crawler-folder" bind:value={form.folder} placeholder="argo/" />
				<FolderPicker {loadPaths} onPick={(folder) => (form.folder = folder)} />
			</div>
			{#if empty}
				<span class="warning">This folder holds no files. The crawler creates no tables.</span>
			{/if}
		</div>

		<fieldset class="field">
			<legend>Formats</legend>
			<div class="checks">
				{#each CRAWLER_FORMATS as format (format.value)}
					<label>
						<input
							type="checkbox"
							checked={form.formats.includes(format.value)}
							onchange={() => toggleFormat(format.value)}
						/>
						{format.label}
					</label>
				{/each}
			</div>
			<span class="hint">None checked means all formats.</span>
		</fieldset>

		<fieldset class="field">
			<legend>Table names</legend>
			<label>
				<input type="radio" bind:group={form.naming} value="leaf_prefix" />
				Folder name
			</label>
			<label>
				<input type="radio" bind:group={form.naming} value="crawler_prefixed" />
				Crawler name + folder name
			</label>
			<span class="hint">Example: {tableNameExample(form)}</span>
		</fieldset>

		<label class="check">
			<input type="checkbox" bind:checked={form.detectPartitions} />
			Find partitions in folder names (key=value/)
		</label>

		<fieldset class="field">
			<legend>Schedule</legend>
			<label>
				<input type="radio" bind:group={form.scheduled} value={false} />
				Only on Run
			</label>
			<div class="row">
				<label>
					<input type="radio" bind:group={form.scheduled} value={true} />
					Every
				</label>
				<input
					class="every"
					type="number"
					min="1"
					step="1"
					bind:value={form.every}
					disabled={!form.scheduled}
				/>
				<select bind:value={form.unit} disabled={!form.scheduled}>
					<option value="seconds">seconds</option>
					<option value="minutes">minutes</option>
					<option value="hours">hours</option>
				</select>
			</div>
		</fieldset>

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

		{#each errors as message (message)}
			<p class="error" role="alert">{message}</p>
		{/each}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
		<Button onclick={save} disabled={busy}>Save</Button>
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
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.25rem;
		font-weight: 500;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.every {
		width: 5rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
	}

	select {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		background: var(--background);
	}

	.hint {
		color: var(--muted-foreground);
		font-size: 0.8125rem;
	}

	.warning,
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: 0.875rem;
	}

	.icon {
		display: flex;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
