<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '@/components/modals/Modal.svelte';
	import Button from '@/components/buttons/Button.svelte';
	import { Input } from '@/components/ui/input';
	import { Label } from '@/components/ui/label';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { resolve } from '$app/paths';
	import { settings } from '@/stores/settings';
	import { filesFromDrop, filesFromInput, type PickedFile } from './dropped-files';
	import {
		isHiddenPath,
		planUpload,
		resumeItems,
		retarget,
		retryItems,
		uploadProgress,
		uploadSummary,
		type UploadItem
	} from '@/data-browser/upload';
	import { formatSize } from '@/data-browser/datasets';
	import { formatNumber, t } from '@/i18n';

	type Props = { node: BeaconNode; folder: string; onClose: () => void; onUploaded: () => void };

	let { node, folder, onClose, onUploaded }: Props = $props();

	let destination = $state(folder);
	let overwrite = $state(false);
	let picked: PickedFile[] = $state([]);
	let items: UploadItem[] = $state([]);
	let running = $state(false);
	let finished = $state(false);
	let dragOver = $state(false);
	let controller: AbortController | null = null;

	let progress = $derived(uploadProgress(items));
	let summary = $derived(uploadSummary(items));

	let skippedHidden = $state(0);

	function setPicked(files: PickedFile[]) {
		const visible = files.filter((entry) => !isHiddenPath(entry.relativePath));
		skippedHidden = files.length - visible.length;
		picked = visible;
		items = planUpload(
			destination,
			visible.map((entry) => ({ relativePath: entry.relativePath, size: entry.file.size }))
		);
		finished = false;
	}

	async function onDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		if (running) return;
		setPicked(await filesFromDrop(event));
	}

	function onPick(event: Event & { currentTarget: HTMLInputElement }) {
		const list = event.currentTarget.files;
		if (list) setPicked(filesFromInput(list));
	}

	function update(id: number, patch: Partial<UploadItem>) {
		items = items.map((item) => {
			if (item.id !== id) return item;
			return { ...item, ...patch };
		});
	}

	async function start() {
		if (running || items.length === 0) return;

		items = retarget(items, destination);

		running = true;
		controller = new AbortController();
		const signal = controller.signal;

		try {
			for (const item of items) {
				// Stopped and failed files wait for Continue or Retry failed.
				if (item.status !== 'waiting') continue;
				if (signal.aborted) break;

				update(item.id, { status: 'uploading', uploaded: 0, error: '' });
				const file = picked[item.id].file;

				try {
					const result = await withAdmin(node, (client) =>
						client.admin.uploadDataset(item.target, file, {
							overwrite,
							signal,
							onProgress: ({ uploaded }) => update(item.id, { uploaded })
						})
					);

					if (result === null) {
						update(item.id, { status: 'stopped', uploaded: 0 });
						break;
					}

					update(item.id, { status: 'done', uploaded: item.size });
				} catch (caught) {
					if (signal.aborted) {
						update(item.id, { status: 'stopped', uploaded: 0 });
						break;
					}
					update(item.id, { status: 'failed', error: adminErrorMessage(caught) });
				}
			}
		} finally {
			running = false;
			controller = null;
			// The files after a stop never started, so they count as stopped too.
			if (signal.aborted) {
				items = items.map((item) => {
					if (item.status !== 'waiting') return item;
					return { ...item, status: 'stopped' };
				});
			}
			finished =
				items.length > 0 &&
				items.every((item) => item.status === 'done' || item.status === 'failed');
			if (uploadSummary(items).done > 0) onUploaded();
		}
	}

	function stop() {
		controller?.abort();
	}

	function retry() {
		items = retryItems(items);
		void start();
	}

	function resume() {
		items = resumeItems(items);
		void start();
	}

	let hasStopped = $derived(items.some((item) => item.status === 'stopped'));

	function close() {
		stop();
		onClose();
	}

	onDestroy(stop);
</script>

