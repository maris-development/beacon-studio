<!-- src/lib/components/modals/NoQueryAvailableModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import FilePlusIcon from '@lucide/svelte/icons/file-plus';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { BeaconInstance } from '@/stores/config';

	let { onCancel = () => {}, instance }: { onCancel: (boolean) => void; instance: BeaconInstance } =
		$props();
	let username = $state('');
	let password = $state('');
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

		const formData = new FormData();
		for (const file of files) {
			console.log('Appending file:', file.name);
			formData.append('files', file);
		}

		// Encode Basic Auth header
		const token = btoa(`${username}:${password}`);

		try {
			const res = await fetch(`${instance.url}/api/admin/upload-file`, {
				method: 'POST',
				headers: {
					Authorization: `Basic ${token}`
				},
				body: formData
			});

			if (!res.ok) {
				const err = await res.text();
				console.log('Upload failed:', err);
				throw new Error(err || 'Upload failed');
			}

			console.log('Response:', res);

			const data = await res.json();
			message = `✅ Uploaded ${data.uploaded.length} file(s)`;
		} catch (err: any) {
			console.log('Upload error:', err);
			message = `❌ ${err.message}`;
		} finally {
			uploading = false;
		}
	}
</script>

<Modal title="Upload Datasets" onClose={() => onCancel(false)} width="50vw">
	<div>
		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="username">Admin Username</Label>
			<Input id="username" type="text" bind:value={username} required />
		</div>

		<div class="mb-4 grid w-full items-center gap-1.5">
			<Label for="password">Admin Password</Label>
			<Input id="password" type="password" bind:value={password} required />
		</div>

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
