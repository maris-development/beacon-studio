<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '@maris-development/beacon-client';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import FolderPicker from '@/components/data-browser/FolderPicker.svelte';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { splitNodeUrl } from '@/services/beacon-node-url';
	import { DATASET_LIST_LIMIT } from '@/data-browser/datasets';
	import {
		CRAWLER_FORMATS,
		crawlerErrors,
		crawlerRequest,
		describeNaming,
		emptyCrawlerForm,
		folderHasFiles,
		formFromCrawler,
		tableNameExample,
		type Crawler,
		type CrawlerForm,
		type TableNaming
	} from '@/data-browser/crawlers';
	import { message, t, type Message } from '@/i18n';

	type Props = {
		node: BeaconNode;
		crawler: Crawler | null;
		loadPaths: () => Promise<string[]>;
		onClose: () => void;
		onSaved: () => void;
	};

	let { node, crawler, loadPaths, onClose, onSaved }: Props = $props();

	const NAMINGS: TableNaming[] = ['leaf_prefix', 'crawler_prefixed'];

	function initialForm(): CrawlerForm {
		if (crawler) return formFromCrawler(crawler);
		return emptyCrawlerForm();
	}

	let editing = $derived(crawler !== null);

	let form: CrawlerForm = $state(initialForm());
	let errors: Message[] = $state([]);
	// The raw server text of a failed save.
	let failure = $state('');
	let busy = $state(false);
	let paths: string[] | null = $state(null);

	let empty = $derived(
		paths !== null &&
			form.folder.trim() !== '' &&
			!folderHasFiles(form.folder, paths, paths.length >= DATASET_LIST_LIMIT)
	);
	let endpoint = $derived(`POST ${splitNodeUrl(node.url).pathPrefix}/api/admin/crawlers`);
	let payload = $derived(JSON.stringify(crawlerRequest(form, editing), null, 2));

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
		failure = '';
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
				errors = [message('dataBrowser.crawlers.error.exists')];
			} else {
				failure = adminErrorMessage(caught);
			}
		} finally {
			busy = false;
		}
	}
</script>

<Modal
	title={editing
		? $t('dataBrowser.crawlers.dialog.editTitle', { name: form.name })
		: $t('dataBrowser.crawlers.newCrawler')}
	subtitle={endpoint}
	{onClose}
	canCloseModal={!busy}
	width="640px"
