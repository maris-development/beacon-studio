<!-- src/lib/components/modals/NoQueryAvailableModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { BeaconNode } from '@/beacon-api/types';
	import { adminErrorMessage, withAdmin } from '@/services/admin-session';
	import { addToast } from '@/stores/toasts';

	let { onCancel = () => {}, node }: { onCancel: (uploaded: boolean) => void; node: BeaconNode } =
		$props();
	let files: FileList | null = $state(null);
	let progress = $state(0);
	let message = $state('');
	let uploading = $state(false);

	async function uploadFiles() {
		if (!files || files.length === 0) {
			message = 'Please select files.';
			return;
		}

		uploading = true;
		message = '';
		progress = 0;

		const list = Array.from(files);
		const totalBytes = list.reduce((sum, file) => sum + file.size, 0);
		let doneBytes = 0;
		let done = 0;

		try {
			for (const file of list) {
				const result = await withAdmin(node, (client) =>
					client.admin.uploadDataset(file.name, file, {
						onProgress: ({ uploaded }) => {
							progress = Math.round(((doneBytes + uploaded) / totalBytes) * 100);
						}
					})
				);

				if (result === null) {
					message = 'Upload cancelled.';
					return;
				}

				doneBytes += file.size;
				done += 1;
				progress = Math.round((doneBytes / totalBytes) * 100);
			}

			message = `Uploaded ${done} file(s).`;
		} catch (error) {
			addToast({ type: 'error', message: adminErrorMessage(error) });
			message = `Uploaded ${done} of ${list.length} file(s).`;
		} finally {
			uploading = false;
		}
	}
</script>

<Modal title="Upload Datasets" onClose={() => onCancel(false)} width="50vw">
	<div>
		<div class="grid w-full max-w-sm items-center gap-1.5">
			<Label for="dataset">Dataset</Label>
			<Input id="dataset" type="file" multiple bind:files required />
		</div>

		{#if files?.length}
			<ul class="text-muted-foreground mt-2 list-inside list-disc text-sm">
				{#each Array.from(files) as f}
					<li>{f.name} ({Math.round(f.size / 1024)} KB)</li>
				{/each}
			</ul>
		{/if}

		<Button class="mt-4" type="submit" disabled={uploading || !files?.length} onclick={uploadFiles}>
			{#if uploading}
				Uploading... {progress}%
			{:else}
				Upload
			{/if}
			<FilePlusIcon class="mr-2 size-4" />
		</Button>
	</div>

	{#if message}
		<p class="mt-4">{message}</p>
	{/if}
</Modal>