<Modal title={$t('dataBrowser.upload.title')} onClose={close} width="680px">
	<div class="form">
		<div class="field">
			<Label for="upload-dest">{$t('dataBrowser.upload.destination')}</Label>
			<Input
				id="upload-dest"
				bind:value={destination}
				placeholder={$t('dataBrowser.upload.destinationPlaceholder')}
				disabled={running}
			/>
		</div>

		<div
			class="drop"
			class:over={dragOver}
			role="region"
			aria-label={$t('dataBrowser.upload.dropRegion')}
			ondragover={(event) => {
				event.preventDefault();
				dragOver = true;
			}}
			ondragleave={() => (dragOver = false)}
			ondrop={onDrop}
		>
			<p>{$t('dataBrowser.upload.dropText')}</p>
			<div class="pickers">
				<label class="pick">
					{$t('dataBrowser.upload.pickFiles')}
					<input type="file" multiple disabled={running} onchange={onPick} />
				</label>
				<label class="pick">
					{$t('dataBrowser.upload.pickFolder')}
					<input type="file" webkitdirectory disabled={running} onchange={onPick} />
				</label>
			</div>
		</div>

		{#if skippedHidden > 0}
			<p class="muted">{$t('dataBrowser.upload.skippedHidden', { count: skippedHidden })}</p>
		{/if}

		<label class="check">
			<input type="checkbox" bind:checked={overwrite} disabled={running} />
			{$t('dataBrowser.upload.replace')}
		</label>

		{#if items.length > 0}
			<div class="bar" aria-label={$t('dataBrowser.upload.progress')}>
				<span style="width: {progress}%"></span>
			</div>
			<p class="muted">
				{#if summary.failed > 0}
					{$t('dataBrowser.upload.summaryFailed', summary)}
				{:else}
					{$t('dataBrowser.upload.summary', summary)}
				{/if}
			</p>

			<ul class="items">
				{#each items as item (item.id)}
					<li class={item.status}>
						<span class="path">{item.target}</span>
						<span class="size">{formatSize(item.size, $formatNumber)}</span>
						<span class="status">
							{#if item.status === 'failed'}
								{item.error}
							{:else}
								{$t(`dataBrowser.upload.status.${item.status}`)}
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if finished && summary.done > 0}
			<div class="muted next">
				<p>{$t('dataBrowser.upload.next.intro')}</p>
				<ul>
					{#if $settings.adminFeatures}
						<li>
							<a href={resolve('/data-browser/crawlers')}>{$t('dataBrowser.upload.next.crawler')}</a>
						</li>
					{/if}
					<li>
						{$t('dataBrowser.upload.next.tableBefore')}
						<!-- The text after the link holds its own leading space, so a language can end on "." -->
						<a href={resolve('/data-browser/data-tables')}>{$t('nav.item.dataTables')}</a
						>{$t('dataBrowser.upload.next.tableAfter')}
					</li>
				</ul>
			</div>
		{/if}
	</div>

	<div slot="footer" class="actions">
		<Button variant="outline" onclick={close}>{$t('common.close')}</Button>
		{#if running}
			<Button variant="destructive" onclick={stop}>{$t('dataBrowser.upload.stop')}</Button>
		{:else if hasStopped}
			<Button onclick={resume}>{$t('common.continue')}</Button>
		{:else if summary.failed > 0}
			<Button onclick={retry}>{$t('dataBrowser.upload.retry')}</Button>
		{:else}
			<Button onclick={start} disabled={items.length === 0 || finished}>
				{$t('dataBrowser.upload.start')}
			</Button>
		{/if}
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

	.drop {
		padding: 1rem;
		border: 2px dashed var(--border);
		border-radius: 0.5rem;
		text-align: center;

		&.over {
			border-color: var(--primary);
			background: var(--accent);
		}

		p {
			margin: 0 0 0.5rem;
		}
	}

	.pickers {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
	}

	.pick {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		cursor: pointer;

		input {
			display: none;
		}
	}

	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.bar {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 0.25rem;
		background: var(--secondary);

		span {
			display: block;
			height: 100%;
			background: var(--primary);
			transition: width 0.2s;
		}
	}

	.items {
		max-height: 14rem;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
		font-size: var(--font-size-sm);

		li {
			display: grid;
			grid-template-columns: 1fr auto 8rem;
			gap: 0.5rem;
			padding: 0.25rem 0;
			border-bottom: 1px solid var(--border);

			&.failed .status {
				color: var(--destructive);
			}

			&.done .status {
				color: var(--muted-foreground);
			}
		}
	}

	.path {
		word-break: break-all;
	}

	.size,
	.muted {
		color: var(--muted-foreground);
	}

	.next {
		p {
			margin: 0;
		}

		ul {
			margin: 0.25rem 0 0;
			padding-left: 1.25rem;
			list-style: disc;
		}
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