>
	<div class="form">
		<div class="field">
			<Label for="crawler-name">
				{$t('common.name')}<span class="required" aria-hidden="true">*</span>
			</Label>
			<Input
				id="crawler-name"
				bind:value={form.name}
				required
				disabled={editing}
				placeholder={$t('dataBrowser.crawlers.dialog.namePlaceholder')}
			/>
		</div>

		<div class="field">
			<Label for="crawler-folder">
				{$t('dataBrowser.crawlers.dialog.folder')}<span class="required" aria-hidden="true">*</span>
			</Label>
			<div class="row">
				<Input
					id="crawler-folder"
					bind:value={form.folder}
					required
					placeholder={$t('dataBrowser.crawlers.dialog.folderPlaceholder')}
				/>
				<FolderPicker {loadPaths} onPick={(folder) => (form.folder = folder)} />
			</div>
			<span class="hint">{$t('dataBrowser.crawlers.dialog.folderHint')}</span>
			{#if empty}
				<span class="warning">{$t('dataBrowser.crawlers.dialog.emptyFolder')}</span>
			{/if}
		</div>

		<fieldset class="field">
			<legend>{$t('dataBrowser.crawlers.dialog.formats')}</legend>
			<div class="checks">
				{#each CRAWLER_FORMATS as format (format.value)}
					<label class="check">
						<input
							type="checkbox"
							checked={form.formats.includes(format.value)}
							onchange={() => toggleFormat(format.value)}
						/>
						{format.label}
					</label>
				{/each}
			</div>
			<span class="hint">{$t('dataBrowser.crawlers.dialog.formatsHint')}</span>
		</fieldset>

		<div class="pair">
			<div class="field">
				<Label for="crawler-naming">{$t('dataBrowser.crawlers.field.naming')}</Label>
				<select id="crawler-naming" bind:value={form.naming}>
					{#each NAMINGS as naming (naming)}
						<option value={naming}>
							{$t('dataBrowser.crawlers.dialog.namingOption', {
								naming: $t(describeNaming(naming)),
								example: tableNameExample({ ...form, naming })
							})}
						</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<Label for="crawler-timer">{$t('dataBrowser.crawlers.dialog.timer')}</Label>
				<Input
					id="crawler-timer"
					type="number"
					min="60"
					step="1"
					bind:value={form.timer}
					placeholder={$t('dataBrowser.crawlers.dialog.timerPlaceholder')}
				/>
				<span class="hint">{$t('dataBrowser.crawlers.dialog.timerHint')}</span>
			</div>
		</div>

		<div class="toggles">
			<label class="check">
				<input type="checkbox" bind:checked={form.detectPartitions} />
				{$t('dataBrowser.crawlers.dialog.partitions')}
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={form.eventDriven} />
				{$t('dataBrowser.crawlers.dialog.eventDriven')}
			</label>
		</div>

		<div class="field">
			<Label for="crawler-options">{$t('dataBrowser.crawlers.dialog.options')}</Label>
			<textarea
				id="crawler-options"
				class="mono"
				rows="4"
				spellcheck="false"
				bind:value={form.optionsText}
				placeholder={$t('dataBrowser.crawlers.dialog.optionsPlaceholder')}
			></textarea>
			<span class="hint">{$t('dataBrowser.crawlers.dialog.optionsHint')}</span>
		</div>

		<details class="payload">
			<summary>{$t('dataBrowser.crawlers.dialog.payload')}</summary>
			<pre class="mono">{payload}</pre>
		</details>

		<!-- Two bad option lines give the same key, so the list keys by index. -->
		{#each errors as error, index (index)}
			<p class="error" role="alert">{$t(error)}</p>
		{/each}
		{#if failure}
			<p class="error" role="alert">{failure}</p>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={onClose} disabled={busy}>{$t('common.cancel')}</Button>
		<Button onclick={save} disabled={busy}>
			{#if editing}
				{$t('common.save')}
			{:else}
				<PlusIcon />
				{$t('dataBrowser.crawlers.dialog.create')}
			{/if}
		</Button>
	</div>
</Modal>

<style lang="scss">
	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: grid;
		align-content: start;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.375rem;
		font-weight: 500;
	}

	.required {
		margin-left: 0.125rem;
		color: var(--destructive);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;

		@media (max-width: 480px) {
			grid-template-columns: 1fr;
		}
	}

	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}

	.toggles {
		display: grid;
		gap: 0.375rem;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	select,
	textarea {
		width: 100%;
		border: 1px solid var(--input);
		border-radius: calc(var(--radius) - 2px);
		background: var(--card);
	}

	// The same size as `Input`.
	select {
		height: 2.25rem;
		padding: 0.25rem 0.75rem;
		font-size: var(--font-size-md);

		@media (min-width: 768px) {
			font-size: var(--font-size-sm);
		}
	}

	textarea {
		padding: 0.5rem 0.75rem;
		font-size: var(--font-size-sm);
		resize: vertical;
	}

	.payload {
		summary {
			color: var(--muted-foreground);
			font-size: var(--font-size-sm);
			font-weight: 500;
			cursor: pointer;
		}

		pre {
			max-height: 16rem;
			margin: 0.5rem 0 0;
			padding: 0.5rem 0.75rem;
			overflow: auto;
			border: 1px solid var(--border);
			border-radius: calc(var(--radius) - 2px);
			background: var(--muted);
			font-size: var(--font-size-xs);
		}
	}

	.hint {
		color: var(--muted-foreground);
		font-size: var(--font-size-sm);
	}

	.warning,
	.error {
		margin: 0;
		color: var(--destructive);
		font-size: var(--font-size-sm);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
